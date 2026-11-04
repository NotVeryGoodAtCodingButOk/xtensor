# Handoff B (backend)

- **Rama:** `worktree-agent-a8823bacd93bd3cc5`
- **Worktree:** `/Users/simonb/xtensor/.claude/worktrees/agent-a8823bacd93bd3cc5`
- **Base:** `b39340f` (hice fast-forward desde `953ddd3` al empezar).
- **Verificación:** `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` en verde: 22 archivos y 187 tests. Los tests de paridad con Excel de `calculations.test.ts` pasan sin cambios.
- No hice push ni deploy.

---

## 1. Diagnóstico de la Reestimada (solo lectura)

Corrí `corepack pnpm tsx scripts/check-reestimated.ts` el 2026-11-03 a las 18:27 (hora de Bogotá). El script usa el mismo cálculo que el tablero admin.

**Datos:**
- Hay 26 máquinas en cola, con posiciones 1..N sin huecos.
- **En ninguna coinciden la Reestimada y la Actualizada.**
  - 21 tienen la Actualizada *después* de la Reestimada.
  - 5 la tienen *antes*.
- Las posiciones 1–12 tienen la Reestimada entre el 28 y el 30 de octubre, y la Actualizada entre el 3 y el 5 de noviembre.
- Las 26 filas tienen el mismo `updated_at` (2026-11-03 21:53:31.43 UTC). Ese valor coincide con una máquina enviada a «Propias en Espera» a las 21:53:31.03, que llamó a `normalizeProductionQueue`.

**`vercel logs`:** busqué «reestimada» y errores de los últimos 7 y 14 días en producción. Las dos veces respondió «No logs found» (probablemente por la retención del plan). No encontré evidencia de fallos.

**Hipótesis sobre la causa.** El código sí tomaba la Reestimada al reordenar. Evidencia: la máquina 145 entró a la cola el 26 de octubre y está en la posición 3 con Reestimada del 28 de octubre, así que se tomó al subirla. Pero había cuatro huecos:

1. **No era atómico.** Primero corría la RPC del orden. Luego se volvía a leer la cola y se hacía un UPDATE por máquina en paralelo. Si algo fallaba en ese segundo paso, el orden quedaba guardado y la Reestimada no, y el error no se recuperaba nunca. Los reordenamientos siguientes solo vuelven a tomar las máquinas cuyo índice cambia.
2. **Cuando una máquina sale de la cola** (terminar, despachar, Propias en Espera, borrar), `normalizeProductionQueue` corre a las demás pero no toca su Reestimada.
   - Esto es intencional: esas máquinas se adelantan y no se marcan atrasadas.
   - Pero se ve como «la Reestimada no se mueve».
   - Es lo que pasó hoy a las 21:53.
3. **`bulkSendToProduction` y las demás entradas** solo tomaban la Reestimada de la máquina que entraba, no de las que desplazaba.
4. **Solo se vuelven a tomar las máquinas cuyo índice cambia.** Si el dueño mueve la máquina 21 a la posición 19, las filas 1–18 y 22–26 conservan su Reestimada vieja. En las posiciones 1–12 esa Reestimada tiene una semana.

**Lectura de negocio.** Las Reestimadas de las posiciones 1–12 tienen una semana, y la Actualizada se ha corrido unos 4 o 5 días hábiles. Eso es **atraso real** contra el modelo de capacidad (6 operarios × 9,25 h = 55,5 h/día), y es justo lo que la Reestimada debe mostrar. Con «horas máximas vs. llevadas» el dueño podrá ver si el modelo de capacidad está bien.

**Arreglo (commit `b06fb93`):**
- El orden y la Reestimada se guardan en una sola RPC (`reorder_production_queue`).
- Todas las entradas a la cola (enviar a producción, en lote o una sola, reproceso, garantía, crear) también toman la Reestimada de las máquinas que desplazan.
- Cambiar un % o el costo hora vuelve a tomar la Reestimada de toda la cola.

**Hallazgo aparte, sin arreglar porque está fuera de alcance:**
- `estimateDeliveryDate` usa la hora local del servidor. En Vercel es UTC.
- Después de las 19:00 de Bogotá, el calendario arranca «mañana», y la Actualizada puede correrse un día en la noche. Una Reestimada tomada de noche arrastra ese día.
- `getFactorySharedData` (que usa el mediodía UTC de la fecha UTC) tiene el mismo problema.
- Recomiendo arreglarlo aparte pasando un `startDate` basado en la fecha de Bogotá. No lo toqué para no arriesgar la paridad con el Excel.

---

## 2. Migraciones (aplicadas online y verificadas)

| Archivo | Qué hace |
|---|---|
| `0029_equipment_labor_factor.sql` | `equipment_catalog.labor_factor numeric` (nullable) más el check `equipment_catalog_labor_factor_check` (`null or (> 0 and <= 1)`). Sin backfill. |
| `0030_activity_catalog_5s.sql` | `activity_types.description`. Agrupa el catálogo en 5S, Empaque/carga/instalación y Arreglar máquinas. Crea la RPC `merge_activity_type(uuid, uuid)`. |
| `0031_reorder_production_queue.sql` | Crea la RPC `reorder_production_queue(uuid[], jsonb)`: una sentencia que escribe `order_position` y `reestimated_date` (esta solo para los ids presentes en el jsonb). Ignora ids repetidos. |

**Verificación online:**
- `information_schema.columns`: las dos columnas nuevas existen y son nullable.
- `pg_constraint`: el check está creado.
- `pg_proc`: las 3 RPC (incluida la vieja) son `SECURITY DEFINER` con `search_path=public`.
  - `has_function_privilege` da **false** para `anon` y para `authenticated`, y **true** para `service_role`.
- Desde la Management API (rol postgres), las dos RPC nuevas responden `42501 No autorizado.`
- Con la clave anónima por PostgREST: `permission denied`.
- Con service_role:
  - `reorder_production_queue([])` → ok.
  - `merge_activity_type(inexistentes)` → `P0002 La actividad a eliminar no existe.`
- Volví a correr las 3 migraciones y no cambió nada: son idempotentes.

`select * from activity_types order by sort_order` quedó así:

| sort | nombre | máquina | descripción | id |
|---|---|---|---|---|
| 1 | 5S | no | Aseo, orden, limpieza y mantenimiento de planta | `c99baa67…` (antes «Aseo y Orden») |
| 2 | Empaque, carga e instalación | sí | Empacar, cargar el camión e instalar donde el cliente | `d423e018…` (antes «Instalación externa») |
| 3 | Arreglar máquinas | sí | Garantías y arreglos de máquinas de clientes | `40313d35…` (nueva) |

**Desviación importante en la 0030.** La base en vivo **no tenía los nombres sembrados** que supone el contrato. El dueño había editado el catálogo desde Configuración:
- «Aseo y Orden», «Mantenimiento Planta», «Cargue / Descargue», «Instalación externa» y «Empacar». Esta última la crearon hoy a las 17:56.
- «Arreglar máquinas» había sido borrada.

Con la migración literal no habría quedado ningún 5S. Por eso la 0030 hace esto:
- Reconoce tanto los nombres sembrados como los que hay en vivo.
- 5S absorbe Aseo, Aseo y Orden, Orden, Mejoras planta y Mantenimiento Planta.
- Empaque absorbe Instalación externa, Empacar y Cargue / Descargue.
- Vuelve a crear «Arreglar máquinas».
- Mueve los vínculos antes de borrar. **Ninguna actividad tenía horas** (0 vínculos), así que no se perdió tiempo.
- Si el dueño quería esas subdivisiones, se pueden volver a crear desde Configuración.

---

## 3. Funciones exportadas nuevas o cambiadas (firma final)

### `src/services/labor-time.ts` (pura)
```ts
export type MachineLaborTotals = { /* como el contrato §3 */ };
export type SummarizeMachineLaborInput = { sessions; workers; shift; holidays; now; hourlyCostFallback; machineIds? };
export function summarizeMachineLabor(input: SummarizeMachineLaborInput): Map<string, MachineLaborTotals>;
export function summarizeLaborByPeriod(input: SummarizeLaborInput, granularity: LaborGranularity, options?: { workerId?: string }): LaborPeriodRow[];
// LaborMachineInput.laborFactor?: number | null
// SummarizeLaborInput.estimateHours: (salePriceCop: number, machine: LaborMachineInput) => number
```
- `allocateSession` es interno y lo comparten las tres funciones. `summarizeLabor` da exactamente lo mismo que antes: los 17 tests existentes pasan sin tocarlos.
- Con `machineIds`, todas las máquinas pedidas están en el Map, aunque no tengan sesiones.
- `firstSessionAt` es el inicio de la primera sesión (de etapa o de actividad) que le sumó minutos a la máquina.
- Las etiquetas de período salen de date-fns `es`: «mar 3 nov», «Semana del 3 nov», «Noviembre 2026».
- Una semana que empieza antes del rango tiene `startDate` = su lunes, pero solo suma los días que caen dentro del rango.

### `src/services/machines.ts`
```ts
export function planQueueReorder(input: {
  queue: MachineView[]; orderedIds: string[]; settings: ProductionSettings; holidays: Holiday[];
  startDate?: Date; previousIds?: string[];
}): { orderedIds: string[]; reestimatedDates: Record<string, string> };
export async function snapshotWholeQueueReestimatedDates(): Promise<void>;
export async function snapshotReestimatedDates(machineIds: string[]): Promise<void>; // ver desviaciones
export async function equipmentHasMachinesInQueue(equipmentId: string): Promise<boolean>;
export function toLaborFactorOrNull(value: unknown): number | null; // ahora exportada
```
- `reorderProductionQueue`, `reorderMachines` y todas las entradas a la cola hacen **una sola** llamada a `reorder_production_queue`.
- `normalizeProductionQueue` (cuando una máquina sale de la cola) también usa la RPC nueva, con `{}`.
- **Desde esta rama nada llama ya a `reorder_in_production_machines`**: la 0032 la puede borrar después del deploy.

### `src/services/machine-labor.ts` (nuevo)
```ts
export async function getMachineLaborTotals(machineIds: string[]): Promise<Map<string, MachineLaborTotals>>;
export async function attachMachineLabor<T extends CalculatedMachineView>(machines: T[], settings: ProductionSettings): Promise<Array<T & { labor: MachineLaborSnapshot }>>;
export function resolveMachineLaborFilters(params: { estado?: string; linea?: string; equipo?: string }): MachineLaborFilters;
export async function getMachineLaborReport(filters: MachineLaborFilters): Promise<MachineLaborReport>;
export async function getMachineLaborDetail(machineId: string): Promise<MachineLaborDetail | null>;
// Puras (con tests): buildMachineLaborSnapshot, buildMachineLaborRow, countsForAverages,
// buildEquipmentLaborRows, summarizeMachineLaborRows, buildMachineLaborDetail; type MachineLaborSource.
```

### `src/services/work-sessions.ts`
```ts
export const ACTIVITY_MACHINE_STATUSES = ["in_production", "finished", "shipped"] as const;
export type ActivityMachineStatus = (typeof ACTIVITY_MACHINE_STATUSES)[number];
export type ActivityPanelMachineOption = { id: string; serialNumber: number; equipmentName: string; clientName: string; status: "in_production" | "finished" | "shipped" };
export async function listMachinesForActivities(now?: Date): Promise<ActivityPanelMachineOption[]>;
export function sortActivityMachines<T>(rows: T[]): T[]; // pura, con test
export async function listSessionsForMachines(machineIds: string[]): Promise<LaborSessionInput[]>; // cada sesión con TODAS sus máquinas, paginado
export async function getFirstSessionStartedAt(): Promise<string | null>;
```
- `startOtherSession` acepta máquinas en `in_production`, `finished` o `shipped`.
- `startStageSession` y `resumeActivity` siguen exigiendo `in_production`. `resumeActivity` solo reanuda cadenas de etapa: descarta las actividades antes de revisar las máquinas.
- `listSessionsOverlapping` y `listSessionsForMachines` comparten el mismo mapeo (`mapLaborSessionRow`).

### `src/services/labor-dashboard.ts`
```ts
export type LaborRangePreset = … | "ultimos-90-dias" | "este-ano";   // «Últimos 3 meses», «Este año»
export function resolveLaborGranularity(value: string | undefined): LaborGranularity; // defecto "dia"
export async function getLaborDashboard(range: LaborRange, options?: { granularity?: LaborGranularity; workerId?: string }): Promise<LaborDashboard>;
// LaborDashboard gana granularity y periods; la desviación por máquina usa el % de su equipo.
```

### `src/services/activity-types.ts`
```ts
createActivityType(input: { name: string; allowsMachine: boolean; description?: string | null })
updateActivityType(id, input: { name?; allowsMachine?; isActive?; description?: string | null })
export async function listActivityTypeUsage(): Promise<Record<string, number>>;
export async function deleteActivityType(id: string, moveToId?: string | null): Promise<"deleted" | "moved">; // lanza ActivityTypeHasHoursError
export class ActivityTypeHasHoursError extends Error {}
export function normalizeDescription(value): string | null; export const DESCRIPTION_MAX_LENGTH = 120;
```

### Catálogo y Excel
- `calculations.ts`: `parseLaborPct(value)` → `{ ok: true, laborFactor: number | null } | { ok: false, error }`, más `LABOR_PCT_ERROR`.
  - Acepta coma o punto, «%» y espacios, en el rango 1–100.
  - Vacío → null.
  - Redondea a 0,01 %.
- `catalog.ts`:
  - `createCatalogItem` y `updateCatalogItem` aceptan `labor_factor?: number | null`.
  - Nuevas: `getCatalogItemLaborFactor(id)` y `getCatalogLaborFactors(ids)`.
- `excel.ts`:
  - Columna **«% mano de obra»** (en %) en el export del catálogo, después de «Precio COP».
  - Al importar, `ParsedCatalogRow` gana `laborFactor` y `laborPctError`.
  - Acepta 30, «32,5», «32.5» y celdas con formato de porcentaje (0,35 con formato `%` = 35 %).
- `catalog-import.ts`:
  - `CatalogImportNewRow.laborFactor`.
  - Una fila con el % inválido va a `invalidRows` con el motivo «El % de mano de obra debe estar entre 1 y 100.».
  - `applyCatalogImport` solo guarda fracciones válidas.

### Acciones (`src/app/admin/actions.ts`; todas empiezan con `requireAdmin()`)

| Acción | Comportamiento |
|---|---|
| `addCatalogItemAction` | `labor_pct` con `parseLaborPct`. Si es inválido, hace redirect a `/admin/catalogo?toast=labor-pct-invalido`. |
| `updateCatalogItemAction` | Igual que la anterior. **Si el campo `labor_pct` no viene en el formulario, no toca el %** (compatibilidad). Si el % cambia y el equipo tiene máquinas en cola, llama `snapshotWholeQueueReestimatedDates()`, `revalidateFactoryData()` y `revalidatePath("/admin")`. |
| `updateSettingsAction` | Lee la configuración antes de guardar. Si cambia `labor_factor` o `hourly_cost_per_worker_cop`, llama `snapshotWholeQueueReestimatedDates()`. |
| `addActivityTypeAction`, `updateActivityTypeAction` | `description` (opcional, máx. 120). Si el campo no viene, no se toca. |
| `deleteActivityTypeAction` | `move_to_id` opcional. **Nunca lanza.** Redirige a `/admin/configuracion?toast=<código>#actividades` con `actividad-eliminada`, `actividad-movida`, `actividad-con-horas` o `actividad-error` (este último además hace `console.error`). Estos códigos no chocan con los que ya existen (`sent-*`, `shipped`, `finished`, `reproceso`, `deleted`). |
| `importQuoteAction` | La fecha prometida usa `estimateTotalHours(precio, settings, labor_factor del equipo)`. Los productos personalizados nuevos usan el % general. |

---

## 4. Desviaciones del contrato

1. **0030 adaptada a los nombres en vivo.** Ver §2.
2. **`planQueueReorder` gana un `previousIds?` opcional.**
   - Es el orden de antes cuando la cola ya cambió en la base. Los ids que no estaban cuentan como cambiados.
   - Sin él, reactivar una máquina desde Propias en Espera (que conserva su `order_position` viejo) habría «desplazado» de forma ficticia a las máquinas de detrás y les habría borrado su atraso real.
   - Es compatible con la firma del contrato.
3. **`snapshotReestimatedDates(ids)` cambia de semántica.**
   - Ahora recompacta la cola y toma, en la misma RPC, la Reestimada de `ids` (las que entran) y de las que esa entrada desplazó.
   - Todos sus llamadores (crear, enviar a producción una o en lote, reproceso, garantía) son entradas a la cola.
   - Quité los `normalizeProductionQueue` que la precedían, porque ya no hacen falta.
4. **`LaborMachineInput.laborFactor` es opcional**, y `estimateHours` recibe la máquina como **segundo** argumento. Así los tests existentes de `summarizeLabor` pasan sin tocarlos.
5. **`EquipmentLaborRow`:**
   - Salen todos los grupos presentes en el filtro. Los que no tienen terminadas o despachadas con datos completos quedan con `machineCount = 0` y promedios en null.
   - `totalRealCostCop` suma todas las máquinas del grupo, no solo las que entran en los promedios.
   - El orden es `machineCount` desc y luego el nombre.
6. **`hasPartialData` = true** cuando:
   - no hay minutos de producción, o
   - `trackingSince` es null, o
   - `production_started_at < trackingSince`.

   Una máquina en cola que aún no tiene sesiones también sale como «Datos parciales».
7. **Excel de producción: no existe una columna «H.Tot» ni «Horas totales».** `buildScheduleWorkbook` no exporta horas, así que no había nada que renombrar. Si se quiere, se pueden agregar «H. máx» y «H. llevadas» en otra tarea.
8. **La importación del catálogo sigue siendo solo de altas.** El % de los equipos que ya existen no se actualiza desde Excel; se edita en el catálogo.

---

## 5. Notas para FA (fase 2)

- **`/admin/page.tsx`:** `const machinesWithLabor = await attachMachineLabor(machines, settings);` antes de `ProductionTablePanel`. También sirve para despachados (`/admin/despachados`): las horas máximas usan la venta y el % del equipo, aunque la máquina esté fuera de la cola.
- **Configuración:** `usageById = await listActivityTypeUsage()`. Los códigos de toast son exactamente los tuyos.
- **Toast nuevo `labor-pct-invalido`** en `/admin/catalogo`: agrega el case en `admin-flash-toast.tsx`, por ejemplo con el mensaje «No se guardó el equipo» y la descripción «El % de mano de obra debe estar entre 1 y 100.». Con `type="number" min=1 max=100` casi nunca debería verse.
- **Export del catálogo** (`src/app/admin/catalogo/export/route.ts`, archivo tuyo): agrega `labor_factor: item.labor_factor` al mapeo de `items`. Sin eso, la columna «% mano de obra» sale vacía. `listCatalogWithMachineTargets` ya trae el campo con `select *`.
- **Horas-hombre:** `getLaborDashboard(range, { granularity: resolveLaborGranularity(query.vista) })`. En la ficha de operario, agrega `workerId`. `dashboard.periods` llega ordenado por `startDate` ascendente.
- **Máquinas:** `getMachineLaborReport(resolveMachineLaborFilters(await searchParams))`.
  - `filters.linea` solo acepta los valores exactos de `MACHINE_LINE_VALUES` («Mantenimiento» va con mayúscula).
  - `filters.equipo` debe ser un uuid.
  - `machines` llega ordenado por serial desc.
  - Medí 2,5 s con 155 máquinas en la base real.
- **Ficha:** `getMachineLaborDetail(id)`. Devuelve null si el id no es un uuid o si no existe la máquina. Las sesiones vienen de la más reciente a la más antigua; `minutes` es lo atribuido a esta máquina.
- **Fusionar en una actividad sin `allowsMachine`:** las sesiones conservan sus máquinas y siguen contando como «Actividades con máquina». Conviene ofrecer en el `<select>` solo destinos compatibles, aunque no es obligatorio.

## 6. Notas para FP (fase 2)

- **Cartelera** (`src/app/planta/tablero/page.tsx`): `const withLabor = await attachMachineLabor(machines, mapSettings(settingsRow));` y luego pasa `machine.labor` a `BoardHoursCell`. Funciona para `in_production` y `finished`; en las terminadas, `labor.isFinal = true`.
- **Panel de actividades** (`src/app/planta/maquinas/page.tsx`):
  - Agrega `listMachinesForActivities()` al `Promise.all` y pasa el resultado a `<ActivityPanel machines={…}>` en vez de `orderedMachines.map(…)`.
  - `ActivityPanelMachineOption` tiene los mismos campos que `ActivityPanelMachine` más `status`. Sirve para mostrar «Terminada» o «Despachada» junto al serial.
  - Orden: primero la cola por posición, luego las terminadas y luego las despachadas (las más recientes primero, dentro de `shipped_retention_days`).
  - Las etapas siguen usando `shared.machines` (solo en producción).
- Desde esta rama, el servidor ya acepta en `startOtherSessionAction` máquinas terminadas o despachadas.

---

## 7. Casos borde conocidos

- **Sesión mixta.** Si una misma sesión marca 5S y Empaque y tiene una máquina asociada, toda la sesión cuenta como asignada a la máquina:
  - en `machineActivityMinutes` del período, y
  - en `extraMinutes` de la máquina.

  `minutesByActivityType` sí reparte el tiempo entre 5S y Empaque. Se deja así por decisión del líder.
- **Cronómetros que quedan abiertos varios días** inflan las horas.
  - Ejemplo: Pulir en la máquina 128, del 29 de octubre al 3 de noviembre: 15,8 h, recortadas a la jornada.
  - Ya aparece en «Calidad de datos». Hoy, la máquina 144 sale «Excedida» (máximo 4,9 h, llevadas 15,8 h).
- **Hora del servidor (UTC) en las fechas.** Ver §1. No se corrigió.
- **Solo 20 de 155 máquinas tienen datos completos.** El % MO real promedio (≈0,7 %) todavía no es representativo: los cronómetros arrancaron el 2026-09-16 y la mayoría de las terminadas empezó antes.

## 8. Cómo verificar

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
corepack pnpm tsx scripts/check-reestimated.ts   # solo lectura; después de reordenar, las movidas deben decir «sí»
```

- **Tests nuevos:**
  - `labor-period.test.ts`: reparto, reproceso, actividades con y sin máquina, recorte a la jornada y las pausas, sesión abierta, día, semana y mes en Bogotá, regla de ausencia.
  - `machines.test.ts`: `planQueueReorder`.
  - `machine-labor.test.ts`.
  - `activity-machines.test.ts`.
  - `activity-types.test.ts`.
  - `labor-pct.test.ts`.
  - `excel.test.ts`: «% mano de obra».
  - `labor-range.test.ts`: los rangos nuevos y la granularidad.
- **Base:** las consultas de §2. `has_function_privilege('anon', 'public.reorder_production_queue(uuid[],jsonb)', 'execute')` debe dar false.
- **En la app, después del merge** (no reordené la cola real ni modifiqué máquinas):
  - Mover la última máquina a la posición 1: todas las movidas deben quedar con Reestimada = Actualizada.
  - Cambiar el % de un equipo con máquinas en cola: cambian H. máx y la Actualizada, toda la cola toma la Reestimada nueva y no aparecen atrasos nuevos.
  - Borrar una actividad con horas: sin destino aparece el toast «con horas»; con destino, «movida».
  - En la tablet, iniciar «Empaque, carga e instalación» sobre una máquina terminada.

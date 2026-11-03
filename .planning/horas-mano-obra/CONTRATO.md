# CONTRATO — Horas de mano de obra, presupuesto por máquina y estadísticas

**Única fuente de verdad** para los agentes B (backend), FA (frontend admin), FP (frontend planta) y R (revisor).
Solo el líder edita este archivo. Si necesitas un cambio, **no lo hagas por tu cuenta**: descríbelo en tu handoff
(sección «CAMBIO DE CONTRATO PROPUESTO») o en tu reporte final, y el líder lo coordina.

Commit base de la fase 0: ver `git log` («feat(tipos): contrato y tipos compartidos de mano de obra»).

---

## 0. Qué pidió el dueño (resumen para todos)

1. Labores fuera de máquina: **5S** (aseo, orden, limpieza, mantenimiento de planta) y **Empaque, carga e instalación**
   (se asocia a una máquina; la instalación se cobra aparte y no hace parte del 100% de la máquina). Se conserva
   **Arreglar máquinas** (garantías). El catálogo de labores se puede agregar/editar/borrar en Configuración.
2. De la jornada pagada, ver por **día / semana / mes** (planta y por operario) cuánto quedó **asignado a máquinas**
   y cuánto **no asignado** (5S + sin registrar).
3. **% de mano de obra por equipo** en el catálogo (solo ahí; la máquina siempre usa el % vigente de su equipo).
   El % general de Configuración es el valor por defecto de los equipos sin % propio.
4. Cartelera y tabla de producción: **horas máximas, llevadas y finales**, con alerta si se pasa.
5. Estadísticas por **máquina (cotización)** y por **tipo de máquina**; **% MO esperado vs. real**
   (real = horas × costo hora **de cada operario**).
6. La **Reestimada** debe ajustarse al reordenar la cola (y no generar falsos atrasos).

Decisiones: días sin ningún registro = ausencia (como hoy). Presupuesto en horas usa el costo promedio de
Configuración; costo real usa `workers.hourly_cost_cop` (fallback: promedio).

---

## 1. Lo que YA quedó hecho en la fase 0 (no rehacer)

- `src/types/labor-report.ts` — todos los tipos de reporte (leer el archivo, está documentado).
- `src/types/database.ts`:
  - `equipment_catalog.labor_factor: number | null` (Row/Insert/Update).
  - `activity_types.description: string | null` (Row/Insert/Update).
  - Funciones `reorder_production_queue(ordered_machine_ids uuid[], reestimated_dates jsonb)` y
    `merge_activity_type(source_activity_type_id uuid, target_activity_type_id uuid)`.
- `src/types/domain.ts`:
  - `MachineView.equipmentLaborFactor: number | null`.
  - `CalculatedMachineView.laborFactor: number`, `.laborFactorSource: LaborFactorSource`, `.labor?: MachineLaborSnapshot`.
- `src/services/calculations.ts`:
  - `estimateTotalHours(salePriceCop, settings, laborFactor?: number | null)`.
  - `resolveLaborFactor(equipmentLaborFactor, settings) → { laborFactor, source: "catalogo" | "general" }`.
  - `BUDGET_RISK_MARGIN = 0.1` y `budgetStatus({ budgetHours, spentHours, progressPct, isFinished }) → BudgetStatus`.
  - `QueueMachineInput.laborFactor?: number | null` (ya lo usa `calculateQueue`).
- `src/services/machines.ts`: `mapMachineRow` llena `equipmentLaborFactor`; `calculateMachines` pasa el factor a la
  cola y expone `laborFactor` / `laborFactorSource`. (`totalHours` sigue en 0 para máquinas fuera de la cola.)
- `src/services/activity-types.ts`: `ActivityTypeView.description: string | null` (mapeado).

---

## 2. Base de datos (solo B; online vía Management API — ver memoria `online-supabase-ddl-method`)

**Regla:** todo cambio debe ser compatible con la versión YA desplegada (que no conoce las columnas nuevas)
hasta el deploy final. Nada de renombrar/borrar columnas ni cambiar firmas de RPC existentes.

### `0029_equipment_labor_factor.sql`
```sql
alter table public.equipment_catalog add column if not exists labor_factor numeric;
-- check idempotente: (labor_factor is null or (labor_factor > 0 and labor_factor <= 1)), nombre equipment_catalog_labor_factor_check
```
null = usa `settings.labor_factor`. **No** se hace backfill (todos arrancan en null = 30% general).

### `0030_activity_catalog_5s.sql` (idempotente, re-ejecutable)
1. `alter table public.activity_types add column if not exists description text;`
2. Renombrar `Aseo` → `5S` (si `5S` no existe aún), conservando el id.
   description = `Aseo, orden, limpieza y mantenimiento de planta`.
3. Mover los vínculos de `Orden` y `Mejoras planta` a `5S`:
   `insert into work_session_activity_types (session_id, activity_type_id) select session_id, <5S> … on conflict do nothing;`
   luego borrar los vínculos viejos y los tipos `Orden` / `Mejoras planta`.
4. Renombrar `Instalación externa` → `Empaque, carga e instalación`, `allows_machine = true`,
   description = `Empacar, cargar el camión e instalar donde el cliente`.
5. `Arreglar máquinas`: description = `Garantías y arreglos de máquinas de clientes`, `allows_machine = true`.
6. sort_order: 5S = 1, Empaque, carga e instalación = 2, Arreglar máquinas = 3.
7. RPC `public.merge_activity_type(source_activity_type_id uuid, target_activity_type_id uuid) returns void`:
   security definer, `set search_path = public`, exige `auth.role() = 'service_role' or public.is_admin()`,
   rechaza source = target o ids inexistentes, mueve vínculos (on conflict do nothing), borra los del source,
   borra el tipo source. `revoke all … from public, anon, authenticated; grant execute … to service_role;`
   (mismo patrón que `0028_lock_down_definer_rpcs.sql`).

### `0031_reorder_production_queue.sql`
RPC nueva `public.reorder_production_queue(ordered_machine_ids uuid[], reestimated_dates jsonb) returns void`:
security definer, mismos guardas y grants que la 0028. En **una sola sentencia/transacción**:
`order_position` = posición en el arreglo (solo `status = 'in_production'`), y `reestimated_date` =
`(reestimated_dates ->> id::text)::date` para cada id presente en el jsonb (los demás no se tocan).
La RPC vieja `reorder_in_production_machines` **se deja** (la usa la versión desplegada). El líder la borra en `0032` tras el deploy.

### Verificación (B)
`information_schema.columns`, `pg_proc` + `has_function_privilege('anon', …)` = false, `select * from activity_types order by sort_order`.

---

## 3. Motor puro — `src/services/labor-time.ts` (B)

Extraer el reparto de una sesión a un helper interno compartido (recorte con `workedMinutesByDay`, reparto con
`splitEqually`, costo con `worker.hourlyCostCop ?? hourlyCostFallback`). `summarizeLabor` **no cambia su resultado**
(los tests existentes deben pasar igual).

```ts
export type MachineLaborTotals = {
  machineId: string;
  /** Etapas de producción, INCLUYE reproceso. */
  productionMinutes: number;
  reprocessMinutes: number;
  minutesByStage: Record<number, number>;
  reprocessMinutesByStage: Record<number, number>;
  minutesByWorker: Record<string, number>;      // solo producción
  costByWorker: Record<string, number>;         // solo producción
  productionCostCop: number;
  /** Actividades (kind = 'other') con esta máquina asociada. */
  extraMinutes: number;
  extraCostCop: number;
  extraMinutesByActivityType: Record<string, number>;
  extraCostByActivityType: Record<string, number>;
  firstSessionAt: string | null;
};

export function summarizeMachineLabor(input: {
  sessions: LaborSessionInput[];      // cada sesión con TODOS sus machineIds (para repartir bien)
  workers: LaborWorkerInput[];
  shift: FactoryShift;
  holidays: HolidaySet;
  now: Date | string;
  hourlyCostFallback: number;
  machineIds?: string[];              // si viene, solo devuelve esas máquinas
}): Map<string, MachineLaborTotals>;  // sin rango: toda la vida

export function summarizeLaborByPeriod(
  input: SummarizeLaborInput,
  granularity: LaborGranularity,
  options?: { workerId?: string },
): LaborPeriodRow[];                  // ordenadas por startDate ascendente; solo períodos con jornada o registro
```
Reglas de `summarizeLaborByPeriod` (ver doc de `LaborPeriodRow`):
- Todo en hora de Bogotá. Semana = lunes a domingo (`periodKey` = fecha del lunes). Mes `periodKey` = `yyyy-MM`.
- Por **operario-día**: jornada = `availableShiftMinutes(día)` solo si ese operario registró > 0 min ese día (regla de
  ausencia); `unregistered = max(0, jornada − registrado)` calculado por operario-día y luego sumado.
- Sesión `stage`: reproceso → `reprocessMinutes`, si no → `machineMinutes`.
- Sesión `other`: con `machineIds.length > 0` → `machineActivityMinutes`; sin máquinas → `plantActivityMinutes`.
  `minutesByActivityType` reparte por igual entre las actividades marcadas (sin tipo = `"sin-clasificar"`).
- `assigned = machine + reprocess + machineActivity`; `unassigned = plantActivity + unregistered`.
- Etiquetas en español: día `"lun 3 nov"`, semana `"Semana del 3 nov"`, mes `"Noviembre 2026"`.

---

## 4. Servicios (B)

### `src/services/machine-labor.ts` (nuevo; importa el admin client solo dentro de funciones)
```ts
export async function getMachineLaborTotals(machineIds: string[]): Promise<Map<string, MachineLaborTotals>>;
//   1) work_session_machines where machine_id in (ids) → session ids
//   2) esas sesiones con TODOS sus work_session_machines y work_session_activity_types
//   3) summarizeMachineLabor(..., machineIds)

export async function attachMachineLabor<T extends CalculatedMachineView>(
  machines: T[],
  settings: ProductionSettings,
): Promise<Array<T & { labor: MachineLaborSnapshot }>>;
//   budgetHours = estimateTotalHours(salePriceCop, settings, equipmentLaborFactor)  ← también para terminadas
//   spentHours = productionMinutes/60; isFinal = status in ('finished','shipped')
//   status = budgetStatus({ budgetHours, spentHours, progressPct, isFinished: isFinal })

export function resolveMachineLaborFilters(params: { estado?: string; linea?: string; equipo?: string }): MachineLaborFilters;
//   estado por defecto "todas"; valores inválidos → defecto

export async function getMachineLaborReport(filters: MachineLaborFilters): Promise<MachineLaborReport>;
//   máquinas: en-produccion = in_production; terminadas = finished; despachadas = shipped (sin límite de retención);
//   todas = in_production + finished + shipped (no pending ni on_hold).
//   hasPartialData = sin sesiones de producción, o production_started_at < trackingSince (primer started_at de work_sessions).
//   byEquipment: agrupa por equipmentId (null = "Productos personalizados"); promedios solo de
//   finished/shipped con hasPartialData = false. Orden: machineCount desc.
//   machines: orden por serialNumber desc.

export async function getMachineLaborDetail(machineId: string): Promise<MachineLaborDetail | null>;
//   byStage: expectedHours = budgetHours × peso de la etapa (DEFAULT_STAGES, diferencias de completionPercentage).
//   sessions: más recientes primero; minutes = los atribuidos a esta máquina; sharedWith = machineIds.length.
```

### `src/services/machines.ts`
- Función pura exportada:
  ```ts
  export function planQueueReorder(input: {
    queue: MachineView[];                 // in_production actuales
    orderedIds: string[];                 // nuevo orden completo de la cola
    settings: ProductionSettings;
    holidays: Holiday[];
    startDate?: Date;
  }): { orderedIds: string[]; reestimatedDates: Record<string, string> };  // solo ids cuyo índice cambió
  ```
  `reorderProductionQueue` y `reorderMachines` la usan y luego llaman **una vez** a la RPC
  `reorder_production_queue` (atómico). Ya no se llama a `persistProductionQueueOrder` + `snapshotReestimatedDates` por separado.
- `bulkSendToProduction`: también toma la reestimada de las máquinas ya en cola cuyo índice cambió (`changedQueueIds`).
- `export async function snapshotWholeQueueReestimatedDates(): Promise<void>` — toma la reestimada de **toda** la cola.
  Se llama cuando cambia el `labor_factor` de un equipo (si ese equipo tiene máquinas en cola) o el `labor_factor` /
  `hourly_cost_per_worker_cop` generales.
- **Diagnóstico de solo lectura primero** (`scripts/check-reestimated.ts`): lista por máquina en cola
  `serial, order_position, reestimated_date, Actualizada viva, ¿coinciden?`. Revisar `vercel logs` buscando
  «No se pudo guardar la fecha reestimada». **Prohibido reordenar la cola real para probar.** Reportar hallazgos en el handoff.

### `src/services/labor-dashboard.ts`
- `LaborMachineInput` gana `laborFactor: number | null` (de `equipment_catalog(labor_factor)`); `estimateHours` usa el
  factor de cada máquina (cambiar la firma del callback a `(machine: LaborMachineInput) => number` o equivalente).
- Presets nuevos en `LaborRangePreset`: `"ultimos-90-dias"` («Últimos 3 meses») y `"este-ano"` («Este año»).
- `export function resolveLaborGranularity(value: string | undefined): LaborGranularity` (defecto `"dia"`).
- `getLaborDashboard(range, options?: { granularity?: LaborGranularity; workerId?: string })` → `LaborDashboard` gana
  `granularity: LaborGranularity` y `periods: LaborPeriodRow[]` (de toda la planta, o del operario si viene `workerId`).

### `src/services/activity-types.ts`
- `createActivityType({ name, allowsMachine, description? })`, `updateActivityType(id, { …, description? })`.
- `export async function listActivityTypeUsage(): Promise<Record<string, number>>` — activity_type_id → nº de sesiones vinculadas.
- `deleteActivityType(id, moveToId?: string)`: sin uso → borra; con uso y `moveToId` → RPC `merge_activity_type`;
  con uso y sin `moveToId` → error «Esta actividad tiene horas registradas. Elige a qué actividad moverlas.».

### Catálogo / Excel
- `catalog.ts`: `createCatalogItem` / `updateCatalogItem` aceptan `labor_factor: number | null`.
- `catalog-import.ts` + `excel.ts`: columna **«% mano de obra»** (en %, p. ej. `30`) en export e import (opcional al importar;
  vacío = null). Si hay tests de import/export, extenderlos.

### Acciones (`src/app/admin/actions.ts`) — nombres de campos de formulario
| Acción | Campos nuevos |
|---|---|
| `addCatalogItemAction`, `updateCatalogItemAction` | `labor_pct` (texto, en %, `""` = null; validar 1–100, aceptar coma decimal). Si cambia en `update`, llamar `snapshotWholeQueueReestimatedDates()`. |
| `updateSettingsAction` | (sin campos nuevos) si cambian `labor_factor` o `hourly_cost_per_worker_cop` → `snapshotWholeQueueReestimatedDates()`. |
| `addActivityTypeAction`, `updateActivityTypeAction` | `description` (texto, opcional, máx. 120). |
| `deleteActivityTypeAction` | `move_to_id` (opcional). Errores → redirect `/admin/configuracion?toast=…#actividades` (no lanzar). |
| `importQuoteAction` | la fecha prometida usa `estimateTotalHours(precio, settings, labor_factor del equipo)`. |
Toda acción nueva o modificada empieza con `await requireAdmin()`.

---

## 5. Frontend admin (FA) — `src/app/admin/**` (salvo actions.ts), `src/components/admin/**`

Estilo: marca XTENSOR existente (`MetricCard`, `StatsTable`, `TimeSplitBar`, `Card`, `Badge`, `.xt-eyebrow`).
**Sin librerías de gráficas.** Colores definidos: `--xt-black`, `--xt-yellow`, `--xt-yellow-deep`, `--xt-yellow-soft`,
`--xt-steel`, `--xt-aluminum`, `--xt-cement`, `--xt-paper`, `--line-pro-red`, `--line-bio-green`, `--line-semi-cyan`,
`--line-kids-orange`. **`--xt-green` y `--xt-red` NO existen.**

Colores del reparto de la jornada (mismo orden en barra y leyenda):
Máquinas `--xt-black` · Reproceso `--line-pro-red` · Actividades con máquina `--line-semi-cyan` ·
Planta (5S…) `--xt-yellow-deep` · Sin registrar `--xt-aluminum`.
Estado de presupuesto: ok = normal · riesgo = `--xt-yellow-deep` · excedida = `--line-pro-red`.

Textos (usar exactamente):
- «H. máx» (tooltip: «Horas máximas = venta × % MO del equipo ÷ costo hora promedio»), «H. llevadas», «H. finales»,
  «% consumido», «% MO esperado», «% MO real», «En riesgo», «Excedida», «Datos parciales».
- Reparto: «Máquinas», «Reproceso», «Actividades con máquina», «Planta (5S y otras)», «Sin registrar»,
  totales «Asignado a máquinas» / «No asignado».
- Vista: «Día» / «Semana» / «Mes» (`?vista=dia|semana|mes`).

Entregables:
1. **Catálogo** (`catalog-unified-manager.tsx`): columna «% MO». Con % propio: `35%`; sin: `30% (general)` en gris
   (`--xt-steel`). Input `labor_pct` (en %) en `EditPanel` y `AddRow`, vacío = usa el general.
2. **Configuración**: etiqueta del campo `labor_factor` → «% mano de obra por defecto» con ayuda «Se usa en los equipos
   del catálogo sin % propio.» `activity-types-manager.tsx`: campo `description`; botón «Eliminar»; si la actividad tiene
   uso (`usageById[id] > 0`) mostrar un `<select name="move_to_id">` «Mover sus horas a…» con las demás actividades
   (obligatorio) antes de confirmar. El componente recibe la prop `usageById: Record<string, number>`.
3. **Producción** (`production-table.tsx`): `H.Tot` → «H. máx» (tooltip). Columnas nuevas «H. llevadas» (de
   `machine.labor?.spentHours`, coloreada por `machine.labor?.status`, `—` si no hay `labor`) y «% MO»
   (`machine.laborFactor`, gris si `laborFactorSource === "general"`). Ordenables si el patrón `sh()` lo permite.
4. **Estadísticas**:
   - `statistics-tabs.tsx`: pestañas Resumen | Horas-hombre | **Máquinas** (`/admin/estadisticas/maquinas`).
   - Componente `labor-period-table.tsx`: props `{ rows: LaborPeriodRow[]; granularity: LaborGranularity; activityNames: Record<string, string> }`.
     Tabla por período con barra apilada por fila + columnas Jornada, Asignado, No asignado (horas y %), y detalle por actividad.
   - Horas-hombre (`/admin/estadisticas/horas`): selector Día/Semana/Mes junto a los rangos (conservar `?rango=`),
     sección «Jornada por período» con `labor-period-table`. Agregar los rangos «Últimos 3 meses» y «Este año».
   - Ficha de operario: misma sección filtrada al operario.
   - **Máquinas** (`/admin/estadisticas/maquinas/page.tsx`): filtros `?estado=&linea=&equipo=`; KPIs (máquinas, excedidas,
     en riesgo, % MO esperado vs. real promedio); tabla por cotización (serial con enlace a la ficha, máquina, cliente, estado,
     avance, H. máx, H. llevadas, % consumido, % MO esperado, % MO real, costo real, horas actividades, badge «Datos parciales»);
     tabla «Por tipo de máquina». Nota visible: «Los cronómetros existen desde {trackingSince}».
   - **Ficha** (`/admin/estadisticas/maquinas/[id]/page.tsx`): encabezado, medidor llevadas vs. máximo (componente
     `budget-meter.tsx`, props `{ budgetHours, spentHours, status }`), etapas esperado vs. real, operarios, actividades
     asociadas, bitácora de sesiones.
   - Resumen: el indicador «Mano de obra %» existente pasa a «Mano de obra % (aprox. por fechas)» con enlace a Máquinas.
5. **Calculadora** (`calculator-form.tsx`): si se elige un equipo, usar su `labor_factor` (si tiene).
6. **Edición de máquina**: mostrar en solo lectura «% MO del catálogo: X%» y «H. máx: N».

Fase 1: construir componentes de presentación y formularios (con los `name` de arriba) contra los tipos ya existentes.
**No** importar funciones de servicio que aún no existen (`machine-labor.ts`, `summarizeLaborByPeriod`, `listActivityTypeUsage`).
Fase 2 (tras merge de B): conectar páginas a los servicios reales.

---

## 6. Frontend planta (FP) — `src/app/planta/**` (salvo actions.ts), `src/components/factory/**`, `src/app/globals.css`

**iPad (iPadOS 15.3 Safari ignora utilidades Tailwind v4 en capas):** toda regla visual nueva necesita su clase `.xt-*`
**sin capa** en `globals.css`, como el resto de la planta.

1. **Cartelera** (`src/app/planta/tablero/page.tsx`): columna nueva «Horas» (después de «Avance»):
   - En curso: `llevadas / máx h` (p. ej. `42 / 60 h`) + barra delgada de consumo.
   - Terminada (`machine.labor.isFinal` o fila "done"): `Terminó en 58 h de 60`.
   - Color: ok normal, riesgo `--xt-yellow-deep`, excedida `--line-pro-red`. Sin `labor` → `—`.
   - Componente `src/components/factory/board-hours-cell.tsx` con props `{ labor: MachineLaborSnapshot | undefined }`.
   - Actualizar la grilla en **sus dos lugares**: clase Tailwind (encabezado y `BoardRow`) **y**
     `.xt-board-columns` / `.xt-board-row` en `globals.css`. Comprobar que cabe a 1920 px (TV) y 1366 px.
2. **Panel de actividades** (`activity-panel.tsx`): mostrar `type.description` bajo el nombre (si existe), con su `.xt-*`.
   Verificar que «Empaque, carga e instalación» pide máquina (allowsMachine) y «5S» no.

Fase 1: componente + CSS + grilla (la página puede seguir sin `labor` → `—`). Fase 2: en la página de la cartelera llamar
`attachMachineLabor(machines, settings)` y pasar `machine.labor`.

---

## 7. Propiedad de archivos (no tocar archivos de otro agente)

| Agente | Archivos |
|---|---|
| Líder | este contrato, `src/types/labor-report.ts`, `src/types/domain.ts`, `src/types/database.ts` (si hace falta ajustar, pedirlo) |
| B | `supabase/migrations/**`, `src/services/**`, `src/app/admin/actions.ts`, `src/app/planta/actions.ts`, `scripts/**`, `tests/unit/**` |
| FA | `src/app/admin/**` (salvo `actions.ts`), `src/components/admin/**` |
| FP | `src/app/planta/**` (salvo `actions.ts`), `src/components/factory/**`, `src/app/globals.css` |
| R | solo lectura |

Si necesitas algo en un archivo ajeno (p. ej. FA necesita un campo nuevo de un servicio), anótalo en tu handoff/reporte.

## 8. Comunicación y entrega

- Al terminar cada fase, escribe/actualiza `.planning/horas-mano-obra/handoff-<B|FA|FP>.md`: archivos tocados, commits,
  desviaciones del contrato, dudas abiertas, cómo verificar. Lee los handoffs de los demás antes de tu fase 2.
- Commits atómicos en español con scope (`feat(catalogo): …`, `fix(fechas): …`), terminados con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **No hagas push ni deploy** (lo hace el líder).
- Antes de terminar: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` (y `corepack pnpm build` en fase 2).
- CLAUDE.md del repo aplica: cambios de base en la base online, simplicidad y estética de la marca.

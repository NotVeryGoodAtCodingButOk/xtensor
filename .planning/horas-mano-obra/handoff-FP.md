# Handoff FP (frontend planta) — fase 1

Rama `worktree-agent-a1b42d80546fd5bea`, worktree `/Users/simonb/xtensor/.claude/worktrees/agent-a1b42d80546fd5bea`.
Base: `b39340f` (fast-forward desde 953ddd3 al empezar).

## Commits

- `5506d52 feat(cartelera): horas máximas y llevadas por máquina`
- `0c76288 feat(planta): descripción de las actividades`
- (este archivo) `docs(planificacion): handoff FP fase 1`

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/components/factory/board-hours-cell.tsx` (nuevo) | `BoardHoursCell({ labor })` y `formatBoardHours(hours)` (exportada para poder testearla). Componente de servidor, sin `"use client"`. |
| `src/app/planta/tablero/page.tsx` | Columna «Horas» después de «Avance» (encabezado y `BoardRow`), con la grilla `grid-cols-[…]` nueva en los dos lugares. Pasa `machine.labor`, que en la fase 1 llega `undefined` y se ve `—`. |
| `src/components/factory/activity-panel.tsx` | `type.description` bajo el nombre, cuando existe, y el comentario del componente al día con el catálogo nuevo. |
| `src/app/globals.css` | `.xt-board-columns/.xt-board-row` con la grilla nueva (más un comentario que recuerda que debe coincidir con la clase Tailwind), reglas `.xt-board-hours-*` y `.xt-activity-option-text/-description`. Todo sin capa. |

## Comportamiento de la celda «Horas»

- En curso: `42 / 60 h` (Barlow 1.25rem bold tabular, igual que las fechas) y debajo una barra de 4 px.
  - Relleno: `--xt-aluminum` en ok, `--xt-yellow-deep` en riesgo, `--line-pro-red` en excedida.
  - El tope visual es 100 %. Si pasa de 100 %, al final de la barra aparece una marca roja que sobresale (`.xt-board-hours-track-over::after`).
- Terminada (`labor.isFinal`): `Terminó en 58 h de 60` (Barlow Condensed 1.125rem), coloreada por estado.
- Color del texto: ok blanco, riesgo `--xt-yellow-deep`, excedida `--line-pro-red`.
- Sin `labor`, o con `budgetHours` ≤ 0 o NaN: `—` en blanco al 40 % (como el `—` de Reestimada).
- Redondeo: enteros con separador es-CO (`1.234`). Lo que redondeado a décimas queda por debajo de 10 lleva un decimal con coma (`8,5`, `0,3`). El 0 exacto se muestra como `0`, y 9,96 pasa a `10`.
- **Decisión propia de legibilidad:**
  - Problema: las filas atrasadas parpadean con `rgba(200,30,30,0.55)` y el texto rojo de excedida desaparecía encima; sobre el verde de las terminadas, el rojo tampoco se leía.
  - Solución: en `.xt-board-row-late .xt-board-hours` y `.xt-board-row-done .xt-board-hours-excedida` la celda lleva un fondo `--xt-black`. Usa margen negativo y padding iguales, así que no cambia el layout.

## Anchos de la grilla (medidos en Chromium con el CSS compilado y las fuentes reales)

Grilla nueva: `4.5rem 1.8fr 1.2fr 1fr 1.5fr 1.8fr 1.4fr 1.1fr 1.1fr 1.2fr`
(Serial, Máquina, Cliente, Color, Avance, **Horas**, Siguiente tarea, Prometida, Reestimada, Actualizada).

| Columna | 1366 antes | 1366 ahora | 1920 ahora | Lo más ancho que debe caber |
|---|---|---|---|---|
| Máquina | 163 | 164 | 247 | (se recorta con tooltip, igual que antes) |
| Cliente | 136 | 109 | 164 | (se recorta con tooltip) |
| Color | 100 | 91 | 137 | (se recorta con tooltip) |
| Avance | 190 | 137 | 206 | barra + 48 px del % |
| Horas | — | 164 | 247 | `Terminó en 104 h de 48` con fondo negro: 156 + 8 px |
| Siguiente tarea | 154 | 128 | 192 | encabezado «SIGUIENTE TAREA»: 122 px |
| Prometida / Reestimada | 118 | 100 | 151 | encabezado «REESTIMADA»: 86 px |
| Actualizada | 136 | 109 | 164 | encabezado «ACTUALIZADA»: 94 px |

- Resultado a 1920 y 1366: ningún encabezado se parte, no hay scroll horizontal y todas las filas quedan en 41 px, como antes.
- La celda de horas mide 26 px. Es menor que los 27 px de la celda de máquina, que es la que fija el alto de fila.
- La cartelera tiene hoy 35 máquinas y presupuestos de 4,9 a 82 h (consulta de solo lectura), así que `NNN / NN h` es el peor caso realista.

## Verificación hecha

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`: verde (17 archivos, 152 tests).
- **Navegador:**
  - Sin la contraseña de planta, `/planta/tablero` redirige a `/planta`. No forcé la cookie.
  - Validé con `corepack pnpm dev -p 3101`, inyectando en `/planta` una maqueta de la cartelera con las mismas clases y datos ficticios, a 1920×1080 y 1366×1024. Capturas: ok, riesgo, excedida con marca, atrasada en el pico del parpadeo, terminada y `—`.
  - El panel de actividades lo revisé igual, a 1024×768.
  - No se crearon ni modificaron datos reales; las consultas fueron solo `GET` por REST.
- El marcado de `BoardHoursCell`, renderizado con `renderToStaticMarkup`, coincide con el de la maqueta.

## Panel de actividades: verificación de `allowsMachine`

El código cumple:

- `allowsMachine` vale `true` solo si alguna actividad marcada tiene `allowsMachine`. Solo entonces aparece la lista «Máquina (opcional)».
- Al desmarcar la última actividad que lo permite, se borran las máquinas escogidas (`toggleType`).
- `handleSubmit` envía `machineIds: []` cuando no aplica, y el servidor (`startOtherSession`) rechaza máquinas si ninguna actividad lo permite.
- Por tanto, «5S» (`allows_machine = false`) no pide máquina y «Empaque, carga e instalación» (`true`, tras la 0030) sí la ofrece.

**No encontré bugs en el panel y no cambié su lógica.** Hay hallazgos para el líder y para B:

1. **La máquina es opcional, no obligatoria.** El texto dice «Máquina (opcional)». Si «pide máquina» debía significar que es obligatoria, es una decisión de producto, y habría que validarlo también en `startOtherSession` (B).
2. **Solo se pueden asociar máquinas `in_production`.**
   - El panel recibe `shared.machines`, que viene de `listMachines("in_production")`, y el servidor exige `assertMachinesInProduction`.
   - «Empacar» es la última etapa: al completarla, la máquina pasa a `finished`.
   - Por eso la **carga y la instalación** (que ocurren después) no se pueden asociar a esa máquina.
   - Tampoco «Arreglar máquinas» (garantías), cuyas máquinas ya están `shipped`.
   - Arreglarlo toca a B (servicio) y a FP (lista del panel en `src/app/planta/maquinas/page.tsx`). Ver la propuesta B abajo.
3. **Mezcla de actividades.** Si marcan «5S» junto con «Empaque…» y escogen una máquina, la sesión queda con máquina. Según §3 del contrato, *toda* la sesión cuenta como `machineActivityMinutes`, incluida la parte de 5S, y se infla «Asignado a máquinas». Ver la propuesta A.
4. **El catálogo en vivo no coincide con lo que asume la 0030** (consulta de solo lectura de hoy):
   - Hoy hay: `Aseo y Orden` (sin máquina), `Mantenimiento Planta` (sin máquina), `Cargue / Descargue` (con máquina), `Instalación externa` (con máquina) y `Empacar` (con máquina).
   - **No existen** `Aseo`, `Orden`, `Mejoras planta` ni `Arreglar máquinas`.
   - La columna `activity_types.description` aún no existe (el `select` con description da 400).
   - B debe mapear los nombres reales en la 0030; si no, el renombre a 5S no hará nada.

## Desviaciones del contrato

- «Terminada (`machine.labor.isFinal` **o fila "done"**)»: el componente solo recibe `labor` (la firma es fija), así que usa `labor.isFinal`.
  - En la práctica es equivalente: `stages.ts` pasa la máquina a `finished` cuando todas las etapas están al 100 %, y la fila "done" es `progressPct >= 1`.
  - Si se quiere cubrir el caso raro de una máquina al 100 % que sigue `in_production`, en la fase 2 se puede pasar `isFinal || status === "done"` desde la página, sin cambiar el contrato.
- Fondo negro en filas atrasadas o terminadas excedidas: decisión de legibilidad (ver arriba).
- No agregué tests de `formatBoardHours` porque `tests/unit/**` es de B. Sugiero un test pequeño (0 → `0`, 8,5 → `8,5`, 9,96 → `10`, 42,4 → `42`).

## CAMBIO DE CONTRATO PROPUESTO

- **A (§3, `summarizeLaborByPeriod` / `summarizeMachineLabor`):**
  - En una sesión `other` con máquinas y varias actividades, contar como `machineActivityMinutes` solo la parte de las actividades con `allows_machine`; el resto, como `plantActivityMinutes`.
  - Alternativa: que el panel no permita mezclar actividades con y sin máquina. Es un cambio mío en `activity-panel.tsx`, si el líder lo prefiere.
- **B (§4/§6):** permitir asociar actividades con máquina a máquinas `finished`, y quizá `shipped` recientes, para carga, instalación y garantías.
  - Requiere cambiar `assertMachinesInProduction` en `startOtherSession` (B) y la lista del panel (FP).
  - Lo debe decidir el dueño.
- **C (§2, 0030):** ajustar los nombres de origen al catálogo real (ver hallazgo 4).

## Pendiente para la fase 2

1. Rebasar sobre `main` y leer `handoff-B.md`.
2. En `src/app/planta/tablero/page.tsx`:
   - Sacar `const settings = mapSettings(settingsRow)`.
   - Hacer `const machines = await attachMachineLabor(await listCalculatedMachines({ settings, … }), settings)`.
   - Ordenar con `orderBoardMachines` como hoy.
   - `BoardRow` ya pasa `machine.labor`.
3. Actualización: hoy la cartelera refresca por Realtime (`machines`, `machine_stages`, `settings`, `colors`) y cada 30 s por poll.
   - Si B cuenta las sesiones abiertas hasta `now`, el poll de 30 s basta.
   - Agregar `work_sessions` al Realtime refrescaría en cada inicio o fin de cronómetro: lo decido según `handoff-B.md`.
4. `lint`, `typecheck`, `test` y `build`.

## Cómo verificar (líder / R)

- `git diff b39340f..HEAD -- src/app/planta src/components/factory src/app/globals.css`.
- Comprobar que la grilla coincide en los dos lugares:
  - `grep -o "grid-cols-\[[^]]*\]" src/app/planta/tablero/page.tsx` debe dar dos líneas iguales.
  - `grep -n "grid-template-columns: 4.5rem" src/app/globals.css` debe tener las mismas fracciones.
- En la TV o el iPad, ya en la fase 2: una máquina en riesgo se ve amarilla, una excedida roja con la marca al final de la barra, y las terminadas dicen «Terminó en N h de M».

---

# Handoff FP — fase 2

Base: `1d72214` (fast-forward desde `d12d6a4`). Dependencias sin cambios.

## Commits

- `90070cb feat(cartelera): conectar las horas llevadas y máximas`
- `2ad1518 feat(planta): actividades sobre máquinas terminadas y despachadas`
- `d645512 fix(cartelera): «—» cuando las horas de la máquina están incompletas`
- (este archivo) `docs(planificacion): handoff FP fase 2`

## Qué cambió

| Archivo | Cambio |
|---|---|
| `src/app/planta/tablero/page.tsx` | Sale `const settings = mapSettings(settingsRow)`. Las máquinas pasan por `attachMachineLabor(machines, settings)` y luego por `boardLabor()` (ver abajo). `getFirstSessionStartedAt()` entra en el `Promise.all`. **No se agregó Realtime**: basta el poll de 30 s que ya existía. |
| `src/app/planta/maquinas/page.tsx` | `listMachinesForActivities()` entra en el `Promise.all`, y `<ActivityPanel machines={activityMachines}>`. La grilla de máquinas, `MachineMultiSelect` y `TaskGrid` siguen usando `shared.machines` (solo `in_production`). |
| `src/components/factory/activity-panel.tsx` | La prop `machines` es `ActivityPanelMachineOption[]`. Se quitó el tipo local `ActivityPanelMachine`, que nadie más usaba. Cada máquina lleva la etiqueta «En producción», «Terminada» o «Despachada». El texto vacío pasa a «No hay máquinas en producción, terminadas ni despachadas.». |
| `src/components/factory/board-hours-cell.tsx` | `formatBoardHours`: lo que redondea a 0 se muestra «0», no «0,0». |
| `src/app/globals.css` | `.xt-activity-machine-status` y sus variantes `-in_production` (negro con texto amarillo), `-finished` (`--line-bio-green` con texto blanco, como `.xt-badge-success`) y `-shipped` (`--xt-cement` con texto `--xt-steel`). Todo sin capa. |

## Desviación: «—» cuando las horas están incompletas (commit aparte `d645512`, fácil de revertir)

Con los datos reales (consulta de solo lectura con `attachMachineLabor`), **las 9 terminadas de la cartelera** decían «Terminó en 0 h de 48», o 0,7 y 2,7 h. Todas entraron a producción el 2026-08-20, y el primer cronómetro es del 2026-09-16.

`MachineLaborSnapshot` no trae `hasPartialData`. Por eso la página aplica `boardLabor()`, con el mismo criterio que `buildMachineLaborRow` de B:
- `trackingSince === null`, o
- `productionStartedAt < trackingSince`, o
- terminada con horas que redondean a 0.

**Si además el estado es «ok», la celda muestra «—».** Si va en riesgo o excedida, se muestra igual, porque las horas reales solo pueden ser más. Las en curso sin horas que entraron *después* de los cronómetros sí muestran `0 / N h`, porque es su estado real.

Resultado hoy (35 máquinas):
- 18 con horas (casi todas `0 / N h`: los cronómetros se usan poco todavía).
- 16 con «—»: las 9 terminadas y 7 en curso anteriores a los cronómetros.
- La 144, excedida: `16 / 4,9 h` (es el cronómetro que quedó abierto, ver §7 de B).

**CAMBIO DE CONTRATO PROPUESTO (D):** agregar `hasPartialData` (o `startedBeforeTracking`) a `MachineLaborSnapshot`, para que `boardLabor()` no repita la regla de B y FA pueda usarla en producción.

## Observaciones

- **Tamaño del selector del panel:** hoy `listMachinesForActivities()` devuelve **103 máquinas**: 26 en producción, 9 terminadas y 68 despachadas dentro de `shipped_retention_days`. La lista tiene scroll propio (13rem) y el orden de B: cola, terminadas y despachadas, de la más reciente a la más antigua. Funciona, pero con 68 despachadas buscar una garantía es largo. Si molesta en planta, hay dos opciones:
  - mostrar las despachadas solo cuando «Arreglar máquinas» está marcada, o
  - bajar la retención para el panel.

  No lo hice: es decisión de producto.
- **Cartelera:** `attachMachineLabor` más `listCalculatedMachines` tardaron ~1,6 s en la consulta de prueba. Es razonable con el poll de 30 s.

## Verificación

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`: verde (22 archivos, 187 tests).
- **Visual** (maqueta con datos ficticios inyectada en `/planta` con el CSS compilado, a 1024×768): el selector con las tres etiquetas. La etiqueta queda alineada a la derecha y no se encoge, aunque el nombre ocupe tres líneas. La celda «Horas» no cambió de estilo desde la fase 1 (ver las medidas a 1920 y 1366 arriba).
- **Datos reales:** solo lectura (scripts de scratch con `listCalculatedMachines`, `attachMachineLabor` y `listMachinesForActivities`). No se crearon ni modificaron datos, y no hice push ni deploy.
- **Pendiente en el iPad real**, tras el deploy: iniciar «Empaque, carga e instalación» sobre una máquina «Terminada» y ver que la cartelera muestra «—» en las terminadas antiguas y «N / M h» en las demás.

---

# Handoff FP — corrección M5 (CONTRATO §9.5: la planta no expone salarios ni precios)

Base: `6b5ff7d` (fast-forward desde `1ac4c10`). Revisé el refactor del líder en la cartelera: `boardLabor()` ya usa `labor.hasPartialData` y la regla duplicada desapareció. La propuesta D de la fase 2 queda resuelta.

## Commits

- `5a02ad8 fix(planta): no enviar los salarios a la tablet en Operarios`
- `900aa8c fix(planta): no enviar venta ni % MO en la selección de varias máquinas`
- (este archivo) `docs(planificacion): handoff FP corrección M5`

## Qué cambió

| Archivo | Cambio |
|---|---|
| `src/app/planta/operarios/page.tsx` | `WorkerPicker` recibe `workers.map(→ { id, full_name, role, display_color })` y ya no las filas de `select *`, que traían `hourly_cost_cop`. |
| `src/components/factory/worker-picker.tsx` | Solo un comentario en `WorkerCard` que explica por qué es angosto. |
| `src/app/planta/maquinas/page.tsx` | `MachineMultiSelect` recibe `{ id, serialNumber, equipmentCode, equipmentName, clientName, stages: { id, name, completion }[] }` y ya no los `CalculatedMachineView` completos. Es el mismo patrón que la página `grupo`. |
| `src/components/factory/machine-multi-select.tsx` | `MultiSelectMachine.stages` se angosta a `Pick<StageView, "id" \| "name" \| "completion">[]`, que es lo que usa `StageStrip`, más un comentario del porqué. |

## Revisión de todos los componentes de cliente de `/planta/**`

| Página | Componente de cliente | Props | Estado |
|---|---|---|---|
| operarios | `WorkerPicker` | `workers` | **Corregido** (salarios). |
| operarios | `WorkerPicker` | `openSessions` (`OpenSessionSummary`) | Limpio. |
| maquinas | `MachineMultiSelect` | `machines` | **Corregido** (venta, % MO, horas y fechas internas). |
| maquinas | `ActivityPanel` | `machines` | Limpio: `listMachinesForActivities` mapea explícitamente `id, serialNumber, equipmentName, clientName, status`. |
| maquinas | `ActivityPanel` | `activityTypes` | Limpio: `mapActivityType` devuelve `id, name, description, sortOrder, allowsMachine, isActive`. |
| maquinas, [id], grupo | `ActiveSessionBar`, `PausedActivitiesBar`, `TaskGrid` | `OpenSessionView` / `PausedActivityView` / mapeo explícito | Limpio. Las máquinas de sesión son `id, serialNumber, equipmentName, clientName`; el select no trae precios. `TaskGrid` ya recibía `{ id, serialNumber, stages: { id, name, completion } }`. |
| almacen | `AlmacenManager` | `MachinePrevioListRow` | Limpio: `mapMachinePrevioListRow` mapea explícitamente, sin precios. |
| tablero | (ninguno con datos) | — | `BoardRow`, `BoardHoursCell`, `CellTooltip` y `Progress` son de servidor; solo `RealtimeRefresh` es de cliente (canal y tablas). |
| todas | `RealtimeRefresh`, `Link` | — | Sin datos de negocio. |

## Verificación

- `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`: verde (189 tests).
- **Script de solo lectura con datos reales.** Serializa con `JSON.stringify`, como el payload RSC, los props que cada página pasa a sus componentes de cliente, y busca `hourly_cost`, `salePriceCop`, `sale_price`, `laborFactor`, `labor_factor`, `equipmentLaborFactor`, `remainingHours` y `totalHours`.
  - **Antes:** `WorkerPicker.workers` mostraba la fuga `hourly_cost`. `MachineMultiSelect.machines` mostraba `salePriceCop, laborFactor, equipmentLaborFactor, remainingHours, totalHours` (50 KB).
  - **Después:** todo limpio. `MachineMultiSelect` bajó a 12 KB. `WorkerPicker.openSessions`, `ActivityPanel.machines` y `.activityTypes`, y `AlmacenManager.machines` estaban limpios desde antes.
- No pude revisar el HTML real de la tablet porque las páginas exigen la cookie de planta y no tengo la contraseña. El script replica el mapeo de las páginas; en el código, el mapeo es un objeto literal explícito, así que no puede colarse ningún campo extra.
- No se escribió nada en la base. No hice push ni deploy.

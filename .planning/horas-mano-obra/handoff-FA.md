# Handoff FA (frontend admin): fase 1

- **Rama:** `worktree-agent-aed6bf502b75396c2`
- **Worktree:** `/Users/simonb/xtensor/.claude/worktrees/agent-aed6bf502b75396c2`
- **Base:** `b39340f` (contrato y tipos de la fase 0; hice fast-forward desde `953ddd3`).
- **Verificación:** `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` en verde (17 archivos, 152 tests). `corepack pnpm build` también en verde.
- En la fase 1 no importé ningún servicio que todavía no existe: `machine-labor.ts`, `summarizeLaborByPeriod`, `listActivityTypeUsage` ni `resolveLaborGranularity`.

## Commits (`git log --oneline b39340f..HEAD`)

```
4964a10 feat(calculadora): usar el % MO del equipo elegido
2e56bda feat(maquinas): % MO del catálogo y H. máx en la edición de máquina
1e8b285 feat(estadisticas): «Mano de obra % (aprox. por fechas)» en el Resumen
4efbacf feat(estadisticas): pestaña Máquinas en Estadísticas
c5b9e2f feat(estadisticas): componentes de la pestaña Máquinas y de la ficha
058f859 feat(estadisticas): tabla «Jornada por período» (labor-period-table)
4b968d3 feat(produccion): columnas H. máx, H. llevadas y % MO
0b1b49d feat(estadisticas): medidor de presupuesto de horas (budget-meter)
6450f52 feat(configuracion): descripción y eliminar con «Mover sus horas a…» en actividades
66c3b20 feat(configuracion): «% mano de obra por defecto» en Parámetros
7210286 feat(catalogo): columna y campo % MO por equipo
```

## Archivos tocados

Todos son de FA. No toqué `actions.ts`, servicios, tipos, migraciones, la planta ni `globals.css`.

| Archivo | Cambio |
|---|---|
| `src/components/admin/stats-ui.tsx` | Helpers `formatLaborPct` (0.35 → «35%»), `ownLaborFactor` (tolera `labor_factor` ausente, null o texto) y `laborPctInputValue`. `MetricCard` gana la prop opcional `action` (un enlace bajo la fórmula). |
| `src/components/admin/catalog-unified-manager.tsx` | Columna «% MO»: el % propio o «30% (general)» en `--xt-steel`. Input `labor_pct` (type number, 1–100, `step="any"`) en `AddRow` y `EditPanel`. Prop nueva `generalLaborFactor: number`. |
| `src/app/admin/catalogo/page.tsx` | Pasa `generalLaborFactor`, sacado de `mapSettings(getSettings())`. |
| `src/components/admin/settings-form.tsx` | «% mano de obra por defecto», con la ayuda «Se usa en los equipos del catálogo sin % propio.». Se edita en % (30), pero un `<input type="hidden" name="labor_factor">` sigue enviando la **fracción** (0.3), así que `updateSettingsAction` no cambia. Cambié `--xt-green` (no existe) por `--line-bio-green`. |
| `src/app/admin/configuracion/page.tsx` | Pasa `usageById={{}}` (en la fase 2 será `listActivityTypeUsage()`). Cambié `--xt-green` y `--xt-red` por `--line-bio-green` y `--line-pro-red`. |
| `src/components/admin/activity-types-manager.tsx` | Campo `description` (máx. 120) al agregar y editar, y se muestra bajo el nombre. Prop `usageById`. «Eliminar»: sin uso, pide confirmación y envía `id`; con uso, abre un panel con `<select name="move_to_id" required>` «Mover sus horas a…» con las demás actividades (las inactivas se marcan «(inactiva)»), y confirma antes de enviar. |
| `src/components/admin/admin-flash-toast.tsx` | Mensajes para los códigos `?toast=` de actividades. Ver la propuesta 1 abajo. |
| `src/components/admin/budget-meter.tsx` (nuevo) | `BudgetMeter { budgetHours, spentHours, status, isFinal? }`, `BudgetHoursText`, `BudgetStatusBadge`, `BUDGET_STATUS_LABEL` y `formatLaborHours(hours)`. |
| `src/components/admin/production-table.tsx` | «H.Tot» pasa a «H. máx», con el tooltip del contrato; usa `labor?.budgetHours ?? totalHours`. Columnas nuevas «H. llevadas» («H. finales» en despachados), coloreada por `labor.status` y con «—» si no hay `labor`, y «% MO», en gris si viene del general. Las tres se pueden ordenar: `SortKey` gana las claves virtuales `laborBudgetHours` y `laborSpentHours`, y se exporta `machineSortValue()`. |
| `src/components/admin/production-table-panel.tsx`, `despachados-table-panel.tsx` | `sortMachines` usa `machineSortValue()`. |
| `src/components/admin/labor-period-table.tsx` (nuevo) | `LaborPeriodTable { rows, granularity, activityNames }`, `LaborSplitLegend`, `LaborGranularitySelector { active, hrefFor }`, `buildLaborPeriodSplit` (segmentos para un `TimeSplitBar` de totales), `sumLaborPeriods` y `LABOR_SPLIT_PARTS`. |
| `src/components/admin/machine-labor-report.tsx` (nuevo) | `MachineLaborKpis { totals }`, `MachineLaborTable { rows }`, `EquipmentLaborTable { rows }`, `MachineLaborFiltersForm { filters, equipmentOptions }` (formulario GET `?estado=&linea=&equipo=`), `TrackingSinceNote { trackingSince }`, `PartialDataBadge`, `ExpectedLaborPct`, `RealLaborPct`, `MACHINE_STATUS_LABEL`, `machineLaborDetailHref(id)` y `formatDateBogota`. |
| `src/components/admin/machine-labor-detail.tsx` (nuevo) | `MachineLaborHeader { detail }`, `MachineLaborStagesTable { rows }`, `MachineLaborWorkersTable { rows }`, `MachineLaborActivitiesTable { rows }` y `MachineLaborSessionsTable { rows }`. |
| `src/components/admin/statistics-tabs.tsx` | Resumen \| Horas-hombre \| Máquinas (`/admin/estadisticas/maquinas`); `active` acepta `"maquinas"`. La ruta todavía no existe y da 404 hasta la fase 2. |
| `src/app/admin/estadisticas/page.tsx` | El indicador y la columna pasan a «Mano de obra % (aprox. por fechas)», con el enlace «Ver % MO real por máquina». |
| `src/app/admin/maquinas/[id]/page.tsx`, `src/components/admin/machine-edit-form.tsx` | Muestra en solo lectura «% MO del catálogo: X%» (con «(general)» si el equipo no tiene % propio) y «H. máx: N», calculados con `resolveLaborFactor` y `estimateTotalHours(precio, settings, equipmentLaborFactor)`. Incluye un enlace al Catálogo. |
| `src/components/admin/catalog-combobox.tsx` | `onChange?: (id \| null) => void` opcional. |
| `src/components/admin/calculator-form.tsx`, `src/app/admin/calculadora/page.tsx` | Antes la calculadora no recibía el catálogo. Ahora tiene un selector opcional «Equipo»: las horas y la fecha usan `estimateTotalHours(precio, settings, labor_factor del equipo)`, y se muestra el % que se usó y de dónde sale. |

## Colores y textos

- Reparto de la jornada, en el orden del contrato: Máquinas `--xt-black` · Reproceso `--line-pro-red` · Actividades con máquina `--line-semi-cyan` · Planta (5S y otras) `--xt-yellow-deep` · Sin registrar `--xt-aluminum`.
- Presupuesto:
  - ok: texto normal.
  - Riesgo: fondo `--xt-yellow-deep` con texto negro. El amarillo como color de texto no se lee sobre blanco.
  - Excedida: fondo `--line-pro-red` con texto blanco.
  - En el medidor, la barra se llena con el color del estado (ok = `--xt-black`).
- Los textos del contrato se usan tal cual: «H. máx» con su tooltip, «H. llevadas», «H. finales», «% consumido», «% MO esperado», «% MO real», «En riesgo», «Excedida», «Datos parciales», «Asignado a máquinas», «No asignado», «Día», «Semana», «Mes», «Mover sus horas a…» y «Los cronómetros existen desde …».

## Desviaciones del contrato (menores, todas aditivas)

1. `BudgetMeter` acepta además `isFinal?: boolean`, que cambia la etiqueta a «H. finales» y muestra «Terminó en X de Y».
2. En la tabla de producción, «H. máx» usa `machine.labor.budgetHours` cuando existe. Así las despachadas no muestran 0, porque `totalHours` vale 0 fuera de la cola. Si no hay `labor`, usa `totalHours`.
3. `settings-form` edita en %, pero envía `labor_factor` como fracción con un input oculto. Ni el nombre ni el formato del campo cambian para B.
4. Los porcentajes de `LaborPeriodTable` usan como base `max(availableMinutes, suma de las 5 partes)`. Así no pasan de 100 % si hay cronómetros solapados.
5. En `minutesByActivityType`, la clave `"sin-clasificar"` se muestra como «Sin clasificar». Un id que no esté en `activityNames` se muestra como «Actividad eliminada».

## CAMBIOS DE CONTRATO PROPUESTOS

1. **Códigos `?toast=` de `deleteActivityTypeAction`** (B). El contrato pide redirigir a `/admin/configuracion?toast=…#actividades`, pero no fija los códigos. Los dejé implementados en `admin-flash-toast.tsx`:
   - `actividad-eliminada`: se borró una actividad sin uso.
   - `actividad-movida`: se fusionó con `move_to_id` y luego se borró.
   - `actividad-con-horas`: tiene uso y no llegó `move_to_id`. El mensaje es «Esta actividad tiene horas registradas. Elige a qué actividad moverlas.».
   - `actividad-error`: cualquier otro error.

   Si B usa otros códigos, los cambio en la fase 2.
2. **(Opcional) `attachMachineLabor` también en `/admin/despachados`.** La tabla de despachados ya muestra «H. finales» cuando llega `labor`; si no, muestra «—». Si el líder lo quiere, lo conecto en la fase 2.
3. **(Opcional, B) Excel de producción** (`/admin/export`, `src/services/excel.ts`): renombrar la columna «H.Tot» a «H. máx» para que coincida con la tabla.
4. **`labor_pct`** llega del navegador con punto decimal («32.5»), porque es `type="number"`. B ya acepta coma y punto, así que no hace falta cambiar nada; solo lo confirmo.

## Qué queda para la fase 2

Después de rebasar sobre `main` y leer `handoff-B.md`:

1. **`/admin/estadisticas/maquinas/page.tsx`**:
   - Usa `resolveMachineLaborFilters(searchParams)` y `getMachineLaborReport(filters)`.
   - Muestra `StatisticsTabs active="maquinas"`, `MachineLaborFiltersForm` (las opciones de equipo salen de `listCatalog()`), `MachineLaborKpis`, `MachineLaborTable`, `EquipmentLaborTable` y `TrackingSinceNote`.
   - Agrega `RealtimeRefresh` si aplica.
2. **`/admin/estadisticas/maquinas/[id]/page.tsx`**:
   - Usa `getMachineLaborDetail(id)`; si devuelve null, `notFound()`.
   - Muestra `MachineLaborHeader` y `BudgetMeter` (con `machine.budgetHours`, `spentHours`, `budgetStatus` e `isFinal` según el estado), además de las tablas de etapas, operarios, actividades y bitácora.
3. **Horas-hombre** (`/admin/estadisticas/horas`):
   - Llama `getLaborDashboard(range, { granularity: resolveLaborGranularity(query.vista) })`.
   - Pone `LaborGranularitySelector` junto a los rangos, conservando `?rango=`; los botones de rango deben conservar a su vez `?vista=`.
   - Agrega la sección «Jornada por período» con `LaborPeriodTable` (con `activityNames` de `listActivityTypes()`) y, si conviene, un `TimeSplitBar` de totales con `buildLaborPeriodSplit(sumLaborPeriods(periods))`.
   - Agrega los rangos «Últimos 3 meses» (`ultimos-90-dias`) y «Este año» (`este-ano`).
4. **Ficha de operario**: la misma sección, con `getLaborDashboard(range, { granularity, workerId })`, y los rangos nuevos.
5. **Configuración**: `usageById = await listActivityTypeUsage()`. Ajustar los códigos de toast si B usó otros.
6. **`/admin/page.tsx`**: `attachMachineLabor(machines, settings)` antes de `ProductionTablePanel`. Según la propuesta 2, quizás también en despachados.
7. `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`.

## Cómo verificar (fase 1)

- `/admin/catalogo`:
  - La columna «% MO» muestra «30% (general)» en gris en todos los equipos mientras la 0029 no tenga datos.
  - Editar un equipo y poner 35 envía `labor_pct=35`.
  - Vaciar el campo envía `""`.
- `/admin/configuracion`:
  - El campo se llama «% mano de obra por defecto» y muestra 30.
  - Al guardar se envía `labor_factor=0.3`.
  - En Actividades se ven los campos de descripción y el botón «Eliminar». Con `usageById={{}}` nunca aparece el selector; para probarlo, pasar un uso a mano.
- `/admin`: columnas «% MO», «H. máx» y «H. llevadas». La última muestra «—» hasta la fase 2.
- `/admin/despachados`: columnas «% MO», «H. máx» y «H. finales».
- `/admin/estadisticas`: el indicador dice «Mano de obra % (aprox. por fechas)» y tiene el enlace. La pestaña «Máquinas» da 404 hasta la fase 2.
- `/admin/maquinas/[id]`: el bloque de solo lectura muestra «% MO del catálogo» y «H. máx».
- `/admin/calculadora`: al elegir un equipo con % propio cambian las horas y la fecha; sin equipo se usa el general.

Nota: la primera vez que corrí `pnpm build` se interrumpió (el líder me detuvo por un límite de uso). La volví a correr cuando él lo pidió y pasó.

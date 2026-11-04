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

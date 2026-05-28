# MVP acceptance tracking

| Criterion | Status | Evidence |
| --- | --- | --- |
| Operario can update a stage in <= 5 taps from locked iPad | Implemented, needs live QA | `/planta` -> `/planta/operarios` -> `/planta/maquinas` -> detail -> percentage action. |
| Undo is available in <= 2 taps | Partially implemented | Immediate snackbar-style undo exists after stage update; session action panel remains pending. |
| Admin dashboard loads the production plan and reflects changes realtime | Implemented, needs live QA | `/admin` table plus `RealtimeRefresh` subscriptions. |
| Excel formulas match `Avance %`, `Horas faltantes`, `Acumulado`, `Estimado` within <= 1% | Partially implemented | Tests cover progress, total hours, remaining hours, human-days, and accumulated hours for 45 rows; estimated-date text still needs full calendar parity. |
| Client portal shows dashboard progress with 3-day buffer | Implemented, needs live QA | `/c/[token]` uses calculated machines and `clientBufferDays`. |
| Only admins modify catalog, settings, and machines | Implemented at schema level | RLS policies require `profiles.role = 'admin'`; server actions still need live Supabase verification. |
| Only admins mark machines as dispatched | Implemented at schema level | Admin action exists and RLS protects machine updates. |

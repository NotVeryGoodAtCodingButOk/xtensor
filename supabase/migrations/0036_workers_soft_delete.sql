-- Eliminar operarios sin perder historial: la fila se conserva (sesiones de
-- trabajo, bitácora de etapas y costos por hora siguen apuntando a ella) y
-- deleted_at la oculta de las listas del admin y del selector de planta.
alter table public.workers add column if not exists deleted_at timestamptz;

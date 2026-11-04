-- La cola se reordena con reorder_production_queue (0031), que guarda
-- order_position y reestimated_date en una sola transacción. La RPC vieja se
-- mantuvo hasta desplegar la versión que ya no la llama (2026-11-04); se borra
-- para que no quede un camino que reordene sin tocar la reestimada.
drop function if exists public.reorder_in_production_machines(uuid[]);

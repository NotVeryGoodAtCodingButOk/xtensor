-- Disambiguate the two "jaula de potencia" catalog entries by pulley setup.
-- These names are a deliberate operator decision and override the master list.
--   XM175: "Jaula de potencia"           -> "Jaula de potencia sin poleas"
--   XM181: "Jaula de Potencia para peso" -> "Jaula de potencia con poleas"
-- Names only; ids, codes, prices, machine links and previos are preserved.

update public.equipment_catalog
  set name = 'Jaula de potencia sin poleas', updated_at = now()
  where code = 'XM175';

update public.equipment_catalog
  set name = 'Jaula de potencia con poleas', updated_at = now()
  where code = 'XM181';

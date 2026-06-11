-- Align equipment_catalog names to the LMP FEB 2026 master list.
-- These rows share the master code but had drifted names (case/accent/spacing
-- or slightly different wording). The user decided to align the DB to the
-- master wording. Names only — ids, codes, prices, machine links and previos
-- are all preserved (relationships reference equipment_catalog.id, not name).

begin;

update public.equipment_catalog set name = 'Crossover Compacto, en V.',                  updated_at = now() where code = 'XM114';
update public.equipment_catalog set name = 'Dominadas y fondos.',                         updated_at = now() where code = 'XM115';
update public.equipment_catalog set name = 'Flexor',                                      updated_at = now() where code = 'XM121';
update public.equipment_catalog set name = 'Hammer pecho declinado',                      updated_at = now() where code = 'XM127';
update public.equipment_catalog set name = 'Hammer pecho inclinado',                      updated_at = now() where code = 'XM128';
update public.equipment_catalog set name = 'Hammer pecho plano',                          updated_at = now() where code = 'XM129';
update public.equipment_catalog set name = 'Multifuerza 4 estaciones',                    updated_at = now() where code = 'XM138';
update public.equipment_catalog set name = 'Multifuerza 8 estaciones',                    updated_at = now() where code = 'XM139';
update public.equipment_catalog set name = 'Sentadilla Smith 2.0 (clasica)',              updated_at = now() where code = 'XM170';
update public.equipment_catalog set name = 'Sentadilla hack up 3.0',                      updated_at = now() where code = 'XM185';
update public.equipment_catalog set name = 'Sentadilla smith con poleas 2.0 sin señales',  updated_at = now() where code = 'XM189';
update public.equipment_catalog set name = 'Rack para mancuernas 3 niveles',              updated_at = now() where code = 'XM906';
update public.equipment_catalog set name = 'Carrusel Infantil',                           updated_at = now() where code = 'XJ505';
update public.equipment_catalog set name = 'Banco Olimpico Multifunción',                 updated_at = now() where code = 'XM195';

commit;

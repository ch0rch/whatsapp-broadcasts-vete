-- Fix W-1: Add 'rabbit' to pets.species CHECK constraint
-- The initial migration (0001_init.sql) was missing 'rabbit' from the allowed species list.
-- Spec (Capability 2 / Data Schema Sketch) requires: ('dog','cat','bird','rabbit','other')

alter table pets drop constraint pets_species_check;
alter table pets add constraint pets_species_check
  check (species in ('dog', 'cat', 'bird', 'rabbit', 'other'));

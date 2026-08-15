-- Two changes that were first applied directly to the running database while
-- seeding demo data. Recorded here so a rebuild from migrations produces the
-- same schema — otherwise the files and the live database quietly disagree.

-- ---------------------------------------------------------------------------
-- 1. A 'demo' image source
-- ---------------------------------------------------------------------------
--
-- Placeholder stock photography, so the product can be looked at before any
-- real image exists. Unlike every other source these are remote URLs we do not
-- hold, so they carry a source_url and no storage_path.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds it,
-- which is why the constraint changes are separate statements below.
alter type rl_image_source add value if not exists 'demo';

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_import_batches (
  id TEXT PRIMARY KEY,
  source_dataset TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_type TEXT NOT NULL,
  data_version TEXT NOT NULL,
  is_desensitized BOOLEAN NOT NULL DEFAULT TRUE,
  source_path TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'dry_run')),
  raw_item_count INTEGER NOT NULL DEFAULT 0 CHECK (raw_item_count >= 0),
  processed_item_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_item_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_batches_source
  ON catalog_import_batches (source_dataset, source_version);

CREATE INDEX IF NOT EXISTS idx_catalog_import_batches_started_at
  ON catalog_import_batches (started_at);

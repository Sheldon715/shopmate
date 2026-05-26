CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  image_path TEXT,
  image_caption TEXT,
  currency TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  price_min_cents INTEGER NOT NULL CHECK (price_min_cents >= 0),
  price_max_cents INTEGER NOT NULL CHECK (price_max_cents >= 0),
  marketing_description TEXT NOT NULL DEFAULT '',
  knowledge_text TEXT NOT NULL DEFAULT '',
  rating_avg NUMERIC(3, 2) CHECK (rating_avg IS NULL OR (rating_avg >= 0 AND rating_avg <= 5)),
  category_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  visual_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  pros JSONB NOT NULL DEFAULT '[]'::jsonb,
  cons JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommend_when JSONB NOT NULL DEFAULT '[]'::jsonb,
  avoid_when JSONB NOT NULL DEFAULT '[]'::jsonb,
  compare_with JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  official_faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_reviews JSONB NOT NULL DEFAULT '[]'::jsonb,
  normalized_payload JSONB NOT NULL,
  source_dataset TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_type TEXT NOT NULL,
  data_version TEXT NOT NULL,
  is_desensitized BOOLEAN NOT NULL DEFAULT TRUE,
  ingest_batch_id TEXT NOT NULL REFERENCES catalog_import_batches (id) ON DELETE RESTRICT,
  source_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (price_min_cents <= price_max_cents)
);

CREATE TABLE IF NOT EXISTS product_skus (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  stock_level TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_status
  ON products (status);

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (category);

CREATE INDEX IF NOT EXISTS idx_products_sub_category
  ON products (sub_category);

CREATE INDEX IF NOT EXISTS idx_products_brand
  ON products (brand);

CREATE INDEX IF NOT EXISTS idx_products_price_range
  ON products (price_min_cents, price_max_cents);

CREATE INDEX IF NOT EXISTS idx_products_ingest_batch
  ON products (ingest_batch_id);

CREATE INDEX IF NOT EXISTS idx_product_skus_product_id
  ON product_skus (product_id);

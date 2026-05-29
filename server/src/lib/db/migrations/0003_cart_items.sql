CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cart_items_user_product UNIQUE (user_key, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_key
  ON cart_items (user_key);

CREATE INDEX IF NOT EXISTS idx_cart_items_product_id
  ON cart_items (product_id);

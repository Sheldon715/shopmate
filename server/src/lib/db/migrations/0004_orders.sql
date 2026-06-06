CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('mock_created', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'CNY',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  shipping_name TEXT NOT NULL,
  shipping_phone_masked TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('chat_agent', 'cart_button')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  brand_snapshot TEXT NOT NULL,
  category_snapshot TEXT NOT NULL,
  unit_price_cents_snapshot INTEGER NOT NULL CHECK (unit_price_cents_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
  subtotal_cents_snapshot INTEGER NOT NULL CHECK (subtotal_cents_snapshot >= 0),
  image_path_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_key_created_at
  ON orders (user_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

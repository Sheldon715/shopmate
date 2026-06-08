ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_source_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('chat_agent', 'cart_button', 'buy_now'));

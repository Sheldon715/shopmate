ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_label TEXT NOT NULL DEFAULT '订单收货信息',
  ADD COLUMN IF NOT EXISTS delivery_method_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS delivery_method_label TEXT NOT NULL DEFAULT '标准配送',
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT NOT NULL DEFAULT 'wechat',
  ADD COLUMN IF NOT EXISTS payment_method_label TEXT NOT NULL DEFAULT '微信支付',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_charged';

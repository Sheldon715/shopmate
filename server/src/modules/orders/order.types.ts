import type { MockShippingAddress, PendingCheckoutItem } from "./checkout.types";

export type OrderStatus = "mock_created" | "cancelled";
export type OrderSource = "chat_agent" | "cart_button";

export interface OrderRow {
  id: string;
  order_number: string;
  user_key: string;
  status: OrderStatus;
  currency: "CNY";
  subtotal_cents: number;
  shipping_fee_cents: number;
  total_cents: number;
  shipping_name: string;
  shipping_phone_masked: string;
  shipping_address: string;
  source: OrderSource;
  created_at: Date;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  brand_snapshot: string;
  category_snapshot: string;
  unit_price_cents_snapshot: number;
  quantity: number;
  subtotal_cents_snapshot: number;
  image_path_snapshot: string | null;
  created_at: Date;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  brandSnapshot: string;
  categorySnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  subtotalCentsSnapshot: number;
  imagePathSnapshot: string | null;
  createdAt: Date;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  userKey: string;
  status: OrderStatus;
  currency: "CNY";
  subtotalCents: number;
  shippingFeeCents: number;
  totalCents: number;
  shippingName: string;
  shippingPhoneMasked: string;
  shippingAddress: string;
  source: OrderSource;
  createdAt: Date;
  items: OrderItemRecord[];
}

export interface CreateOrderInput {
  id: string;
  orderNumber: string;
  userKey: string;
  status: OrderStatus;
  currency: "CNY";
  subtotalCents: number;
  shippingFeeCents: number;
  totalCents: number;
  shippingAddress: MockShippingAddress;
  source: OrderSource;
  items: Array<PendingCheckoutItem & { id: string; orderId: string }>;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  brand: string;
  category: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  imagePath: string | null;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: "CNY";
  subtotalCents: number;
  shippingFeeCents: number;
  totalCents: number;
  shippingAddress: MockShippingAddress;
  source: OrderSource;
  createdAt: string;
  items: OrderItemDto[];
}

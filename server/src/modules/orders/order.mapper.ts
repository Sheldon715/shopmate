import type {
  OrderDto,
  OrderItemDto,
  OrderItemRecord,
  OrderItemRow,
  OrderRecord,
  OrderRow,
} from "./order.types";

export function mapOrderItemRowToRecord(row: OrderItemRow): OrderItemRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productNameSnapshot: row.product_name_snapshot,
    brandSnapshot: row.brand_snapshot,
    categorySnapshot: row.category_snapshot,
    unitPriceCentsSnapshot: row.unit_price_cents_snapshot,
    quantity: row.quantity,
    subtotalCentsSnapshot: row.subtotal_cents_snapshot,
    imagePathSnapshot: row.image_path_snapshot,
    createdAt: row.created_at,
  };
}

export function mapOrderRowToRecord(
  row: OrderRow,
  items: OrderItemRecord[],
): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userKey: row.user_key,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    shippingFeeCents: row.shipping_fee_cents,
    totalCents: row.total_cents,
    shippingName: row.shipping_name,
    shippingPhoneMasked: row.shipping_phone_masked,
    shippingAddress: row.shipping_address,
    source: row.source,
    createdAt: row.created_at,
    items,
  };
}

export function mapOrderToDto(order: OrderRecord): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    subtotalCents: order.subtotalCents,
    shippingFeeCents: order.shippingFeeCents,
    totalCents: order.totalCents,
    shippingAddress: {
      label: "模拟收货地址",
      recipient: order.shippingName,
      phoneMasked: order.shippingPhoneMasked,
      fullAddress: order.shippingAddress,
    },
    source: order.source,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map(mapOrderItemToDto),
  };
}

function mapOrderItemToDto(item: OrderItemRecord): OrderItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productNameSnapshot,
    brand: item.brandSnapshot,
    category: item.categorySnapshot,
    unitPriceCents: item.unitPriceCentsSnapshot,
    quantity: item.quantity,
    subtotalCents: item.subtotalCentsSnapshot,
    imagePath: item.imagePathSnapshot,
  };
}

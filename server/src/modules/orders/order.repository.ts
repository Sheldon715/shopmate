import type { Pool, PoolClient } from "pg";
import {
  mapOrderItemRowToRecord,
  mapOrderRowToRecord,
} from "./order.mapper";
import type {
  CreateOrderInput,
  OrderItemRecord,
  OrderItemRow,
  OrderRecord,
  OrderRow,
} from "./order.types";

type OrderQueryClient = Pool | PoolClient;

export interface CheckoutCartItemGuard {
  id: string;
  quantity: number;
}

export async function createOrder(
  client: PoolClient,
  input: CreateOrderInput,
): Promise<OrderRecord> {
  const orderResult = await client.query<OrderRow>(
    `
      INSERT INTO orders (
        id,
        order_number,
        user_key,
        status,
        currency,
        subtotal_cents,
        shipping_fee_cents,
        total_cents,
        shipping_name,
        shipping_phone_masked,
        shipping_address,
        source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
    [
      input.id,
      input.orderNumber,
      input.userKey,
      input.status,
      input.currency,
      input.subtotalCents,
      input.shippingFeeCents,
      input.totalCents,
      input.shippingAddress.recipient,
      input.shippingAddress.phoneMasked,
      input.shippingAddress.fullAddress,
      input.source,
    ],
  );

  const itemRecords: OrderItemRecord[] = [];

  for (const item of input.items) {
    const itemResult = await client.query<OrderItemRow>(
      `
        INSERT INTO order_items (
          id,
          order_id,
          product_id,
          product_name_snapshot,
          brand_snapshot,
          category_snapshot,
          unit_price_cents_snapshot,
          quantity,
          subtotal_cents_snapshot,
          image_path_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        item.id,
        item.orderId,
        item.productId,
        item.productName,
        item.brand,
        item.category,
        item.unitPriceCents,
        item.quantity,
        item.subtotalCents,
        item.imagePath,
      ],
    );
    const row = itemResult.rows[0];

    if (row) {
      itemRecords.push(mapOrderItemRowToRecord(row));
    }
  }

  return mapOrderRowToRecord(orderResult.rows[0] as OrderRow, itemRecords);
}

export async function findOrderById(
  client: OrderQueryClient,
  orderId: string,
): Promise<OrderRecord | null> {
  const orderResult = await client.query<OrderRow>(
    `
      SELECT *
      FROM orders
      WHERE id = $1
      LIMIT 1
    `,
    [orderId],
  );
  const orderRow = orderResult.rows[0];

  if (!orderRow) {
    return null;
  }

  const itemResult = await client.query<OrderItemRow>(
    `
      SELECT *
      FROM order_items
      WHERE order_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [orderId],
  );

  return mapOrderRowToRecord(
    orderRow,
    itemResult.rows.map(mapOrderItemRowToRecord),
  );
}

export async function deleteCartItemsForCheckout(
  client: PoolClient,
  userKey: string,
  cartItems: CheckoutCartItemGuard[],
): Promise<number> {
  if (cartItems.length === 0) {
    return 0;
  }

  const result = await client.query(
    `
      WITH expected_cart_items AS (
        SELECT *
        FROM UNNEST($2::text[], $3::integer[]) AS expected(id, quantity)
      )
      DELETE FROM cart_items AS cart
      USING expected_cart_items AS expected
      WHERE cart.user_key = $1
        AND cart.id = expected.id
        AND cart.quantity = expected.quantity
        AND cart.selected = TRUE
    `,
    [
      userKey,
      cartItems.map((item) => item.id),
      cartItems.map((item) => item.quantity),
    ],
  );

  return result.rowCount ?? 0;
}

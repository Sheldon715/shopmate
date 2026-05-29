import type { Pool, PoolClient } from "pg";
import { mapCartItemRowToRecord } from "./cart.mapper";
import type {
  CartItemRecord,
  CartItemRow,
  CartItemUpdateInput,
  CartItemUpsertInput,
} from "./cart.types";

type CartQueryClient = Pool | PoolClient;

export async function findCartItems(
  client: CartQueryClient,
  userKey: string,
): Promise<CartItemRecord[]> {
  const result = await client.query<CartItemRow>(
    `
      SELECT *
      FROM cart_items
      WHERE user_key = $1
      ORDER BY updated_at DESC, created_at DESC, id ASC
    `,
    [userKey],
  );

  return result.rows.map(mapCartItemRowToRecord);
}

export async function upsertCartItem(
  client: CartQueryClient,
  input: CartItemUpsertInput,
): Promise<CartItemRecord> {
  const result = await client.query<CartItemRow>(
    `
      INSERT INTO cart_items (id, user_key, product_id, quantity, selected)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (user_key, product_id) DO UPDATE SET
        quantity = LEAST(99, cart_items.quantity + EXCLUDED.quantity),
        selected = TRUE,
        updated_at = NOW()
      RETURNING *
    `,
    [input.id, input.userKey, input.productId, input.quantity],
  );

  return mapCartItemRowToRecord(result.rows[0] as CartItemRow);
}

export async function updateCartItem(
  client: CartQueryClient,
  input: CartItemUpdateInput,
): Promise<CartItemRecord | null> {
  const result = await client.query<CartItemRow>(
    `
      UPDATE cart_items
      SET
        quantity = COALESCE($3, quantity),
        selected = COALESCE($4, selected),
        updated_at = NOW()
      WHERE user_key = $1
        AND id = $2
      RETURNING *
    `,
    [
      input.userKey,
      input.itemId,
      input.quantity ?? null,
      input.selected ?? null,
    ],
  );
  const row = result.rows[0];

  return row ? mapCartItemRowToRecord(row) : null;
}

export async function deleteCartItem(
  client: CartQueryClient,
  userKey: string,
  itemId: string,
): Promise<boolean> {
  const result = await client.query(
    `
      DELETE FROM cart_items
      WHERE user_key = $1
        AND id = $2
    `,
    [userKey, itemId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function selectAllCartItems(
  client: CartQueryClient,
  userKey: string,
  selected: boolean,
): Promise<void> {
  await client.query(
    `
      UPDATE cart_items
      SET selected = $2,
          updated_at = NOW()
      WHERE user_key = $1
    `,
    [userKey, selected],
  );
}

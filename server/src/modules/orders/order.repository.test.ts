import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { createOrder } from "./order.repository";
import type {
  CreateOrderInput,
  OrderItemRow,
  OrderRow,
} from "./order.types";

interface QueryCall {
  sql: string;
  params?: readonly unknown[];
}

describe("order.repository", () => {
  it("keeps order insert placeholders aligned with snapshot columns", async () => {
    const calls: QueryCall[] = [];
    const client = {
      query: async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });

        if (sql.includes("INSERT INTO orders")) {
          return { rows: [createOrderRow()] };
        }

        return { rows: [createOrderItemRow()] };
      },
    } as unknown as PoolClient;

    await createOrder(client, createOrderInput());

    const orderInsert = calls[0];

    expect(orderInsert?.params).toHaveLength(18);
    expect(orderInsert?.sql).toContain("$18");

    const placeholderNumbers = Array.from(
      orderInsert?.sql.matchAll(/\$(\d+)/g) ?? [],
      (match) => Number(match[1]),
    );

    expect(Math.max(...placeholderNumbers)).toBe(orderInsert?.params?.length);
    expect(new Set(placeholderNumbers).size).toBe(orderInsert?.params?.length ?? 0);
  });
});

function createOrderInput(): CreateOrderInput {
  return {
    id: "order_1",
    orderNumber: "MOCK-20260606000000-TEST",
    userKey: "demo-user",
    status: "mock_created",
    currency: "CNY",
    subtotalCents: 19900,
    shippingFeeCents: 1200,
    totalCents: 21100,
    shippingAddress: {
      label: "订单收货信息",
      recipient: "张三",
      phoneMasked: "138****0000",
      fullAddress: "ShopMate 演示公寓",
    },
    deliveryMethod: {
      type: "express",
      label: "加急配送",
      feeCents: 1200,
    },
    paymentMethod: {
      type: "alipay",
      label: "支付宝",
      status: "not_charged",
    },
    source: "cart_button",
    items: [{
      id: "order_item_1",
      orderId: "order_1",
      cartItemId: "cart_item_1",
      productId: "product_1",
      productName: "通勤蓝牙耳机",
      brand: "示例品牌",
      category: "数码电子",
      unitPriceCents: 19900,
      quantity: 1,
      subtotalCents: 19900,
      imagePath: "/products/earbuds.png",
    }],
  };
}

function createOrderRow(): OrderRow {
  return {
    id: "order_1",
    order_number: "MOCK-20260606000000-TEST",
    user_key: "demo-user",
    status: "mock_created",
    currency: "CNY",
    subtotal_cents: 19900,
    shipping_fee_cents: 1200,
    total_cents: 21100,
    shipping_label: "订单收货信息",
    shipping_name: "张三",
    shipping_phone_masked: "138****0000",
    shipping_address: "ShopMate 演示公寓",
    delivery_method_type: "express",
    delivery_method_label: "加急配送",
    payment_method_type: "alipay",
    payment_method_label: "支付宝",
    payment_status: "not_charged",
    source: "cart_button",
    created_at: new Date("2026-06-06T00:00:00.000Z"),
  };
}

function createOrderItemRow(): OrderItemRow {
  return {
    id: "order_item_1",
    order_id: "order_1",
    product_id: "product_1",
    product_name_snapshot: "通勤蓝牙耳机",
    brand_snapshot: "示例品牌",
    category_snapshot: "数码电子",
    unit_price_cents_snapshot: 19900,
    quantity: 1,
    subtotal_cents_snapshot: 19900,
    image_path_snapshot: "/products/earbuds.png",
    created_at: new Date("2026-06-06T00:00:00.000Z"),
  };
}

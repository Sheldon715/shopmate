import { describe, expect, it } from "vitest";
import type { Product, ProductSku } from "../products/product.types";
import {
  CartItemNotFoundError,
  CartProductNotFoundError,
  CartProductUnavailableError,
  CartRequestError,
  CartService,
  MAX_CART_QUANTITY,
  parseAddCartItemBody,
  parsePatchCartItemBody,
} from "./cart.service";
import type {
  CartItemRecord,
  CartItemUpdateInput,
  CartItemUpsertInput,
} from "./cart.types";

describe("cart request parsing", () => {
  it("uses quantity 1 as the default add quantity", () => {
    expect(parseAddCartItemBody({ productId: " product_001 " })).toEqual({
      productId: "product_001",
      quantity: 1,
    });
  });

  it("rejects invalid quantities", () => {
    expect(() =>
      parseAddCartItemBody({ productId: "product_001", quantity: 0 }),
    ).toThrow(CartRequestError);
    expect(() =>
      parseAddCartItemBody({ productId: "product_001", quantity: 100 }),
    ).toThrow(CartRequestError);
    expect(() =>
      parseAddCartItemBody({ productId: "product_001", quantity: 1.5 }),
    ).toThrow(CartRequestError);
  });

  it("requires at least one patch field", () => {
    expect(() => parsePatchCartItemBody({})).toThrow(CartRequestError);
  });
});

describe("CartService", () => {
  it("adds an active product to the cart", async () => {
    const store = new InMemoryCartStore([productFixture("product_001")]);
    const service = new CartService(store);

    const cart = await service.addItem({
      productId: "product_001",
      quantity: 2,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      productId: "product_001",
      name: "通勤蓝牙耳机",
      quantity: 2,
      selected: true,
      subtotalCents: 39800,
      imagePath: "/images/products/digital/images/product_001.png",
    });
    expect(cart.summary).toEqual({
      totalCount: 2,
      selectedCount: 2,
      selectedTotalCents: 39800,
      currency: "CNY",
    });
  });

  it("merges duplicate adds into the existing cart item", async () => {
    const store = new InMemoryCartStore([productFixture("product_001")]);
    const service = new CartService(store);

    await service.addItem({ productId: "product_001", quantity: 1 });
    const cart = await service.addItem({
      productId: "product_001",
      quantity: 3,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(4);
  });

  it("caps merged quantities at the maximum cart quantity", async () => {
    const store = new InMemoryCartStore([productFixture("product_001")]);
    const service = new CartService(store);

    await service.addItem({
      productId: "product_001",
      quantity: MAX_CART_QUANTITY,
    });
    const cart = await service.addItem({
      productId: "product_001",
      quantity: 1,
    });

    expect(cart.items[0]?.quantity).toBe(MAX_CART_QUANTITY);
  });

  it("updates quantity and selected state", async () => {
    const store = new InMemoryCartStore([productFixture("product_001")]);
    const service = new CartService(store);
    const added = await service.addItem({
      productId: "product_001",
      quantity: 2,
    });

    const updated = await service.updateItem(added.items[0]?.id ?? "", {
      quantity: 5,
      selected: false,
    });

    expect(updated.items[0]?.quantity).toBe(5);
    expect(updated.items[0]?.selected).toBe(false);
    expect(updated.summary.selectedCount).toBe(0);
    expect(updated.summary.selectedTotalCents).toBe(0);
  });

  it("deletes cart items", async () => {
    const store = new InMemoryCartStore([productFixture("product_001")]);
    const service = new CartService(store);
    const added = await service.addItem({
      productId: "product_001",
      quantity: 1,
    });

    const cart = await service.deleteItem(added.items[0]?.id ?? "");

    expect(cart.items).toEqual([]);
    expect(cart.summary.totalCount).toBe(0);
  });

  it("throws clear errors for missing and unavailable products", async () => {
    const unavailableProduct = productFixture("product_002", {
      skuAvailable: false,
    });
    const store = new InMemoryCartStore([unavailableProduct]);
    const service = new CartService(store);

    await expect(
      service.addItem({ productId: "missing", quantity: 1 }),
    ).rejects.toThrow(CartProductNotFoundError);
    await expect(
      service.addItem({ productId: "product_002", quantity: 1 }),
    ).rejects.toThrow(CartProductUnavailableError);
  });

  it("throws when updating a missing item", async () => {
    const service = new CartService(new InMemoryCartStore([]));

    await expect(
      service.updateItem("missing", { selected: true }),
    ).rejects.toThrow(CartItemNotFoundError);
  });
});

class InMemoryCartStore {
  private readonly productsById: Map<string, Product>;
  private readonly cartItems = new Map<string, CartItemRecord>();

  constructor(products: Product[]) {
    this.productsById = new Map(
      products.map((product) => [product.id, product]),
    );
  }

  findCartItems = async (userKey: string): Promise<CartItemRecord[]> =>
    [...this.cartItems.values()].filter((item) => item.userKey === userKey);

  findProductsByIds = async (productIds: string[]): Promise<Product[]> =>
    productIds.flatMap((productId) => {
      const product = this.productsById.get(productId);

      return product ? [product] : [];
    });

  findProductById = async (productId: string): Promise<Product | null> =>
    this.productsById.get(productId) ?? null;

  upsertCartItem = async (
    input: CartItemUpsertInput,
  ): Promise<CartItemRecord> => {
    const existing = [...this.cartItems.values()].find(
      (item) =>
        item.userKey === input.userKey && item.productId === input.productId,
    );
    const now = new Date();

    if (existing) {
      const updated = {
        ...existing,
        quantity: Math.min(
          MAX_CART_QUANTITY,
          existing.quantity + input.quantity,
        ),
        selected: true,
        updatedAt: now,
      };
      this.cartItems.set(existing.id, updated);
      return updated;
    }

    const created = {
      id: input.id,
      userKey: input.userKey,
      productId: input.productId,
      quantity: input.quantity,
      selected: true,
      createdAt: now,
      updatedAt: now,
    };
    this.cartItems.set(created.id, created);
    return created;
  };

  updateCartItem = async (
    input: CartItemUpdateInput,
  ): Promise<CartItemRecord | null> => {
    const existing = this.cartItems.get(input.itemId);

    if (!existing || existing.userKey !== input.userKey) {
      return null;
    }

    const updated = {
      ...existing,
      quantity: input.quantity ?? existing.quantity,
      selected: input.selected ?? existing.selected,
      updatedAt: new Date(),
    };
    this.cartItems.set(existing.id, updated);
    return updated;
  };

  deleteCartItem = async (
    userKey: string,
    itemId: string,
  ): Promise<boolean> => {
    const existing = this.cartItems.get(itemId);

    if (!existing || existing.userKey !== userKey) {
      return false;
    }

    return this.cartItems.delete(itemId);
  };

  selectAllCartItems = async (
    userKey: string,
    selected: boolean,
  ): Promise<void> => {
    for (const item of this.cartItems.values()) {
      if (item.userKey === userKey) {
        this.cartItems.set(item.id, {
          ...item,
          selected,
          updatedAt: new Date(),
        });
      }
    }
  };
}

function productFixture(
  id: string,
  options: { skuAvailable?: boolean } = {},
): Product {
  return {
    id,
    status: "active",
    name: "通勤蓝牙耳机",
    brand: "示例品牌",
    category: "数码电子",
    subCategory: "耳机",
    imagePath: "digital/images/product_001.png",
    imageCaption: null,
    currency: "CNY",
    basePriceCents: 19900,
    priceMinCents: 19900,
    priceMaxCents: 19900,
    marketingDescription: "适合通勤。",
    knowledgeText: "通勤蓝牙耳机",
    ratingAvg: 4.6,
    categoryPath: ["数码电子", "耳机"],
    visualTags: ["通勤", "蓝牙"],
    attributes: {},
    pros: [],
    cons: [],
    recommendWhen: [],
    avoidWhen: [],
    compareWith: [],
    reviewSummary: {},
    contentBlocks: [],
    officialFaq: [],
    userReviews: [],
    normalizedPayload: {},
    sourceDataset: "test",
    sourceVersion: "test",
    sourceType: "test",
    dataVersion: "test",
    isDesensitized: true,
    ingestBatchId: "test",
    sourcePath: "test",
    skus: [skuFixture(id, options.skuAvailable ?? true)],
  };
}

function skuFixture(productId: string, available: boolean): ProductSku {
  return {
    id: `${productId}-sku-1`,
    productId,
    properties: {},
    priceCents: 19900,
    currency: "CNY",
    available,
    stockLevel: null,
    sortOrder: 0,
  };
}

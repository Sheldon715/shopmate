import { resolvePublicProductImagePath } from "../images/image.service";
import type { Product } from "../products/product.types";
import type { CartDto, CartItemDto, CartItemRecord, CartItemRow } from "./cart.types";

export interface CartMapperOptions {
  publicImageBaseUrl?: string;
}

export function mapCartItemRowToRecord(row: CartItemRow): CartItemRecord {
  return {
    id: row.id,
    userKey: row.user_key,
    productId: row.product_id,
    quantity: row.quantity,
    selected: row.selected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCartToDto(
  items: CartItemRecord[],
  products: Product[],
  options: CartMapperOptions = {},
): CartDto {
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const dtoItems = items.flatMap((item): CartItemDto[] => {
    const product = productsById.get(item.productId);

    if (!product) {
      return [];
    }

    const priceCents = product.basePriceCents;
    const subtotalCents = priceCents * item.quantity;

    return [{
      id: item.id,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      priceCents,
      priceText: formatPriceText(priceCents, product.currency),
      quantity: item.quantity,
      selected: item.selected,
      subtotalCents,
      available: isProductAvailable(product),
      tags: product.visualTags,
      imagePath: resolvePublicProductImagePath(
        product.imagePath,
        options.publicImageBaseUrl,
      ),
    }];
  });

  return {
    items: dtoItems,
    summary: {
      totalCount: dtoItems.reduce((sum, item) => sum + item.quantity, 0),
      selectedCount: dtoItems
        .filter((item) => item.selected)
        .reduce((sum, item) => sum + item.quantity, 0),
      selectedTotalCents: dtoItems
        .filter((item) => item.selected)
        .reduce((sum, item) => sum + item.subtotalCents, 0),
      currency: "CNY",
    },
  };
}

export function isProductAvailable(product: Product): boolean {
  if (product.status !== "active") {
    return false;
  }

  return product.skus.length === 0 || product.skus.some((sku) => sku.available);
}

function formatPriceText(priceCents: number, currency: string): string {
  const amount = priceCents % 100 === 0
    ? `${priceCents / 100}`
    : (priceCents / 100).toFixed(2);

  if (currency.toUpperCase() === "CNY") {
    return `¥${amount}`;
  }

  return `${currency.toUpperCase()} ${amount}`;
}

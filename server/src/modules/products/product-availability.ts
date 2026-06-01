import type { Product } from "./product.types";

export function isProductAvailable(product: Product): boolean {
  if (product.status !== "active") {
    return false;
  }

  return product.skus.length === 0
    || product.skus.some((sku) => sku.available);
}

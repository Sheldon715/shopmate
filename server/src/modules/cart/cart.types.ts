export interface CartItemRow {
  id: string;
  user_key: string;
  product_id: string;
  quantity: number;
  selected: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CartItemRecord {
  id: string;
  userKey: string;
  productId: string;
  quantity: number;
  selected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItemDto {
  id: string;
  productId: string;
  name: string;
  brand?: string;
  category?: string;
  priceCents: number;
  priceText: string;
  quantity: number;
  selected: boolean;
  subtotalCents: number;
  available: boolean;
  tags: string[];
  imagePath: string | null;
}

export interface CartDto {
  items: CartItemDto[];
  summary: {
    totalCount: number;
    selectedCount: number;
    selectedTotalCents: number;
    currency: "CNY";
  };
}

export interface CartItemUpsertInput {
  id: string;
  userKey: string;
  productId: string;
  quantity: number;
}

export interface CartItemUpdateInput {
  userKey: string;
  itemId: string;
  quantity?: number;
  selected?: boolean;
}

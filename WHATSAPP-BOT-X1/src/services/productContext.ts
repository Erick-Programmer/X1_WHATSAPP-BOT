export const DEFAULT_PRODUCT_ID = "planner_estudante_pro";

export function normalizeProductId(value?: string | null): string {
  return String(value || DEFAULT_PRODUCT_ID)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || DEFAULT_PRODUCT_ID;
}

export function productMemoryKey(contactId: string, productId?: string | null): string {
  return `${normalizeProductId(productId)}:${contactId}`;
}

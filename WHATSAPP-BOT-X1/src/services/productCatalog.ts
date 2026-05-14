import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PRODUCT_ID, normalizeProductId } from "./productContext";

export interface ProductCatalogItem {
  id: string;
  name: string;
  price: string;
  checkoutUrl: string;
  deliveryMethod: string;
  productDescription: string;
  recoveryPrice?: string;
  recoveryCheckoutUrl?: string;
  updatedAt: string;
}

interface ProductCatalogFile {
  activeProductId: string;
  products: Record<string, ProductCatalogItem>;
}

function getCatalogPath(): string {
  return path.resolve(process.cwd(), "data", "config", "products.json");
}

function emptyCatalog(): ProductCatalogFile {
  const now = new Date().toISOString();
  return {
    activeProductId: DEFAULT_PRODUCT_ID,
    products: {
      [DEFAULT_PRODUCT_ID]: {
        id: DEFAULT_PRODUCT_ID,
        name: "Planner Estudante Pro",
        price: "R$ 27,00",
        checkoutUrl: "",
        deliveryMethod: "Digital em PDF, enviado por e-mail",
        productDescription: "Kit digital com planners em PDF e ebooks bonus para organizacao dos estudos.",
        updatedAt: now,
      },
    },
  };
}

function saveCatalog(data: ProductCatalogFile): void {
  const filePath = getCatalogPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export const productCatalog = {
  load(): ProductCatalogFile {
    const filePath = getCatalogPath();
    if (!fs.existsSync(filePath)) {
      const data = emptyCatalog();
      saveCatalog(data);
      return data;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProductCatalogFile;
      if (!parsed.products) parsed.products = {};
      parsed.activeProductId = normalizeProductId(parsed.activeProductId || DEFAULT_PRODUCT_ID);

      if (!parsed.products[DEFAULT_PRODUCT_ID]) {
        parsed.products[DEFAULT_PRODUCT_ID] = emptyCatalog().products[DEFAULT_PRODUCT_ID];
      }

      if (!parsed.products[parsed.activeProductId]) {
        parsed.activeProductId = DEFAULT_PRODUCT_ID;
      }

      return parsed;
    } catch {
      const data = emptyCatalog();
      saveCatalog(data);
      return data;
    }
  },

  saveProduct(fields: {
    id?: string;
    name: string;
    price: string;
    checkoutUrl: string;
    deliveryMethod: string;
    productDescription: string;
    recoveryPrice?: string;
    recoveryCheckoutUrl?: string;
  }): ProductCatalogItem {
    const data = this.load();
    const id = normalizeProductId(fields.id || fields.name);

    const item: ProductCatalogItem = {
      id,
      name: fields.name.trim(),
      price: fields.price.trim(),
      checkoutUrl: fields.checkoutUrl.trim(),
      deliveryMethod: fields.deliveryMethod.trim(),
      productDescription: fields.productDescription.trim(),
      recoveryPrice: fields.recoveryPrice?.trim() || undefined,
      recoveryCheckoutUrl: fields.recoveryCheckoutUrl?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    if (!item.name) throw new Error("Nome do produto e obrigatorio.");
    if (!item.price) throw new Error("Preco do produto e obrigatorio.");

    data.products[id] = item;
    data.activeProductId = id;
    saveCatalog(data);

    return item;
  },

  selectProduct(productId: string): ProductCatalogItem {
    const data = this.load();
    const id = normalizeProductId(productId);
    const item = data.products[id];

    if (!item) throw new Error(`Produto nao encontrado: ${id}`);

    data.activeProductId = id;
    saveCatalog(data);
    return item;
  },

  getActiveProductId(): string {
    return this.load().activeProductId;
  },

  getProduct(productId?: string | null): ProductCatalogItem | null {
    const data = this.load();
    const id = normalizeProductId(productId || data.activeProductId);
    return data.products[id] || null;
  },

  list(): ProductCatalogFile {
    return this.load();
  },
};

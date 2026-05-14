import { productKnowledge } from "../config/product";
import { commercialSettings } from "./commercialSettings";
import { DEFAULT_PRODUCT_ID, normalizeProductId } from "./productContext";
import { productCatalog } from "./productCatalog";

export interface ProductProfile {
  id: string;
  name: string;
  price: string;
  checkoutUrl: string;
  delivery: string;
  description: string;
  includes: string[];
  benefits: string[];
  targetAudience: string[];
}

export function getProductProfile(productId: string = DEFAULT_PRODUCT_ID): ProductProfile {
  const id = normalizeProductId(productId);
  const settings = commercialSettings.getEffectiveConfig();
  const saved = commercialSettings.load();
  const catalogProduct = productCatalog.getProduct(id);
  if (catalogProduct) {
    return {
      id: catalogProduct.id,
      name: catalogProduct.name,
      price: catalogProduct.price,
      checkoutUrl: catalogProduct.checkoutUrl,
      delivery: catalogProduct.deliveryMethod,
      description: catalogProduct.productDescription,
      includes: [catalogProduct.productDescription],
      benefits: [catalogProduct.productDescription],
      targetAudience: ["Cliente interessado no produto atual"],
    };
  }

  if (id === DEFAULT_PRODUCT_ID) {
    return {
      id,
      name: saved?.productName || productKnowledge.name,
      price: settings.price,
      checkoutUrl: settings.checkoutUrl,
      delivery: settings.deliveryMethod || productKnowledge.delivery,
      description:
        saved?.productDescription ||
        `${productKnowledge.name}: ${productKnowledge.tagline}`,
      includes: [
        `${productKnowledge.planners.length} planners digitais em PDF`,
        `${productKnowledge.ebooks.length} ebooks bonus`,
        "calendario mensal",
        "planejamento semanal",
        "metas",
        "habitos",
        "controle de provas",
      ],
      benefits: productKnowledge.universalContent,
      targetAudience: productKnowledge.targetAudience,
    };
  }

  const description = saved?.productDescription || "Produto digital configurado no painel.";

  return {
    id,
    name: saved?.productName || "Produto atual",
    price: settings.price,
    checkoutUrl: settings.checkoutUrl,
    delivery: settings.deliveryMethod,
    description,
    includes: [description],
    benefits: [description],
    targetAudience: ["Cliente interessado no produto atual"],
  };
}

export function productProfileText(productId: string = DEFAULT_PRODUCT_ID): string {
  const profile = getProductProfile(productId);

  return [
    `ID: ${profile.id}`,
    `Nome: ${profile.name}`,
    `Preco: ${profile.price}`,
    `Entrega: ${profile.delivery}`,
    `Descricao: ${profile.description}`,
    `O que vem: ${profile.includes.join("; ")}`,
    `Beneficios: ${profile.benefits.join("; ")}`,
    `Publico: ${profile.targetAudience.join("; ")}`,
    profile.checkoutUrl ? `Checkout: ${profile.checkoutUrl}` : "",
  ].filter(Boolean).join("\n");
}

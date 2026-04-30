import * as fs from "fs";
import * as path from "path";
import { commercialConfig, type CommercialConfig } from "../config/commercial";

export type CheckoutStatus = "missing" | "pending_validation" | "validated" | "approved" | "rejected";

export interface CheckoutValidation {
  checkedAt: string;
  statusCode: number;
  finalUrl: string;
  isCaktoDomain: boolean;
  error: string | null;
}

export interface CommercialSettings {
  productName: string;
  price: string;
  checkoutUrl: string;
  checkoutPlatform: "Cakto";
  deliveryMethod: string;
  checkoutStatus: CheckoutStatus;
  validation: CheckoutValidation | null;
  approvedAt: string | null;
  updatedAt: string;
}

/**
 * Service for managing commercial settings (product name, price, checkout URL, etc.)
 * Stores settings in data/config/commercial-settings.json.
 *
 * Security:
 * - checkoutUrl is only usable if checkoutStatus === "approved"
 * - No tokens stored here
 * - data/ is in .gitignore
 */
class CommercialSettingsService {
  private getPath(): string {
    return path.resolve(process.cwd(), "data", "config", "commercial-settings.json");
  }

  /**
   * Load settings from disk.
   * Returns null if the file does not exist.
   */
  load(): CommercialSettings | null {
    const filePath = this.getPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CommercialSettings;
  }

  /**
   * Save settings to disk.
   * Trims all fields and rejects empty strings after trim.
   * Resets checkoutStatus to "missing", validation to null, approvedAt to null.
   */
  save(fields: {
    productName: string;
    price: string;
    checkoutUrl: string;
    deliveryMethod: string;
  }): CommercialSettings {
    const productName = fields.productName.trim();
    const price = fields.price.trim();
    const checkoutUrl = fields.checkoutUrl.trim();
    const deliveryMethod = fields.deliveryMethod.trim();

    if (!productName) throw new Error("Nome do produto é obrigatório");
    if (!price) throw new Error("Preço é obrigatório");
    if (!checkoutUrl) throw new Error("Link de checkout é obrigatório");
    if (!deliveryMethod) throw new Error("Método de entrega é obrigatório");

    const now = new Date().toISOString();
    const settings: CommercialSettings = {
      productName,
      price,
      checkoutUrl,
      checkoutPlatform: "Cakto",
      deliveryMethod,
      checkoutStatus: "missing",
      validation: null,
      approvedAt: null,
      updatedAt: now,
    };

    const dir = path.dirname(this.getPath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  /**
   * Validate a checkout URL by making an HTTP request.
   * - Follows redirects
   * - Captures statusCode and finalUrl
   * - Checks if finalUrl hostname contains "cakto"
   *
   * If validation succeeds (2xx/3xx + cakto domain), sets checkoutStatus to "validated".
   * Otherwise sets checkoutStatus to "rejected" with error details.
   */
  async validateCheckout(url: string): Promise<CommercialSettings> {
    const settings = this.load();
    if (!settings) {
      throw new Error("Nenhuma configuração comercial salva. Salve antes de validar.");
    }

    const checkedAt = new Date().toISOString();
    let statusCode = 0;
    let finalUrl = "";
    let isCaktoDomain = false;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      statusCode = response.status;
      finalUrl = response.url;

      try {
        const hostname = new URL(finalUrl).hostname.toLowerCase();
        isCaktoDomain = hostname.includes("cakto");
      } catch {
        isCaktoDomain = false;
      }

      const isSuccess = statusCode >= 200 && statusCode < 400;
      if (!isSuccess) {
        error = `HTTP ${statusCode} — resposta inesperada`;
      } else if (!isCaktoDomain) {
        error = `URL final não parece ser da Cakto: ${finalUrl}`;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      error = `Falha na requisição: ${msg}`;
      statusCode = 0;
      finalUrl = "";
      isCaktoDomain = false;
    }

    const validation: CheckoutValidation = {
      checkedAt,
      statusCode,
      finalUrl,
      isCaktoDomain,
      error,
    };

    settings.validation = validation;
    settings.updatedAt = checkedAt;

    if (error) {
      settings.checkoutStatus = "rejected";
    } else {
      settings.checkoutStatus = "validated";
    }

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  /**
   * Approve the checkout manually.
   * Sets checkoutStatus to "approved" and records approvedAt.
   * Throws if current status is not "validated".
   */
  approve(): CommercialSettings {
    const settings = this.load();
    if (!settings) {
      throw new Error("Nenhuma configuração comercial salva.");
    }
    if (settings.checkoutStatus !== "validated") {
      throw new Error(
        `Não é possível aprovar: status atual é "${settings.checkoutStatus}". Valide o checkout primeiro.`
      );
    }

    settings.checkoutStatus = "approved";
    settings.approvedAt = new Date().toISOString();
    settings.updatedAt = settings.approvedAt;

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  /**
   * Reject the checkout.
   * Sets checkoutStatus to "rejected".
   */
  reject(): CommercialSettings {
    const settings = this.load();
    if (!settings) {
      throw new Error("Nenhuma configuração comercial salva.");
    }

    settings.checkoutStatus = "rejected";
    settings.updatedAt = new Date().toISOString();

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  /**
   * Delete the settings file from disk.
   */
  reset(): void {
    const filePath = this.getPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Get the effective commercial configuration.
   * If settings exist and checkoutStatus === "approved", returns the settings
   * mapped to a CommercialConfig-compatible object.
   * Otherwise returns the fallback commercialConfig.
   */
  getEffectiveConfig(): CommercialConfig {
    const settings = this.load();
    if (settings && settings.checkoutStatus === "approved") {
      return {
        price: settings.price,
        checkoutUrl: settings.checkoutUrl,
        checkoutPlatform: settings.checkoutPlatform,
        deliveryMethod: settings.deliveryMethod,
        isCheckoutConfigured: true,
        supportNote: commercialConfig.supportNote,
      };
    }
    return commercialConfig;
  }
}

export const commercialSettings = new CommercialSettingsService();

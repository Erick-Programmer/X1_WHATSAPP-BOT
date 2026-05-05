import * as fs from "fs";
import * as path from "path";
import { commercialConfig, type CommercialConfig } from "../config/commercial";

export type CheckoutStatus = "missing" | "pending_validation" | "validated" | "approved" | "rejected";
export type CheckoutTarget = "normal" | "recovery";

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
  recoveryPrice?: string;
  recoveryCheckoutUrl?: string;
  recoveryCheckoutStatus?: CheckoutStatus;
  recoveryValidation?: CheckoutValidation | null;
  recoveryApprovedAt?: string | null;
  updatedAt: string;
}

class CommercialSettingsService {
  private getPath(): string {
    return path.resolve(process.cwd(), "data", "config", "commercial-settings.json");
  }

  load(): CommercialSettings | null {
    const filePath = this.getPath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CommercialSettings;
  }

  save(fields: {
    productName: string;
    price: string;
    checkoutUrl: string;
    deliveryMethod: string;
    recoveryPrice?: string;
    recoveryCheckoutUrl?: string;
  }): CommercialSettings {
    const current = this.load();
    const productName = fields.productName.trim();
    const price = fields.price.trim();
    const checkoutUrl = fields.checkoutUrl.trim();
    const deliveryMethod = fields.deliveryMethod.trim();
    const recoveryPrice = fields.recoveryPrice?.trim() || "";
    const recoveryCheckoutUrl = fields.recoveryCheckoutUrl?.trim() || "";

    if (!productName) throw new Error("Nome do produto e obrigatorio");
    if (!price) throw new Error("Preco e obrigatorio");
    if (!checkoutUrl) throw new Error("Link de checkout e obrigatorio");
    if (!deliveryMethod) throw new Error("Metodo de entrega e obrigatorio");
    if ((recoveryPrice && !recoveryCheckoutUrl) || (!recoveryPrice && recoveryCheckoutUrl)) {
      throw new Error("Preencha preco e link do checkout de recuperacao, ou deixe os dois vazios.");
    }

    const now = new Date().toISOString();
    const normalChanged =
      productName !== (current?.productName || "") ||
      price !== (current?.price || "") ||
      checkoutUrl !== (current?.checkoutUrl || "") ||
      deliveryMethod !== (current?.deliveryMethod || "");
    const recoveryChanged =
      recoveryPrice !== (current?.recoveryPrice || "") ||
      recoveryCheckoutUrl !== (current?.recoveryCheckoutUrl || "");

    const settings: CommercialSettings = {
      productName,
      price,
      checkoutUrl,
      checkoutPlatform: "Cakto",
      deliveryMethod,
      checkoutStatus: normalChanged ? "missing" : current?.checkoutStatus ?? "missing",
      validation: normalChanged ? null : current?.validation ?? null,
      approvedAt: normalChanged ? null : current?.approvedAt ?? null,
      recoveryPrice: recoveryPrice || undefined,
      recoveryCheckoutUrl: recoveryCheckoutUrl || undefined,
      recoveryCheckoutStatus:
        recoveryPrice && recoveryCheckoutUrl
          ? recoveryChanged
            ? "missing"
            : current?.recoveryCheckoutStatus ?? "missing"
          : undefined,
      recoveryValidation:
        recoveryPrice && recoveryCheckoutUrl
          ? recoveryChanged
            ? null
            : current?.recoveryValidation ?? null
          : undefined,
      recoveryApprovedAt:
        recoveryPrice && recoveryCheckoutUrl
          ? recoveryChanged
            ? null
            : current?.recoveryApprovedAt ?? null
          : undefined,
      updatedAt: now,
    };

    const dir = path.dirname(this.getPath());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  async validateCheckout(url: string, target: CheckoutTarget = "normal"): Promise<CommercialSettings> {
    const settings = this.load();
    if (!settings) throw new Error("Nenhuma configuracao comercial salva. Salve antes de validar.");

    const checkedAt = new Date().toISOString();
    let statusCode = 0;
    let finalUrl = "";
    let isCaktoDomain = false;
    let error: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
      clearTimeout(timeout);

      statusCode = response.status;
      finalUrl = response.url;
      try {
        isCaktoDomain = new URL(finalUrl).hostname.toLowerCase().includes("cakto");
      } catch {
        isCaktoDomain = false;
      }

      if (statusCode < 200 || statusCode >= 400) {
        error = `HTTP ${statusCode} - resposta inesperada`;
      } else if (!isCaktoDomain) {
        error = `URL final nao parece ser da Cakto: ${finalUrl}`;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      error = `Falha na requisicao: ${msg}`;
    }

    const validation: CheckoutValidation = { checkedAt, statusCode, finalUrl, isCaktoDomain, error };

    if (target === "recovery") {
      settings.recoveryValidation = validation;
      settings.recoveryCheckoutStatus = error ? "rejected" : "validated";
    } else {
      settings.validation = validation;
      settings.checkoutStatus = error ? "rejected" : "validated";
    }
    settings.updatedAt = checkedAt;

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  approve(target: CheckoutTarget = "normal"): CommercialSettings {
    const settings = this.load();
    if (!settings) throw new Error("Nenhuma configuracao comercial salva.");

    const status = target === "recovery" ? settings.recoveryCheckoutStatus : settings.checkoutStatus;
    if (status !== "validated") {
      throw new Error(`Nao e possivel aprovar: status atual e "${status}". Valide o checkout primeiro.`);
    }

    const approvedAt = new Date().toISOString();
    if (target === "recovery") {
      settings.recoveryCheckoutStatus = "approved";
      settings.recoveryApprovedAt = approvedAt;
    } else {
      settings.checkoutStatus = "approved";
      settings.approvedAt = approvedAt;
    }
    settings.updatedAt = approvedAt;

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  reject(target: CheckoutTarget = "normal"): CommercialSettings {
    const settings = this.load();
    if (!settings) throw new Error("Nenhuma configuracao comercial salva.");

    if (target === "recovery") {
      settings.recoveryCheckoutStatus = "rejected";
    } else {
      settings.checkoutStatus = "rejected";
    }
    settings.updatedAt = new Date().toISOString();

    fs.writeFileSync(this.getPath(), JSON.stringify(settings, null, 2), "utf-8");
    return settings;
  }

  reset(): void {
    const filePath = this.getPath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

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

  getRecoveryConfig(): CommercialConfig {
    const settings = this.load();
    if (
      settings &&
      settings.recoveryCheckoutStatus === "approved" &&
      settings.recoveryPrice &&
      settings.recoveryCheckoutUrl
    ) {
      return {
        price: settings.recoveryPrice,
        checkoutUrl: settings.recoveryCheckoutUrl,
        checkoutPlatform: settings.checkoutPlatform,
        deliveryMethod: settings.deliveryMethod,
        isCheckoutConfigured: true,
        supportNote: commercialConfig.supportNote,
      };
    }
    return { ...commercialConfig, isCheckoutConfigured: false };
  }
}

export const commercialSettings = new CommercialSettingsService();

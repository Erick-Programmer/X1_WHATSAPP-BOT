import * as fs from "fs";
import * as path from "path";

export interface WhatsAppCredentials {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  savedAt: string;
  lastUsedAt: string | null;
}

export interface MaskedCredentials {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
}

/**
 * Service for managing WhatsApp Cloud API credentials locally.
 * Stores credentials in data/secrets/whatsapp-credentials.json.
 *
 * Security rules:
 * - Never return apiToken completo to the frontend
 * - Never log tokens
 * - Never put tokens in URLs
 * - Never save in localStorage
 * - Only expose masked versions
 *
 * TODO: Add local encryption in a future step.
 */
class WhatsAppCredentialsService {
  private getCredentialsPath(): string {
    return path.resolve(process.cwd(), "data", "secrets", "whatsapp-credentials.json");
  }

  /**
   * Load credentials from disk.
   * Returns null if the file does not exist.
   */
  load(): WhatsAppCredentials | null {
    const filePath = this.getCredentialsPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as WhatsAppCredentials;
  }

  /**
   * Save credentials to disk.
   * Trims all fields and rejects empty strings after trim.
   * Throws if any required field is missing or empty.
   */
  save(fields: {
    apiToken: string;
    phoneNumberId: string;
    businessAccountId: string;
    verifyToken: string;
  }): WhatsAppCredentials {
    const apiToken = fields.apiToken.trim();
    const phoneNumberId = fields.phoneNumberId.trim();
    const businessAccountId = fields.businessAccountId.trim();
    const verifyToken = fields.verifyToken.trim();

    if (!apiToken) throw new Error("WA_API_TOKEN é obrigatório");
    if (!phoneNumberId) throw new Error("WA_PHONE_NUMBER_ID é obrigatório");
    if (!businessAccountId) throw new Error("WA_BUSINESS_ACCOUNT_ID é obrigatório");
    if (!verifyToken) throw new Error("WA_VERIFY_TOKEN é obrigatório");

    const now = new Date().toISOString();
    const credentials: WhatsAppCredentials = {
      apiToken,
      phoneNumberId,
      businessAccountId,
      verifyToken,
      savedAt: now,
      lastUsedAt: null,
    };

    const dir = path.dirname(this.getCredentialsPath());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.getCredentialsPath(), JSON.stringify(credentials, null, 2), "utf-8");

    return credentials;
  }

  /**
   * Delete the credentials file from disk.
   * Does NOT delete the data/secrets directory.
   */
  clear(): void {
    const filePath = this.getCredentialsPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Mark credentials as used by updating lastUsedAt to now.
   * Throws if no credentials exist.
   */
  markUsed(): WhatsAppCredentials {
    const credentials = this.load();
    if (!credentials) {
      throw new Error("Nenhuma credencial salva para marcar como usada.");
    }
    credentials.lastUsedAt = new Date().toISOString();
    fs.writeFileSync(this.getCredentialsPath(), JSON.stringify(credentials, null, 2), "utf-8");
    return credentials;
  }

  /**
   * Return a masked version of credentials for frontend display.
   * - apiToken: first 6 + "..." + last 4
   * - phoneNumberId: first 4 + "..." + last 4
   * - businessAccountId: first 4 + "..." + last 4
   * - verifyToken: "******"
   */
  mask(credentials: WhatsAppCredentials): MaskedCredentials {
    const maskToken = (token: string, prefixLen: number, suffixLen: number): string => {
      if (token.length <= prefixLen + suffixLen) {
        return token.substring(0, prefixLen) + "...";
      }
      return token.substring(0, prefixLen) + "..." + token.substring(token.length - suffixLen);
    };

    return {
      apiToken: maskToken(credentials.apiToken, 6, 4),
      phoneNumberId: maskToken(credentials.phoneNumberId, 4, 4),
      businessAccountId: maskToken(credentials.businessAccountId, 4, 4),
      verifyToken: "******",
    };
  }
}

export const whatsappCredentials = new WhatsAppCredentialsService();

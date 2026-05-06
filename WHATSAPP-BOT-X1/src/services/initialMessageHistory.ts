import * as fs from "fs";
import * as path from "path";

export interface InitialMessageHistoryEntry {
  phone: string;
  text: string;
  sentAt: string;
  campaignItemId?: string;
}

function getHistoryPath(): string {
  return path.resolve(process.cwd(), "data", "initial-message-history.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getHistoryPath()), { recursive: true });
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

class InitialMessageHistory {
  load(): InitialMessageHistoryEntry[] {
    const file = getHistoryPath();
    if (!fs.existsSync(file)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("[initialMessageHistory] Failed to load history:", err);
      return [];
    }
  }

  hasSent(phone: string): boolean {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    return this.load().some((entry) => normalizePhone(entry.phone) === normalized);
  }

  recordSent(options: { phone: string; text: string; campaignItemId?: string }): InitialMessageHistoryEntry | null {
    const phone = normalizePhone(options.phone);
    if (!phone) return null;

    const entries = this.load();
    const existing = entries.find((entry) => normalizePhone(entry.phone) === phone);
    if (existing) return existing;

    const entry: InitialMessageHistoryEntry = {
      phone,
      text: options.text,
      campaignItemId: options.campaignItemId,
      sentAt: new Date().toISOString(),
    };

    entries.push(entry);
    ensureDir();
    fs.writeFileSync(getHistoryPath(), JSON.stringify(entries, null, 2), "utf-8");
    return entry;
  }

  getStatus(): { total: number; entries: InitialMessageHistoryEntry[] } {
    const entries = this.load();
    return { total: entries.length, entries: entries.slice(-50).reverse() };
  }
}

export const initialMessageHistory = new InitialMessageHistory();

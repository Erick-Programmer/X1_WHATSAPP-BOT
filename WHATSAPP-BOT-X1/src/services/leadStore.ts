import * as fs from "fs";
import * as path from "path";

export interface LeadItem {
  phone: string;
  initialMessage?: string;
  source: "manual_import";
  createdAt: string;
  updatedAt: string;
}

export interface LeadImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  leads: LeadItem[];
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function looksLikePhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

function getLeadsPath(): string {
  return path.resolve(process.cwd(), "data", "leads.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getLeadsPath()), { recursive: true });
}

function load(): LeadItem[] {
  const file = getLeadsPath();
  if (!fs.existsSync(file)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.phone === "string")
      .map((item) => ({
        phone: normalizePhone(item.phone),
        initialMessage: typeof item.initialMessage === "string" ? item.initialMessage : undefined,
        source: "manual_import" as const,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      }))
      .filter((item) => looksLikePhone(item.phone));
  } catch (err) {
    console.error("[leadStore] Failed to load leads:", err);
    return [];
  }
}

function save(leads: LeadItem[]): void {
  ensureDir();
  fs.writeFileSync(getLeadsPath(), JSON.stringify(leads, null, 2), "utf-8");
}

function parseRows(rawText: string): Array<{ phone: string; initialMessage?: string }> {
  const rows: Array<{ phone: string; initialMessage?: string }> = [];
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/whatsapp\s*number|telefone|phone/i.test(trimmed)) continue;

    const parts = trimmed.split(/\t|;|,/).map((part) => part.trim()).filter(Boolean);
    const phoneSource = parts.find((part) => looksLikePhone(part)) || trimmed;
    const phone = normalizePhone(phoneSource);
    if (!looksLikePhone(phone)) continue;

    const initialMessage = parts.find((part) => part !== phoneSource && !looksLikePhone(part));
    rows.push({ phone, initialMessage });
  }

  return rows;
}

class LeadStore {
  getPath(): string {
    return getLeadsPath();
  }

  list(): LeadItem[] {
    return load();
  }

  findByPhone(phone: string): LeadItem | null {
    const normalized = normalizePhone(phone);
    if (!looksLikePhone(normalized)) return null;
    return load().find((lead) => lead.phone === normalized) || null;
  }

  importFromText(rawText: string): LeadImportResult {
    const now = new Date().toISOString();
    const existing = load();
    const byPhone = new Map(existing.map((lead) => [lead.phone, lead]));
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of parseRows(rawText)) {
      const current = byPhone.get(row.phone);
      if (current) {
        byPhone.set(row.phone, {
          ...current,
          initialMessage: row.initialMessage || current.initialMessage,
          updatedAt: now,
        });
        updated++;
      } else {
        byPhone.set(row.phone, {
          phone: row.phone,
          initialMessage: row.initialMessage,
          source: "manual_import",
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      }
    }

    const parsedCount = parseRows(rawText).length;
    const nonEmptyLines = rawText.split(/\r?\n/).filter((line) => line.trim()).length;
    skipped = Math.max(0, nonEmptyLines - parsedCount);

    const leads = Array.from(byPhone.values()).sort((a, b) => a.phone.localeCompare(b.phone));
    save(leads);
    return { imported, updated, skipped, total: leads.length, leads };
  }

  clear(): void {
    save([]);
  }
}

export const leadStore = new LeadStore();
export { normalizePhone, looksLikePhone };

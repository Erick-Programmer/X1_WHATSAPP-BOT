import * as fs from "fs";
import * as path from "path";

interface TelegramLead {
  username: string;
  importedAt: string;
}

function getPath(): string {
  return path.resolve(process.cwd(), "data", "telegram-leads.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getPath()), { recursive: true });
}

function load(): TelegramLead[] {
  const file = getPath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function save(leads: TelegramLead[]): void {
  ensureDir();
  fs.writeFileSync(getPath(), JSON.stringify(leads, null, 2), "utf-8");
}

function normalizeUsername(value: string): string {
  const raw = String(value || "").trim();
  const fromLink = raw.match(/t\.me\/([a-zA-Z0-9_]{5,})/i)?.[1];
  const user = (fromLink || raw).replace(/^@/, "").replace(/[^\w]/g, "");
  return user;
}

class TelegramLeadStore {
  importFromText(rawText: string): { imported: number; updated: number; total: number; leads: TelegramLead[] } {
    const lines = rawText.split(/\r?\n|,|;/).map((l) => normalizeUsername(l)).filter(Boolean);
    const unique = Array.from(new Set(lines));
    const existing = load();
    const existingSet = new Set(existing.map((l) => l.username.toLowerCase()));
    let imported = 0;
    let updated = 0;
    for (const username of unique) {
      if (existingSet.has(username.toLowerCase())) {
        updated++;
      } else {
        existing.push({ username, importedAt: new Date().toISOString() });
        imported++;
      }
    }
    save(existing);
    return { imported, updated, total: existing.length, leads: existing };
  }

  list(): TelegramLead[] {
    return load();
  }

  clear(): void {
    save([]);
  }
}

export const telegramLeadStore = new TelegramLeadStore();
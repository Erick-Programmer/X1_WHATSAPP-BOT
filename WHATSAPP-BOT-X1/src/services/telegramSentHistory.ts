import * as fs from "fs";
import * as path from "path";

interface TelegramSentEntry {
  username: string;
  text: string;
  sentAt: string;
}

function getPath(): string {
  return path.resolve(process.cwd(), "data", "telegram-sent-history.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getPath()), { recursive: true });
}

function load(): TelegramSentEntry[] {
  const file = getPath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function save(entries: TelegramSentEntry[]): void {
  ensureDir();
  fs.writeFileSync(getPath(), JSON.stringify(entries, null, 2), "utf-8");
}

class TelegramSentHistory {
  hasSent(username: string): boolean {
    const normalized = username.toLowerCase().replace(/^@/, "");
    return load().some((e) => e.username.toLowerCase() === normalized);
  }

  recordSent(username: string, text: string): void {
    const entries = load();
    const normalized = username.toLowerCase().replace(/^@/, "");
    if (!entries.some((e) => e.username.toLowerCase() === normalized)) {
      entries.push({ username: normalized, text, sentAt: new Date().toISOString() });
      save(entries);
    }
  }

  list(): TelegramSentEntry[] {
    return load();
  }

  clear(): void {
    save([]);
  }
}

export const telegramSentHistory = new TelegramSentHistory();
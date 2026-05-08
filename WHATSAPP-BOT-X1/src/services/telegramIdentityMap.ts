import * as fs from "fs";
import * as path from "path";

interface TelegramIdentityRecord {
  alias: string;
  peerUsername: string;
  displayName?: string;
  updatedAt: string;
}

function getPath(): string {
  return path.resolve(process.cwd(), "data", "telegram-identity-map.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getPath()), { recursive: true });
}

function normalizeAlias(value: string): string {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function normalizePeer(value: string): string {
  const raw = String(value || "").trim().replace(/^@/, "");
  const peerMatch = raw.match(/^peer_(\d+)$/i);
  if (peerMatch) return `peer_${peerMatch[1]}`;
  const digits = raw.match(/^\d+$/)?.[0];
  if (digits) return `peer_${digits}`;
  return raw;
}

function load(): Record<string, TelegramIdentityRecord> {
  const file = getPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error("[telegramIdentityMap] Failed to load:", err);
    return {};
  }
}

function save(map: Record<string, TelegramIdentityRecord>): void {
  ensureDir();
  fs.writeFileSync(getPath(), JSON.stringify(map, null, 2), "utf-8");
}

class TelegramIdentityMap {
  resolve(value: string): string {
    const raw = String(value || "").trim().replace(/^@/, "");
    const peer = normalizePeer(raw);
    if (peer.startsWith("peer_")) return peer;
    const map = load();
    return map[normalizeAlias(raw)]?.peerUsername || raw;
  }

  saveMapping(alias: string, peerValue: string, displayName?: string): void {
    const key = normalizeAlias(alias);
    const peerUsername = normalizePeer(peerValue);
    if (!key || !peerUsername.startsWith("peer_")) return;
    const map = load();
    map[key] = {
      alias: key,
      peerUsername,
      displayName,
      updatedAt: new Date().toISOString(),
    };
    save(map);
  }

  status(): Record<string, TelegramIdentityRecord> {
    return load();
  }
}

export const telegramIdentityMap = new TelegramIdentityMap();

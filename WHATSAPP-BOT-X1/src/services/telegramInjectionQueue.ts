import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

export type TelegramInjectionTaskStatus = "queued" | "claimed" | "sending" | "sent" | "failed";
export type TelegramInjectionTaskSource = "manual_reply" | "initial_campaign";
export type TelegramQueueMode = "paused" | "running";

export interface TelegramInjectionTask {
  id: string;
  username: string;
  text: string;
  source: TelegramInjectionTaskSource;
  intent?: string;
  status: TelegramInjectionTaskStatus;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  sentAt?: string;
  failedAt?: string;
  error?: string;
}

interface TelegramQueueState {
  mode: TelegramQueueMode;
  tasks: TelegramInjectionTask[];
}

function getPath(): string {
  return path.resolve(process.cwd(), "data", "telegram-injection-queue.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getPath()), { recursive: true });
}

function normalizeUsername(value: string): string {
  const raw = String(value || "").trim();
  const fromLink = raw.match(/t\.me\/([a-zA-Z0-9_]{5,})/i)?.[1];
  const user = (fromLink || raw).replace(/^@/, "").replace(/[^\w]/g, "");
  return user;
}

function loadState(): TelegramQueueState {
  const file = getPath();
  if (!fs.existsSync(file)) return { mode: "paused", tasks: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (Array.isArray(parsed)) return { mode: "running", tasks: parsed };
    return {
      mode: parsed.mode === "running" ? "running" : "paused",
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (err) {
    console.error("[telegramInjectionQueue] Failed to load queue:", err);
    return { mode: "paused", tasks: [] };
  }
}

function saveState(state: TelegramQueueState): void {
  ensureDir();
  fs.writeFileSync(getPath(), JSON.stringify(state, null, 2), "utf-8");
}

function counts(tasks: TelegramInjectionTask[]): Record<TelegramInjectionTaskStatus, number> {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status]++;
      return acc;
    },
    { queued: 0, claimed: 0, sending: 0, sent: 0, failed: 0 } as Record<TelegramInjectionTaskStatus, number>
  );
}

function randomDelaySeconds(min: number, max: number): number {
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

class TelegramInjectionQueue {
  enqueue(task: {
    username: string;
    text: string;
    source: TelegramInjectionTaskSource;
    intent?: string;
    dueAt?: string;
  }): TelegramInjectionTask {
    const username = normalizeUsername(task.username);
    if (!username) throw new Error("Username Telegram invalido.");

    const now = new Date().toISOString();
    const state = loadState();
    const item: TelegramInjectionTask = {
      id: randomUUID(),
      username,
      text: task.text,
      source: task.source,
      intent: task.intent,
      status: "queued",
      dueAt: task.dueAt,
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.push(item);
    saveState(state);
    return item;
  }

  prepareBatch(input: {
    usernames: string[];
    messages: string[];
    limit: number;
    minDelaySeconds: number;
    maxDelaySeconds: number;
    allowDuplicates: boolean;
  }): { tasks: TelegramInjectionTask[]; skipped: Array<{ username: string; reason: string }> } {
    const state = loadState();
    state.mode = "paused";
    const normalized = Array.from(new Set(input.usernames.map(normalizeUsername).filter(Boolean)));
    const selected = normalized.slice(0, Math.max(1, Math.min(input.limit || normalized.length, normalized.length, 500)));
    const activeUsernames = new Set(
      state.tasks
        .filter((task) => task.status === "queued" || task.status === "claimed" || task.status === "sending")
        .map((task) => task.username.toLowerCase())
    );
    const messages = input.messages.map((msg) => msg.trim()).filter(Boolean);
    if (messages.length === 0) throw new Error("Mensagem inicial obrigatoria.");

    const tasks: TelegramInjectionTask[] = [];
    const skipped: Array<{ username: string; reason: string }> = [];
    let offsetSeconds = 0;
    const now = Date.now();
    for (const username of selected) {
      if (!input.allowDuplicates && activeUsernames.has(username.toLowerCase())) {
        skipped.push({ username, reason: "ja_esta_na_fila" });
        continue;
      }
      offsetSeconds += randomDelaySeconds(input.minDelaySeconds, input.maxDelaySeconds);
      const text = messages[Math.floor(Math.random() * messages.length)];
      const item: TelegramInjectionTask = {
        id: randomUUID(),
        username,
        text,
        source: "initial_campaign",
        status: "queued",
        dueAt: new Date(now + offsetSeconds * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.tasks.push(item);
      tasks.push(item);
    }
    saveState(state);
    return { tasks, skipped };
  }

  start(): void {
    const state = loadState();
    state.mode = "running";
    saveState(state);
  }

  pause(): void {
    const state = loadState();
    state.mode = "paused";
    saveState(state);
  }

  claimNext(): TelegramInjectionTask | null {
    const state = loadState();
    if (state.mode !== "running") return null;
    const active = state.tasks.some((task) => task.status === "claimed" || task.status === "sending");
    if (active) return null;

    const nowMs = Date.now();
    const task = state.tasks.find((item) =>
      item.status === "queued" &&
      (!item.dueAt || new Date(item.dueAt).getTime() <= nowMs)
    );
    if (!task) return null;

    const now = new Date().toISOString();
    task.status = "claimed";
    task.claimedAt = now;
    task.updatedAt = now;
    saveState(state);
    return task;
  }

  markSending(id: string): TelegramInjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "sending";
      task.updatedAt = now;
    });
  }

  markSent(id: string): TelegramInjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "sent";
      task.sentAt = now;
      task.updatedAt = now;
      task.error = undefined;
    });
  }

  markFailed(id: string, error: string): TelegramInjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "failed";
      task.failedAt = now;
      task.updatedAt = now;
      task.error = error;
    });
  }

  clearFinished(): void {
    const state = loadState();
    state.tasks = state.tasks.filter((task) => task.status !== "sent" && task.status !== "failed");
    saveState(state);
  }

  status(): {
    mode: TelegramQueueMode;
    total: number;
    counts: Record<TelegramInjectionTaskStatus, number>;
    nextDueAt?: string;
    tasks: TelegramInjectionTask[];
  } {
    const state = loadState();
    const next = state.tasks
      .filter((task) => task.status === "queued" && task.dueAt)
      .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())[0];
    return {
      mode: state.mode,
      total: state.tasks.length,
      counts: counts(state.tasks),
      nextDueAt: next?.dueAt,
      tasks: state.tasks.slice(-50).reverse(),
    };
  }

  private update(id: string, updater: (task: TelegramInjectionTask, now: string) => void): TelegramInjectionTask | null {
    const state = loadState();
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return null;
    updater(task, new Date().toISOString());
    saveState(state);
    return task;
  }
}

export function normalizeTelegramUsername(value: string): string {
  return normalizeUsername(value);
}

export const telegramInjectionQueue = new TelegramInjectionQueue();

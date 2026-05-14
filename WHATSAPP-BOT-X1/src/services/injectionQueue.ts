import * as fs from "fs";
import * as path from "path";

export type InjectionTaskStatus = "queued" | "claimed" | "sending" | "sent" | "failed";
export type InjectionTaskSource = "manual_reply" | "initial_campaign";

export interface InjectionTask {
  id: string;
  phone: string;
  text: string;
  source: InjectionTaskSource;
  intent?: string;
  status: InjectionTaskStatus;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  sentAt?: string;
  failedAt?: string;
  error?: string;
  campaignItemId?: string;
  productId?: string;
}

function getPath(): string {
  return path.resolve(process.cwd(), "data", "injection-queue.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getPath()), { recursive: true });
}

function load(): InjectionTask[] {
  const file = getPath();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[injectionQueue] Failed to load queue:", err);
    return [];
  }
}

function save(tasks: InjectionTask[]): void {
  ensureDir();
  fs.writeFileSync(getPath(), JSON.stringify(tasks, null, 2), "utf-8");
}

function counts(tasks: InjectionTask[]): Record<InjectionTaskStatus, number> {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status]++;
      return acc;
    },
    { queued: 0, claimed: 0, sending: 0, sent: 0, failed: 0 } as Record<InjectionTaskStatus, number>
  );
}

class InjectionQueue {
  enqueue(task: {
    phone: string;
    text: string;
    source: InjectionTaskSource;
    intent?: string;
    campaignItemId?: string;
    productId?: string;
  }): InjectionTask {
    const now = new Date().toISOString();
    const tasks = load();
    const item: InjectionTask = {
      id: crypto.randomUUID(),
      phone: task.phone.replace(/\D/g, ""),
      text: task.text,
      source: task.source,
      intent: task.intent,
      campaignItemId: task.campaignItemId,
      productId: task.productId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(item);
    save(tasks);
    return item;
  }

  claimNext(): InjectionTask | null {
    const tasks = load();
    const active = tasks.some((task) => task.status === "claimed" || task.status === "sending");
    if (active) return null;

    const task = tasks.find((item) => item.status === "queued");
    if (!task) return null;

    const now = new Date().toISOString();
    task.status = "claimed";
    task.claimedAt = now;
    task.updatedAt = now;
    save(tasks);
    return task;
  }

  markSending(id: string): InjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "sending";
      task.updatedAt = now;
    });
  }

  markSent(id: string): InjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "sent";
      task.sentAt = now;
      task.updatedAt = now;
      task.error = undefined;
    });
  }

  markFailed(id: string, error: string): InjectionTask | null {
    return this.update(id, (task, now) => {
      task.status = "failed";
      task.failedAt = now;
      task.updatedAt = now;
      task.error = error;
    });
  }

  clearFinished(): void {
    const tasks = load().filter((task) => task.status !== "sent" && task.status !== "failed");
    save(tasks);
  }

  clearStuck(olderThanMinutes = 2): void {
    const tasks = load();
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    tasks.forEach((task) => {
      if ((task.status === "sending" || task.status === "claimed") &&
          new Date(task.updatedAt).getTime() < cutoff) {
        task.status = "failed";
        task.error = "Travado — resetado automaticamente";
        task.failedAt = new Date().toISOString();
        task.updatedAt = new Date().toISOString();
      }
    });
    save(tasks);
  }

  status(): { total: number; counts: Record<InjectionTaskStatus, number>; tasks: InjectionTask[] } {
    const tasks = load();
    return { total: tasks.length, counts: counts(tasks), tasks: tasks.slice(-50).reverse() };
  }

  private update(id: string, updater: (task: InjectionTask, now: string) => void): InjectionTask | null {
    const tasks = load();
    const task = tasks.find((item) => item.id === id);
    if (!task) return null;
    updater(task, new Date().toISOString());
    save(tasks);
    return task;
  }
}

export const injectionQueue = new InjectionQueue();

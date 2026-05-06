import * as fs from "fs";
import * as path from "path";
import { leadStore } from "./leadStore";
import { initialMessageHistory } from "./initialMessageHistory";

export type CampaignStatus = "idle" | "prepared" | "running" | "paused" | "completed" | "cancelled";
export type CampaignItemStatus = "queued" | "sending" | "sent" | "skipped" | "failed";

export interface CampaignItem {
  id: string;
  phone: string;
  text: string;
  status: CampaignItemStatus;
  createdAt: string;
  sentAt?: string;
  skippedAt?: string;
  failedAt?: string;
  error?: string;
  skipReason?: "initial_already_sent";
}

export interface CampaignState {
  id: string;
  status: CampaignStatus;
  message: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  nextDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  items: CampaignItem[];
}

function getCampaignPath(): string {
  return path.resolve(process.cwd(), "data", "initial-campaign.json");
}

function ensureDir(): void {
  fs.mkdirSync(path.dirname(getCampaignPath()), { recursive: true });
}

function emptyState(): CampaignState {
  const now = new Date().toISOString();
  return {
    id: "campaign_idle",
    status: "idle",
    message: "",
    minDelaySeconds: 45,
    maxDelaySeconds: 120,
    nextDueAt: null,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
}

function sanitizeDelay(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(3600, Math.round(n)));
}

function randomDelayMs(minSeconds: number, maxSeconds: number): number {
  const min = Math.min(minSeconds, maxSeconds);
  const max = Math.max(minSeconds, maxSeconds);
  return (min + Math.floor(Math.random() * (max - min + 1))) * 1000;
}

function countByStatus(items: CampaignItem[]): Record<CampaignItemStatus, number> {
  return items.reduce(
    (acc, item) => {
      acc[item.status]++;
      return acc;
    },
    { queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0 } as Record<CampaignItemStatus, number>
  );
}

class CampaignStore {
  load(): CampaignState {
    const file = getCampaignPath();
    if (!fs.existsSync(file)) return emptyState();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as CampaignState;
      return { ...emptyState(), ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch (err) {
      console.error("[campaignStore] Failed to load campaign:", err);
      return emptyState();
    }
  }

  private save(state: CampaignState): CampaignState {
    ensureDir();
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(getCampaignPath(), JSON.stringify(state, null, 2), "utf-8");
    return state;
  }

  getStatus(): CampaignState & { counts: Record<CampaignItemStatus, number> } {
    const state = this.load();
    return { ...state, counts: countByStatus(state.items) };
  }

  prepare(options: {
    message: string;
    limit?: number;
    minDelaySeconds?: number;
    maxDelaySeconds?: number;
    allowResendForTest?: boolean;
  }): CampaignState {
    const message = options.message.trim();
    if (!message) throw new Error("Mensagem inicial e obrigatoria.");

    const leads = leadStore.list();
    if (leads.length === 0) throw new Error("Importe leads antes de preparar campanha.");

    const limit = Math.max(1, Math.min(Number(options.limit || leads.length), leads.length, 500));
    const minDelaySeconds = sanitizeDelay(options.minDelaySeconds, 45);
    const maxDelaySeconds = sanitizeDelay(options.maxDelaySeconds, 120);
    const now = new Date().toISOString();
    const selected = leads.slice(0, limit);

    const state: CampaignState = {
      id: `campaign_${Date.now()}`,
      status: "prepared",
      message,
      minDelaySeconds,
      maxDelaySeconds,
      nextDueAt: null,
      createdAt: now,
      updatedAt: now,
      items: selected.map((lead) => {
        const alreadySent = !options.allowResendForTest && initialMessageHistory.hasSent(lead.phone);
        return {
          id: crypto.randomUUID(),
          phone: lead.phone,
          text: lead.initialMessage || message,
          status: alreadySent ? "skipped" : "queued",
          createdAt: now,
          skippedAt: alreadySent ? now : undefined,
          skipReason: alreadySent ? "initial_already_sent" : undefined,
        };
      }),
    };

    return this.save(state);
  }

  recordInitialSent(campaignItemId: string | undefined, phone: string, text: string): void {
    initialMessageHistory.recordSent({ phone, text, campaignItemId });
  }

  start(): CampaignState {
    const state = this.load();
    if (state.items.length === 0) throw new Error("Prepare uma campanha antes de iniciar.");
    if (state.status !== "prepared" && state.status !== "paused") {
      throw new Error(`Campanha nao pode iniciar a partir do status ${state.status}.`);
    }

    const now = new Date();
    state.status = "running";
    state.startedAt = state.startedAt || now.toISOString();
    state.nextDueAt = new Date(now.getTime() + 3000).toISOString();
    return this.save(state);
  }

  pause(): CampaignState {
    const state = this.load();
    if (state.status !== "running") throw new Error("Campanha nao esta rodando.");
    state.status = "paused";
    state.nextDueAt = null;
    return this.save(state);
  }

  cancel(): CampaignState {
    const state = this.load();
    state.status = "cancelled";
    state.nextDueAt = null;
    return this.save(state);
  }

  clear(): CampaignState {
    return this.save(emptyState());
  }

  claimNextForSend(): { phone: string; text: string; campaignItemId: string } | null {
    const state = this.load();
    if (state.status !== "running" || !state.nextDueAt) return null;
    if (Date.now() < new Date(state.nextDueAt).getTime()) return null;

    const item = state.items.find((current) => current.status === "queued");
    if (!item) {
      const hasSending = state.items.some((current) => current.status === "sending");
      if (hasSending) {
        state.nextDueAt = null;
        this.save(state);
        return null;
      }
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      state.nextDueAt = null;
      this.save(state);
      return null;
    }

    item.status = "sending";

    const hasNext = state.items.some((current) => current.status === "queued");
    if (hasNext) {
      state.nextDueAt = new Date(Date.now() + randomDelayMs(state.minDelaySeconds, state.maxDelaySeconds)).toISOString();
    } else {
      state.nextDueAt = null;
    }

    this.save(state);
    return { phone: item.phone, text: item.text, campaignItemId: item.id };
  }

  markItemSent(campaignItemId: string | undefined): CampaignState {
    const state = this.load();
    if (!campaignItemId) return state;
    const item = state.items.find((current) => current.id === campaignItemId);
    if (!item) return state;
    item.status = "sent";
    item.sentAt = new Date().toISOString();
    item.error = undefined;
    const hasPending = state.items.some((current) => current.status === "queued" || current.status === "sending");
    if (!hasPending && state.status === "running") {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      state.nextDueAt = null;
    }
    return this.save(state);
  }

  markItemFailed(campaignItemId: string | undefined, error: string): CampaignState {
    const state = this.load();
    if (!campaignItemId) return state;
    const item = state.items.find((current) => current.id === campaignItemId);
    if (!item) return state;
    item.status = "failed";
    item.failedAt = new Date().toISOString();
    item.error = error;
    const hasPending = state.items.some((current) => current.status === "queued" || current.status === "sending");
    if (!hasPending && state.status === "running") {
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      state.nextDueAt = null;
    }
    return this.save(state);
  }
}

export const campaignStore = new CampaignStore();

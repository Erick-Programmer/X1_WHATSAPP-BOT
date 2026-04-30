export type BotMode = "safe_mode" | "armed_off" | "live_on";

/**
 * Runtime state for the bot in copilot mode.
 * Controls whether the bot is in test mode, disabled, or live.
 * Envio real só pode ser ativado se WHATSAPP_REAL_SEND_ALLOWED=true no .env.
 */
class BotRuntimeState {
  private _mode: BotMode = "safe_mode";
  private readonly _realSendAllowed: boolean;

  constructor() {
    this._realSendAllowed = process.env.WHATSAPP_REAL_SEND_ALLOWED === "true";
  }

  /** Current bot mode */
  get mode(): BotMode {
    return this._mode;
  }

  /** Whether the .env allows real sending */
  get realSendAllowed(): boolean {
    return this._realSendAllowed;
  }

  /** Whether it's possible to go live (env allows + not already live) */
  get canGoLive(): boolean {
    return this._realSendAllowed && this._mode !== "live_on";
  }

  /**
   * Enable live mode.
   * Throws if realSendAllowed is false.
   */
  enable(): void {
    if (!this._realSendAllowed) {
      throw new Error("Envio real bloqueado pelo .env");
    }
    this._mode = "live_on";
  }

  /**
   * Disable live mode → armed_off.
   */
  disable(): void {
    this._mode = "armed_off";
  }

  /**
   * Switch to safe mode.
   * Throws if currently live_on.
   */
  safeMode(): void {
    if (this._mode === "live_on") {
      throw new Error("Bot ligado. Desligue antes de entrar em modo teste.");
    }
    this._mode = "safe_mode";
  }
}

export const botRuntime = new BotRuntimeState();

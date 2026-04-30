import { BotResponse } from "../types/conversation";

/**
 * Mocked WhatsApp client.
 * Logs messages to console instead of sending them.
 * Replace with real WhatsApp Cloud API integration in production.
 */
class WhatsAppClient {
  private enabled: boolean;

  constructor() {
    this.enabled = true;
  }

  /**
   * Enable or disable the client.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Send a text message to a contact.
   */
  async sendText(to: string, body: string): Promise<void> {
    if (!this.enabled) {
      console.log(`[WA MOCK - DISABLED] sendText to ${to}: ${body}`);
      return;
    }

    console.log("=".repeat(50));
    console.log(`[WHATSAPP - TEXT]`);
    console.log(`  To: ${to}`);
    console.log(`  Body: ${body}`);
    console.log("=".repeat(50));
  }

  /**
   * Send an image message to a contact.
   */
  async sendImage(to: string, imagePath: string, caption?: string): Promise<void> {
    if (!this.enabled) {
      console.log(`[WA MOCK - DISABLED] sendImage to ${to}: ${imagePath} (${caption || "sem legenda"})`);
      return;
    }

    console.log("=".repeat(50));
    console.log(`[WHATSAPP - IMAGE]`);
    console.log(`  To: ${to}`);
    console.log(`  Image: ${imagePath}`);
    console.log(`  Caption: ${caption || "(sem legenda)"}`);
    console.log("=".repeat(50));
  }

  /**
   * Send a document message to a contact.
   */
  async sendDocument(to: string, documentPath: string, caption?: string): Promise<void> {
    if (!this.enabled) {
      console.log(`[WA MOCK - DISABLED] sendDocument to ${to}: ${documentPath} (${caption || "sem legenda"})`);
      return;
    }

    console.log("=".repeat(50));
    console.log(`[WHATSAPP - DOCUMENT]`);
    console.log(`  To: ${to}`);
    console.log(`  Document: ${documentPath}`);
    console.log(`  Caption: ${caption || "(sem legenda)"}`);
    console.log("=".repeat(50));
  }

  /**
   * Send a bot response (text, image, or document) to a contact.
   */
  async sendResponse(to: string, response: BotResponse): Promise<void> {
    switch (response.type) {
      case "text":
        await this.sendText(to, response.content);
        break;
      case "image":
        await this.sendImage(to, response.content, response.caption);
        break;
      case "document":
        await this.sendDocument(to, response.content, response.caption);
        break;
    }
  }

  /**
   * Send multiple bot responses to a contact in sequence.
   */
  async sendResponses(to: string, responses: BotResponse[]): Promise<void> {
    for (const response of responses) {
      await this.sendResponse(to, response);
    }
  }
}

export const whatsappClient = new WhatsAppClient();

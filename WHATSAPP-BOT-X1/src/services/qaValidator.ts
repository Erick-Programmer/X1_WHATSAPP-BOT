import { BotResponse } from "../types/conversation";
import { salesRules } from "../config/rules";

export interface ValidationResult {
  approved: boolean;
  reason?: string;
}

const forbiddenPatterns = [
  /aprova[çc][ãa]o garantida/,
  /nota alta garantida/,
  /resultado garantido/,
  /passar (de ano|no vestibular|no enem) (com certeza|garantido)/,
  /100% (de|garantido|aprovado)/,
  /milagroso/,
  /f[óo]rmula m[áa]gica/,
];

export function validateResponse(responses: BotResponse[]): ValidationResult {
  for (const response of responses) {
    if (response.type !== "text") continue;

    const text = response.content;

    // Check line count
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > salesRules.maxResponseLines) {
      return {
        approved: false,
        reason: `Resposta muito longa: ${lines.length} linhas (máx: ${salesRules.maxResponseLines})`,
      };
    }

    // Check forbidden patterns
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text.toLowerCase())) {
        return {
          approved: false,
          reason: `Resposta contém padrão proibido: "${pattern.source}"`,
        };
      }
    }

    // Check emoji count
    const emojiMatches = text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu);
    const emojiCount = emojiMatches ? emojiMatches.length : 0;
    if (emojiCount > salesRules.maxEmojisPerMessage) {
      return {
        approved: false,
        reason: `Resposta contém ${emojiCount} emojis (máx: ${salesRules.maxEmojisPerMessage})`,
      };
    }
  }

  return { approved: true };
}

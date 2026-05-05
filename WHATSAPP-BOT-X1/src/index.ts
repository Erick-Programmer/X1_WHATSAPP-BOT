/**
 * WHATSAPP-BOT-X1 — Planner Estudante Pro
 *
 * Simulação do fluxo de atendimento comercial.
 * Esta é uma versão inicial com fluxos comerciais e estrutura de código.
 * A integração real com WhatsApp Cloud API será feita em etapa futura.
 */

import "./config/env";
import { Conversation, Contact, Message } from "./types/conversation";
import { Intent } from "./types/intent";
import { classifyIntent } from "./services/intentClassifier";
import { generateResponse } from "./services/responseGenerator";
import { validateResponse } from "./services/qaValidator";
import { delayQueue } from "./services/delayQueue";
import { whatsappClient } from "./services/whatsappClient";

const SIMULATED_CONTACT = "5511999999999";

function createConversation(input: string): Conversation {
  const contact: Contact = {
    phone: SIMULATED_CONTACT,
    name: "Cliente Simulado",
    firstInteractionAt: new Date(),
    lastInteractionAt: new Date(),
  };

  const message: Message = {
    id: `msg_${Date.now()}`,
    from: SIMULATED_CONTACT,
    to: "bot",
    text: input,
    timestamp: new Date(),
    type: "text",
  };

  const intentResult = classifyIntent(input);

  return {
    contact,
    messages: [message],
    currentIntent: intentResult.intent,
    step: "entry",
    isActive: true,
    needsHuman: intentResult.intent === Intent.HumanNeeded,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function simulateInteraction(input: string): Promise<void> {
  console.log("\n");
  console.log("#".repeat(60));
  console.log("# SIMULAÇÃO DE ATENDIMENTO - Planner Estudante Pro");
  console.log("#".repeat(60));
  console.log(`\n📩 CLIENTE: "${input}"`);

  // 1. Classify intent
  const intentResult = classifyIntent(input);
  console.log(`\n🔍 INTENT CLASSIFICADO: ${intentResult.intent} (confiança: ${intentResult.confidence})`);

  // 2. Create conversation context
  const conversation = createConversation(input);

  // 3. Generate response
  const responses = generateResponse(conversation);
  console.log(`\n📋 RESPOSTAS GERADAS: ${responses.length}`);

  // 4. Validate response
  const validation = validateResponse(responses);
  console.log(`\n✅ VALIDAÇÃO QA: ${validation.approved ? "APPROVED" : `BLOCKED - ${validation.reason}`}`);

  if (!validation.approved) {
    console.log("\n⚠️ Resposta bloqueada pelo validador. Simulação interrompida.");
    return;
  }

  // 5. Simulate human-like delay
  console.log(`\n⏳ Aguardando delay humanizado...`);
  await delayQueue.waitForDelay();

  // 6. Send responses via mocked client
  console.log(`\n📤 ENVIANDO RESPOSTAS:\n`);
  await whatsappClient.sendResponses(SIMULATED_CONTACT, responses);

  console.log("\n" + "#".repeat(60));
  console.log("# FIM DA SIMULAÇÃO");
  console.log("#".repeat(60));
}

// === SIMULAÇÃO PRINCIPAL ===
// Entrada: "sim pode mandar"
// Saída esperada:
//   - classifica como positive_confirmation
//   - envia texto curto
//   - envia imagem product_planners
//   - envia texto curto
//   - envia imagem bonus_ebooks
//   - pergunta se quer valor e forma de acesso

async function main(): Promise<void> {
  const userInput = "sim pode mandar";
  await simulateInteraction(userInput);
}

main().catch(console.error);

/**
 * simulateIntents.ts — Simulação múltipla de intenções
 *
 * Testa várias mensagens comuns de WhatsApp e reporta:
 * - entrada
 * - intenção classificada
 * - confiança
 * - quantidade de respostas
 * - QA approved/blocked
 * - resumo da primeira resposta
 *
 * Uso:
 *   npm run build
 *   node dist/dev/simulateIntents.js
 */

import { classifyIntent } from "../services/intentClassifier";
import { generateResponse } from "../services/responseGenerator";
import { validateResponse } from "../services/qaValidator";
import { Conversation } from "../types/conversation";
import { Intent } from "../types/intent";

const SIMULATED_CONTACT = "5511999999999";

function createMinimalConversation(input: string): Conversation {
  const intentResult = classifyIntent(input);

  return {
    contact: {
      phone: SIMULATED_CONTACT,
      name: "Cliente Simulado",
      firstInteractionAt: new Date(),
      lastInteractionAt: new Date(),
    },
    messages: [
      {
        id: `msg_${Date.now()}`,
        from: SIMULATED_CONTACT,
        to: "bot",
        text: input,
        timestamp: new Date(),
        type: "text",
      },
    ],
    currentIntent: intentResult.intent,
    step: "entry",
    isActive: true,
    needsHuman: intentResult.intent === Intent.HumanNeeded,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function formatFirstResponse(responses: { type: string; content: string; caption?: string }[]): string {
  if (responses.length === 0) return "(sem resposta)";
  const first = responses[0];
  const preview = first.content.length > 60 ? first.content.substring(0, 60) + "..." : first.content;
  return `[${first.type}] ${preview}`;
}

const testInputs = [
  "sim",
  "claro pode mandar",
  "pode mandar sim",
  "quero ver",
  "manda aí",
  "quanto custa?",
  "qual o valor?",
  "tem desconto?",
  "como recebo?",
  "é digital?",
  "vem por email?",
  "serve para ensino médio?",
  "serve para fundamental?",
  "tem coisa para ENEM?",
  "tem simulado?",
  "ajuda com redação?",
  "vou pensar",
  "está caro",
  "não quero mais",
  "parar",
  "quero falar com atendente",
  "tive problema no pagamento",
  "quero comprar",
  "manda o link",
  "isso é golpe?",
  "posso imprimir?",
  "funciona no tablet?",
];

async function runAll(): Promise<void> {
  console.log("#".repeat(80));
  console.log("# SIMULAÇÃO MÚLTIPLA DE INTENÇÕES");
  console.log("#".repeat(80));
  console.log("\n");

  let passed = 0;
  let blocked = 0;
  const risks: string[] = [];

  for (const input of testInputs) {
    // 1. Classify
    const intentResult = classifyIntent(input);

    // 2. Create conversation
    const conversation = createMinimalConversation(input);

    // 3. Generate response
    const responses = generateResponse(conversation);

    // 4. Validate
    const validation = validateResponse(responses);

    // 5. Log
    const status = validation.approved ? "✅ APPROVED" : "❌ BLOCKED";
    if (validation.approved) passed++;
    else blocked++;

    console.log(`┌─ ${input.padEnd(35)}`);
    console.log(`│ Intent: ${intentResult.intent.padEnd(30)} Confiança: ${intentResult.confidence}`);
    console.log(`│ Respostas: ${responses.length.toString().padEnd(28)} QA: ${status}`);
    console.log(`│ 1ª resp: ${formatFirstResponse(responses)}`);
    console.log(`└${"─".repeat(70)}`);
    console.log();

    // Risk detection
    if (intentResult.confidence < 0.5 && intentResult.intent !== Intent.Unknown) {
      risks.push(
        `Baixa confiança (${intentResult.confidence}) para "${input}" → ${intentResult.intent}`
      );
    }
  }

  // Summary
  console.log("=".repeat(80));
  console.log("RESUMO");
  console.log("=".repeat(80));
  console.log(`Total de entradas: ${testInputs.length}`);
  console.log(`✅ QA Approved: ${passed}`);
  console.log(`❌ QA Blocked:  ${blocked}`);
  console.log();

  if (risks.length > 0) {
    console.log("⚠️  RISCOS IDENTIFICADOS:");
    for (const risk of risks) {
      console.log(`   - ${risk}`);
    }
  } else {
    console.log("✅ Nenhum risco identificado.");
  }
  console.log();
}

runAll().catch(console.error);

import { classifyIntent } from "../services/intentClassifier";
import { generateSuggestions } from "../services/replySuggestions";
import { reviewQueue } from "../services/reviewQueue";
import { commercialConfig } from "../config/commercial";
import { getLogFilePath } from "../services/eventLogger";

/**
 * Simulates the copilot flow with sale outcome marking:
 * 1. Customer sends a message
 * 2. System classifies intent
 * 3. System generates 3 suggestions
 * 4. User chooses suggestion 1
 * 5. System sends via mocked whatsappClient
 * 6. Status becomes "sent"
 * 7. User marks the sale outcome (sale = true)
 */
async function simulateSaleOutcome() {
  console.log("=".repeat(60));
  console.log("🧑‍💻 MODO COPILOTO — MARCAÇÃO DE RESULTADO DE VENDA");
  console.log("=".repeat(60));

  // Step 1: Customer message
  const customerMessage = "quanto custa?";
  const contactId = "5511999999999";
  const messageId = "msg_sale_001";

  console.log(`\n📩 Cliente (${contactId}): "${customerMessage}"`);

  // Step 2: Classify intent
  const intentResult = classifyIntent(customerMessage);
  console.log(`\n🔍 Intenção classificada: ${intentResult.intent} (confiança: ${intentResult.confidence})`);

  // Step 3: Generate 3 suggestions
  const suggestions = generateSuggestions(intentResult.intent);
  console.log(`\n💡 Sugestões geradas (${suggestions.length}):`);
  suggestions.forEach((s, i) => {
    const validated = s.validated ? "✅" : "⚠️";
    console.log(`  ${i + 1}. [${s.type}] ${validated} ${s.text}`);
  });

  // Step 4: Create review item (pending_review)
  const reviewItem = reviewQueue.createReviewItem(
    contactId,
    messageId,
    customerMessage,
    intentResult.intent,
    suggestions
  );
  console.log(`\n📋 Item de revisão criado:`);
  console.log(`  ID: ${reviewItem.id}`);
  console.log(`  Status: ${reviewItem.status}`);

  // Step 5: User chooses suggestion 1 (direct)
  const chosenIndex = 0; // direct
  const chosenSuggestion = suggestions[chosenIndex];
  console.log(`\n👤 Usuário escolheu sugestão ${chosenIndex + 1} (${chosenSuggestion.type})`);

  // Step 6: Approve the suggestion
  const approvedItem = reviewQueue.approveSuggestion(reviewItem.id, chosenSuggestion.id);
  console.log(`  Status após aprovação: ${approvedItem.status}`);

  // Step 7: Send via mocked whatsappClient
  console.log(`\n📤 Enviando mensagem via WhatsApp (mockado)...`);
  await reviewQueue.sendChosen(reviewItem.id);

  // Step 8: Check final status
  const finalItem = reviewQueue.getReviewItem(reviewItem.id);
  console.log(`\n✅ Status final do review item: ${finalItem!.status}`);

  // Step 9: Mark sale outcome
  console.log(`\n💰 Marcando resultado da venda...`);
  reviewQueue.markSaleOutcome(reviewItem.id, true, {
    amount: commercialConfig.price,
    note: "cliente comprou pelo checkout",
  });
  console.log(`   Venda registrada: true`);
  console.log(`   Valor: ${commercialConfig.price}`);
  console.log(`   Nota: cliente comprou pelo checkout`);

  // Step 10: Verify status remains "sent"
  const afterSaleItem = reviewQueue.getReviewItem(reviewItem.id);
  console.log(`\n📋 Status após marcação de venda: ${afterSaleItem!.status} (deve permanecer "sent")`);

  console.log("\n" + "=".repeat(60));
  console.log("🏁 SIMULAÇÃO DE VENDA CONCLUÍDA COM SUCESSO");
  console.log("=".repeat(60));

  // Show log file path
  console.log(`\n📁 Eventos registrados em: ${getLogFilePath()}`);
}

simulateSaleOutcome().catch((err) => {
  console.error("❌ Erro na simulação:", err);
  process.exit(1);
});

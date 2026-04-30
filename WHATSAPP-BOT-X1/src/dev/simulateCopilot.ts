import { classifyIntent } from "../services/intentClassifier";
import { generateSuggestions } from "../services/replySuggestions";
import { reviewQueue } from "../services/reviewQueue";

/**
 * Simulates the copilot flow:
 * 1. Customer sends a message
 * 2. System classifies intent
 * 3. System generates 3 suggestions
 * 4. User (simulated) chooses suggestion 1
 * 5. System sends via mocked whatsappClient
 * 6. Status becomes "sent"
 */
async function simulateCopilot() {
  console.log("=".repeat(60));
  console.log("🧑‍💻 MODO COPILOTO — SIMULAÇÃO DE ATENDIMENTO");
  console.log("=".repeat(60));

  // Step 1: Customer message
  const customerMessage = "quanto custa?";
  const contactId = "5511999999999";
  const messageId = "msg_001";

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
  console.log(`  Sugestão escolhida: ${approvedItem.chosenSuggestionId}`);

  // Step 7: Send via mocked whatsappClient
  console.log(`\n📤 Enviando mensagem via WhatsApp (mockado)...`);
  await reviewQueue.sendChosen(reviewItem.id);

  // Step 8: Check final status
  const finalItem = reviewQueue.getReviewItem(reviewItem.id);
  console.log(`\n✅ Status final do review item: ${finalItem!.status}`);
  console.log(`   ContactId: ${finalItem!.contactId}`);
  console.log(`   Mensagem original: "${finalItem!.customerMessage}"`);
  console.log(`   Sugestão enviada: "${finalItem!.suggestions.find(s => s.id === finalItem!.chosenSuggestionId)?.text}"`);

  console.log("\n" + "=".repeat(60));
  console.log("🏁 SIMULAÇÃO CONCLUÍDA COM SUCESSO");
  console.log("=".repeat(60));
}

simulateCopilot().catch((err) => {
  console.error("❌ Erro na simulação:", err);
  process.exit(1);
});

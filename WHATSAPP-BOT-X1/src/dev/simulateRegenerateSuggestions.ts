import { classifyIntent } from "../services/intentClassifier";
import { generateSuggestions } from "../services/replySuggestions";
import { reviewQueue } from "../services/reviewQueue";

/**
 * Simulates the copilot flow with suggestion regeneration:
 * 1. Customer sends a message
 * 2. System classifies intent
 * 3. System generates 3 suggestions (round 1)
 * 4. User says "não gostei, gerar outras"
 * 5. System generates 3 new suggestions (round 2)
 * 6. Replaces suggestions in the review item
 * 7. User chooses suggestion 2
 * 8. System approves and sends via mocked whatsappClient
 * 9. Status becomes "sent"
 */
async function simulateRegenerateSuggestions() {
  console.log("=".repeat(60));
  console.log("🧑‍💻 MODO COPILOTO — REGENERAÇÃO DE SUGESTÕES");
  console.log("=".repeat(60));

  // Step 1: Customer message
  const customerMessage = "quanto custa?";
  const contactId = "5511999999999";
  const messageId = "msg_002";

  console.log(`\n📩 Cliente (${contactId}): "${customerMessage}"`);

  // Step 2: Classify intent
  const intentResult = classifyIntent(customerMessage);
  console.log(`\n🔍 Intenção classificada: ${intentResult.intent} (confiança: ${intentResult.confidence})`);

  // Step 3: Generate 3 suggestions (round 1)
  const round1 = await generateSuggestions(intentResult.intent, 1);
  console.log(`\n💡 Sugestões iniciais — Round 1 (${round1.length}):`);
  round1.forEach((s, i) => {
    const validated = s.validated ? "✅" : "⚠️";
    console.log(`  ${i + 1}. [${s.type}] ${validated} ${s.text}`);
  });

  // Step 4: Create review item (pending_review)
  const reviewItem = reviewQueue.createReviewItem(
    contactId,
    messageId,
    customerMessage,
    intentResult.intent,
    round1
  );
  console.log(`\n📋 Item de revisão criado:`);
  console.log(`  ID: ${reviewItem.id}`);
  console.log(`  Status: ${reviewItem.status}`);

  // Step 5: User says "não gostei, gerar outras"
  console.log(`\n👤 Usuário: "não gostei, gerar outras 3"`);

  // Step 6: Generate round 2 and replace suggestions
  const round2 = await generateSuggestions(intentResult.intent, 2);
  console.log(`\n💡 Novas sugestões — Round 2 (${round2.length}):`);
  round2.forEach((s, i) => {
    const validated = s.validated ? "✅" : "⚠️";
    console.log(`  ${i + 1}. [${s.type}] ${validated} ${s.text}`);
  });

  // Step 7: Replace suggestions in the review item
  const regeneratedItem = reviewQueue.regenerateSuggestions(reviewItem.id, round2);
  console.log(`\n🔄 Sugestões substituídas no review item:`);
  console.log(`  Status: ${regeneratedItem.status}`);
  console.log(`  chosenSuggestionId: ${regeneratedItem.chosenSuggestionId}`);
  console.log(`  Total de sugestões agora: ${regeneratedItem.suggestions.length}`);

  // Step 8: User chooses suggestion 2 (index 1 = explanatory)
  const chosenIndex = 1; // explanatory
  const chosenSuggestion = round2[chosenIndex];
  console.log(`\n👤 Usuário escolheu sugestão ${chosenIndex + 1} (${chosenSuggestion.type})`);

  // Step 9: Approve the suggestion
  const approvedItem = reviewQueue.approveSuggestion(reviewItem.id, chosenSuggestion.id);
  console.log(`  Status após aprovação: ${approvedItem.status}`);
  console.log(`  Sugestão escolhida: ${approvedItem.chosenSuggestionId}`);

  // Step 10: Send via mocked whatsappClient
  console.log(`\n📤 Enviando mensagem via WhatsApp (mockado)...`);
  await reviewQueue.sendChosen(reviewItem.id);

  // Step 11: Check final status
  const finalItem = reviewQueue.getReviewItem(reviewItem.id);
  console.log(`\n✅ Status final do review item: ${finalItem!.status}`);
  console.log(`   ContactId: ${finalItem!.contactId}`);
  console.log(`   Mensagem original: "${finalItem!.customerMessage}"`);
  const sentSuggestion = finalItem!.suggestions.find(s => s.id === finalItem!.chosenSuggestionId);
  console.log(`   Sugestão enviada: "${sentSuggestion?.text}"`);

  console.log("\n" + "=".repeat(60));
  console.log("🏁 SIMULAÇÃO DE REGENERAÇÃO CONCLUÍDA COM SUCESSO");
  console.log("=".repeat(60));
}

simulateRegenerateSuggestions().catch((err) => {
  console.error("❌ Erro na simulação:", err);
  process.exit(1);
});

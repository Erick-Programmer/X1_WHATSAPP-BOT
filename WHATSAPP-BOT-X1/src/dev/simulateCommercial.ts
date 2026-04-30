/**
 * simulateCommercial.ts — Simulação comercial (checkout configurado vs não configurado)
 *
 * Testa 4 entradas em 2 cenários:
 *   A) isCheckoutConfigured = false (config padrão)
 *   B) isCheckoutConfigured = true  (config mockado com link da Cakto)
 *
 * Uso:
 *   npm run build
 *   node dist/dev/simulateCommercial.js
 */

import { handlePricing } from "../flows/pricing";
import { handleClosing } from "../flows/closing";
import { CommercialConfig } from "../config/commercial";

const mockConfig: CommercialConfig = {
  price: "R$ 27,00",
  checkoutUrl: "https://checkout.cakto.com.br/link-teste",
  checkoutPlatform: "Cakto",
  deliveryMethod: "Entrega automática por e-mail com acesso ao Google Drive após a compra pela Cakto.",
  isCheckoutConfigured: true,
  supportNote: "Se tiver qualquer problema com acesso, o atendimento humano ajuda pelo WhatsApp.",
};

function formatResponses(responses: { type: string; content: string }[]): string {
  return responses.map((r) => `  [${r.type}] ${r.content}`).join("\n");
}

function hasUrl(responses: { type: string; content: string }[]): boolean {
  return responses.some((r) => /https?:\/\/[^\s]+/.test(r.content));
}

function runScenario(
  label: string,
  config: CommercialConfig | undefined,
  isMocked: boolean
): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log(` CENÁRIO ${label}: isCheckoutConfigured = ${isMocked}`);
  console.log(`${"=".repeat(70)}`);

  const testCases = [
    { input: "quanto custa?", handler: () => handlePricing(config) },
    { input: "qual o valor?", handler: () => handlePricing(config) },
    { input: "quero comprar", handler: () => handleClosing(config) },
    { input: "manda o link", handler: () => handleClosing(config) },
  ];

  for (const { input, handler } of testCases) {
    const responses = handler();
    const urlFound = hasUrl(responses);
    const status = isMocked
      ? urlFound
        ? "✅ URL presente"
        : "❌ URL ausente (esperado)"
      : urlFound
        ? "❌ URL presente (não esperado)"
        : "✅ Sem URL";

    console.log(`\n📩 "${input}"`);
    console.log(formatResponses(responses));
    console.log(`   → ${status}`);
  }
}

async function main(): Promise<void> {
  console.log("#".repeat(70));
  console.log("# SIMULAÇÃO COMERCIAL — CHECKOUT");
  console.log("#".repeat(70));

  // Cenário A: sem argumento → usa commercialConfig padrão (isCheckoutConfigured: false)
  runScenario("A", undefined, false);

  // Cenário B: com mockConfig (isCheckoutConfigured: true)
  runScenario("B", mockConfig, true);

  console.log(`\n${"=".repeat(70)}`);
  console.log(" FIM DA SIMULAÇÃO");
  console.log(`${"=".repeat(70)}\n`);
}

main().catch(console.error);

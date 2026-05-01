import { loadReviews } from "../services/reviewStore";

/**
 * Script de diagnóstico: mostra quantos reviews estão salvos em data/reviews.json.
 * Uso: npx ts-node src/dev/reportReviewStore.ts
 */
function report(): void {
  const reviews = loadReviews();

  console.log("=".repeat(50));
  console.log("REVIEW STORE - DIAGNÓSTICO");
  console.log("=".repeat(50));

  if (reviews.length === 0) {
    console.log("Nenhum review salvo em data/reviews.json.");
    return;
  }

  console.log(`Reviews salvos:     ${reviews.length}`);

  const byStatus: Record<string, number> = {};
  for (const r of reviews) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  for (const [status, count] of Object.entries(byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }

  // Últimos 3 reviews
  const sorted = [...reviews].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  console.log("\nÚltimos 3 reviews:");
  for (const r of sorted.slice(0, 3)) {
    console.log(
      `  [${r.id.substring(0, 8)}] ${r.intent} | ${r.status} | ${r.contactId}`
    );
  }
}

report();

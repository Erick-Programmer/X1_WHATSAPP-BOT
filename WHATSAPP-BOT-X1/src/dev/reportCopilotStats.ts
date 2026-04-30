import * as fs from "fs";
import * as path from "path";

const LOG_FILE = path.resolve(process.cwd(), "data", "copilot-events.jsonl");

interface SentEvent {
  event: "suggestion_sent";
  reviewId: string;
  intent: string;
  suggestionType: string;
  suggestionText: string;
}

interface SaleEvent {
  event: "sale_outcome";
  reviewId: string;
  intent: string;
  suggestionType?: string;
  suggestionText?: string;
  sale: boolean;
}

type Event = SentEvent | SaleEvent;

function pct(part: number, total: number): string {
  if (total === 0) return "0.00%";
  return ((part / total) * 100).toFixed(2) + "%";
}

function report(): void {
  // Check if file exists
  if (!fs.existsSync(LOG_FILE)) {
    console.log("Nenhum evento encontrado ainda.");
    return;
  }

  // Read and parse lines
  const raw = fs.readFileSync(LOG_FILE, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  let skipped = 0;
  const events: Event[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.event === "suggestion_sent" || parsed.event === "sale_outcome") {
        events.push(parsed as Event);
      }
    } catch {
      skipped++;
    }
  }

  // --- Counters ---
  let totalSent = 0;
  let totalSaleOutcomes = 0;
  let totalSales = 0;

  // Per intent
  const byIntent: Record<string, { sent: number; sales: number }> = {};

  // Per suggestionType
  const byType: Record<string, { sent: number; sales: number }> = {};

  // Per suggestion text (top 5)
  const byText: Record<string, { count: number; sales: number }> = {};

  for (const ev of events) {
    if (ev.event === "suggestion_sent") {
      totalSent++;

      // By intent
      if (!byIntent[ev.intent]) byIntent[ev.intent] = { sent: 0, sales: 0 };
      byIntent[ev.intent].sent++;

      // By type
      if (!byType[ev.suggestionType]) byType[ev.suggestionType] = { sent: 0, sales: 0 };
      byType[ev.suggestionType].sent++;

      // By text
      if (!byText[ev.suggestionText]) byText[ev.suggestionText] = { count: 0, sales: 0 };
      byText[ev.suggestionText].count++;
    }

    if (ev.event === "sale_outcome") {
      totalSaleOutcomes++;

      if (ev.sale) {
        totalSales++;

        // By intent
        if (!byIntent[ev.intent]) byIntent[ev.intent] = { sent: 0, sales: 0 };
        byIntent[ev.intent].sales++;

        // By type
        const st = ev.suggestionType || "unknown";
        if (!byType[st]) byType[st] = { sent: 0, sales: 0 };
        byType[st].sales++;

        // By text
        const txt = ev.suggestionText || "(no text)";
        if (!byText[txt]) byText[txt] = { count: 0, sales: 0 };
        byText[txt].sales++;
      }
    }
  }

  // --- Output ---
  const sep = "=".repeat(60);
  console.log(sep);
  console.log("RELATORIO DE METRICAS - MODO COPILOTO");
  console.log(sep);

  console.log("\nVisao Geral");
  console.log(`   Total enviados:      ${totalSent}`);
  console.log(`   Total sale_outcome:  ${totalSaleOutcomes}`);
  console.log(`   Vendas (sale: true): ${totalSales}`);
  console.log(`   Conversao geral:     ${pct(totalSales, totalSent)}`);

  if (skipped > 0) {
    console.log(`   Linhas ignoradas:    ${skipped}`);
  }

  // By intent
  const intentKeys = Object.keys(byIntent).sort();
  if (intentKeys.length > 0) {
    console.log("\nPor Intencao");
    for (const intent of intentKeys) {
      const d = byIntent[intent];
      console.log(`   ${intent}: enviados=${d.sent}  vendas=${d.sales}  conv=${pct(d.sales, d.sent)}`);
    }
  }

  // By type
  const typeKeys = Object.keys(byType).sort();
  if (typeKeys.length > 0) {
    console.log("\nPor Tipo de Sugestao");
    for (const type of typeKeys) {
      const d = byType[type];
      console.log(`   ${type}: enviados=${d.sent}  vendas=${d.sales}  conv=${pct(d.sales, d.sent)}`);
    }
  }

  // Top 5 by text
  const textEntries = Object.entries(byText)
    .map(([text, d]) => ({ text, count: d.count, sales: d.sales }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (textEntries.length > 0) {
    console.log("\nTop 5 Sugestoes");
    textEntries.forEach((entry, i) => {
      const preview =
        entry.text.length > 60 ? entry.text.substring(0, 57) + "..." : entry.text;
      console.log(
        `   ${i + 1}. "${preview}" (${entry.count}x, ${entry.sales} vendas, ${pct(entry.sales, entry.count)})`
      );
    });
  }

  console.log();
}

report();

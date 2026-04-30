import * as fs from "fs";
import * as path from "path";

const LOG_FILE = path.resolve(process.cwd(), "data", "copilot-events.jsonl");
const BACKUP_DIR = path.resolve(process.cwd(), "data", "backups");

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function timestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}-${mo}-${day}-${h}-${mi}-${s}`;
}

function reset(): void {
  // Check if file exists
  if (!fs.existsSync(LOG_FILE)) {
    console.log("Nenhum arquivo de eventos encontrado.");
    return;
  }

  // Check file size
  const stats = fs.statSync(LOG_FILE);
  if (stats.size === 0) {
    console.log("Arquivo de eventos ja esta vazio.");
    return;
  }

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Create backup
  const backupName = `copilot-events-${timestamp()}.jsonl`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.copyFileSync(LOG_FILE, backupPath);

  // Clear original
  fs.writeFileSync(LOG_FILE, "", "utf-8");

  console.log(`Backup criado: ${backupPath}`);
  console.log(`Arquivo original limpo: data/copilot-events.jsonl`);
}

reset();

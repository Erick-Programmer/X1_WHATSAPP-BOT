function send(message) {
  return chrome.runtime.sendMessage(message);
}

function formatStatus(status) {
  if (!status) return "Sem status.";
  const lines = [
    `Estado: ${status.running ? "ativo" : "pausado"}`,
    `Ocupado: ${status.busy ? "sim" : "não"}`
  ];
  if (status.lastTask) {
    lines.push(`Última tarefa: @${status.lastTask.username || "-"} · ${status.lastTask.status || status.lastTask.source || "-"}`);
  }
  if (status.lastCapture) {
    lines.push(`Captura: ${status.lastCapture.imported || 0}/${status.lastCapture.checked || 0}`);
    if (status.lastCapture.skipped) lines.push(`Puladas: ${status.lastCapture.skipped}`);
    const last = (status.lastCapture.results || [])[0];
    if (last) {
      lines.push(`Última: ${last.name || "-"} · ${last.message || "-"}`);
      if (last.skipped) lines.push(`Motivo: ${last.reason || "skipped"}`);
      if (last.error) lines.push(`Erro import: ${last.error}`);
    }
    if (status.lastCapture.error) lines.push(`Erro captura: ${status.lastCapture.error}`);
  }
  if (status.lastError) lines.push(`Erro: ${status.lastError}`);
  return lines.join("\n");
}

async function refresh() {
  const box = document.getElementById("statusBox");
  try {
    const result = await send({ action: "status" });
    box.textContent = formatStatus(result.status);
  } catch (err) {
    box.textContent = "Erro: " + (err instanceof Error ? err.message : String(err));
  }
}

async function setRunning(running) {
  const result = await send({ action: "toggleRunning", running });
  document.getElementById("statusBox").textContent = formatStatus(result.status);
}

async function captureNow() {
  const box = document.getElementById("statusBox");
  box.textContent = "Capturando...";
  const result = await send({ action: "captureNow" });
  box.textContent = formatStatus(result.status);
}

document.getElementById("enableBtn").addEventListener("click", () => setRunning(true));
document.getElementById("disableBtn").addEventListener("click", () => setRunning(false));
document.getElementById("captureBtn").addEventListener("click", captureNow);
document.getElementById("refreshBtn").addEventListener("click", refresh);
refresh();

/**
 * popup.js — Copiloto WhatsApp Extension
 *
 * Fluxo:
 * 1. Usuário clica "Capturar" ou "Capturar da lista"
 * 2. content.js captura dados do DOM
 * 3. Popup exibe preview para revisão
 * 4. Usuário pode preencher telefone opcionalmente
 * 5. Usuário clica "Importar para painel" → POST /api/inbox/import
 * 6. Exibe resultado (sucesso com ID / erro)
 *
 * Regras de segurança:
 * - Só faz request para http://127.0.0.1:8787
 * - Não armazena dados em localStorage
 * - Não acessa internet externa
 */

(function () {
  "use strict";

  // ─── DOM refs ──────────────────────────────────────────────

  const screenCapture = document.getElementById("screenCapture");
  const screenCapture2 = document.getElementById("screenCapture2");
  const screenPreview = document.getElementById("screenPreview");

  const btnCapture = document.getElementById("btnCapture");
  const btnList = document.getElementById("btnList");
  const btnDiagnose = document.getElementById("btnDiagnose");
  const btnImport = document.getElementById("btnImport");
  const btnCancel = document.getElementById("btnCancel");

  const statusEl = document.getElementById("status");

  const previewName = document.getElementById("previewName");
  const previewMessage = document.getElementById("previewMessage");
  const previewTime = document.getElementById("previewTime");
  const inputPhone = document.getElementById("inputPhone");
  const phoneWarning = document.getElementById("phoneWarning");

  // ─── Estado interno ────────────────────────────────────────

  let capturedData = null; // { contactName, contactPhone, lastMessage, receivedAt }

  // ─── Helpers ───────────────────────────────────────────────

  function setStatus(type, text) {
    statusEl.className = "status " + type;
    statusEl.textContent = text;
  }

  function showCaptureButtons() {
    screenCapture.style.display = "flex";
    screenCapture2.style.display = "flex";
    screenPreview.style.display = "none";
    screenPreview.classList.remove("visible");
  }

  function showPreview(data) {
    capturedData = data;

    // Preenche preview
    previewName.textContent = data.contactName || "—";
    previewMessage.textContent = data.lastMessage || "—";
    previewTime.textContent = data.receivedAt
      ? new Date(data.receivedAt).toLocaleString("pt-BR")
      : "—";

    // Telefone: se veio do content.js, preenche automaticamente
    inputPhone.value = data.contactPhone || "";

    // Aviso se não tem telefone
    if (!data.contactPhone) {
      phoneWarning.style.display = "block";
    } else {
      phoneWarning.style.display = "none";
    }

    // Mostra preview, esconde botões de captura
    screenCapture.style.display = "none";
    screenCapture2.style.display = "none";
    screenPreview.style.display = "block";
    screenPreview.classList.add("visible");

    setStatus("idle", "📋 Revise os dados antes de importar.");
  }

  function showSuccess(reviewId) {
    // Mostra mensagem de sucesso no lugar do preview
    screenPreview.innerHTML = `
      <div class="success-msg">
        ✅ Conversa importada com sucesso!<br/>
        <strong>ID: ${reviewId}</strong>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button id="btnNewCapture" class="btn-capture" style="flex:1">📥 Nova captura</button>
      </div>
    `;

    document.getElementById("btnNewCapture").addEventListener("click", () => {
      // Recarrega o popup (fecha e reabre)
      window.location.reload();
    });
  }

  // ─── Encontrar tab do WhatsApp ─────────────────────────────

  async function findWATab() {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const waTab = tabs.find(
      (tab) => tab.url && tab.url.startsWith("https://web.whatsapp.com")
    );

    if (!waTab || !waTab.id) {
      setStatus(
        "error",
        "❌ Nenhuma aba do WhatsApp Web encontrada. Abra o WhatsApp Web e tente novamente."
      );
      return null;
    }

    return waTab;
  }

  // ─── Capturar (conversa aberta) ────────────────────────────

  async function handleCapture() {
    btnCapture.disabled = true;
    setStatus("loading", "⏳ Capturando dados da conversa...");

    try {
      const waTab = await findWATab();
      if (!waTab) { btnCapture.disabled = false; return; }

      const response = await chrome.tabs.sendMessage(waTab.id, {
        action: "capture",
      });

      if (!response) {
        setStatus("error", "❌ Sem resposta do WhatsApp Web. A página pode estar carregando.");
        btnCapture.disabled = false;
        return;
      }

      if (response.error) {
        let errorMsg = "❌ " + response.error;
        if (response.debug) {
          const d = response.debug;
          errorMsg += `\n🔍 Debug: .message-in=${d.messageInCount}, .message-out=${d.messageOutCount}, span.selectable-text=${d.selectableTextCount}`;
          if (d.candidateTexts && d.candidateTexts.length > 0) {
            errorMsg += `\n   candidatos: ${d.candidateTexts.join(" | ")}`;
          }
        }
        setStatus("error", errorMsg);
        btnCapture.disabled = false;
        return;
      }

      // Mostra preview
      showPreview({
        contactName: response.contactName || "",
        contactPhone: response.contactPhone || "",
        lastMessage: response.lastMessage || "",
        receivedAt: response.receivedAt || new Date().toISOString(),
      });
    } catch (err) {
      console.error("[Copiloto WhatsApp] Erro:", err);
      if (err.message && err.message.includes("Could not establish connection")) {
        setStatus("error", "❌ Não foi possível conectar ao WhatsApp Web. Recarregue a página (F5) e tente novamente.");
      } else {
        setStatus("error", "❌ Erro inesperado: " + (err.message || err));
      }
    } finally {
      btnCapture.disabled = false;
    }
  }

  // ─── Capturar da lista ─────────────────────────────────────

  async function handleCaptureList() {
    btnList.disabled = true;
    setStatus("loading", "📋 Capturando primeira conversa da lista...");

    try {
      const waTab = await findWATab();
      if (!waTab) { btnList.disabled = false; return; }

      const response = await chrome.tabs.sendMessage(waTab.id, {
        action: "captureList",
      });

      if (!response) {
        setStatus("error", "❌ Sem resposta do WhatsApp Web. A página pode estar carregando.");
        btnList.disabled = false;
        return;
      }

      if (response.error) {
        let errorMsg = "❌ " + response.error;
        if (response.debug) {
          const d = response.debug;
          errorMsg += `\n🔍 Debug: rows=${d.rowCount}, candidates=${d.candidateCount}`;
          if (d.candidateTexts && d.candidateTexts.length > 0) {
            errorMsg += `\n   candidatos: ${d.candidateTexts.join(" | ")}`;
          }
        }
        setStatus("error", errorMsg);
        btnList.disabled = false;
        return;
      }

      // Mostra preview
      showPreview({
        contactName: response.contactName || "",
        contactPhone: response.contactPhone || "",
        lastMessage: response.lastMessage || "",
        receivedAt: response.receivedAt || new Date().toISOString(),
      });
    } catch (err) {
      console.error("[Copiloto WhatsApp] Erro captura lista:", err);
      if (err.message && err.message.includes("Could not establish connection")) {
        setStatus("error", "❌ Não foi possível conectar ao WhatsApp Web. Recarregue a página (F5) e tente novamente.");
      } else {
        setStatus("error", "❌ Erro inesperado: " + (err.message || err));
      }
    } finally {
      btnList.disabled = false;
    }
  }

  // ─── Diagnóstico ───────────────────────────────────────────

  async function handleDiagnose() {
    btnDiagnose.disabled = true;
    setStatus("loading", "🔍 Diagnosticando DOM do WhatsApp Web...");

    try {
      const waTab = await findWATab();
      if (!waTab) { btnDiagnose.disabled = false; return; }

      const response = await chrome.tabs.sendMessage(waTab.id, {
        action: "diagnose",
      });

      if (!response || !response.ok) {
        setStatus("error", "❌ Falha no diagnóstico: " + (response?.error || "sem resposta"));
        btnDiagnose.disabled = false;
        return;
      }

      let text = "🔍 Diagnóstico do DOM:\n";
      for (const sample of response.samples) {
        text += `\n• ${sample}`;
      }
      setStatus("success", text);
    } catch (err) {
      setStatus("error", "❌ Erro no diagnóstico: " + (err.message || err));
    } finally {
      btnDiagnose.disabled = false;
    }
  }

  // ─── Importar para painel ──────────────────────────────────

  async function handleImport() {
    if (!capturedData) return;

    btnImport.disabled = true;
    btnCancel.disabled = true;
    setStatus("loading", "⏳ Enviando para o painel...");

    // Pega telefone do input, limpa só dígitos
    let phoneRaw = inputPhone.value.trim();
    let phoneClean = phoneRaw.replace(/\D/g, "");

    const payload = {
      contactName: capturedData.contactName || "",
      contactPhone: phoneClean || "",
      lastMessage: capturedData.lastMessage || "",
      receivedAt: capturedData.receivedAt || new Date().toISOString(),
      source: "whatsapp_web_extension",
    };

    try {
      const fetchResult = await fetch(
        "http://127.0.0.1:8787/api/inbox/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!fetchResult.ok) {
        let errorMsg = "";
        try {
          const errBody = await fetchResult.json();
          errorMsg = errBody.error || fetchResult.statusText;
        } catch {
          errorMsg = fetchResult.statusText || "Erro desconhecido";
        }
        setStatus("error", `❌ Painel retornou erro ${fetchResult.status}: ${errorMsg}`);
        btnImport.disabled = false;
        btnCancel.disabled = false;
        return;
      }

      const result = await fetchResult.json();

      // Sucesso!
      setStatus("success", `✅ Conversa importada! ID: ${result.reviewId}`);
      showSuccess(result.reviewId);
    } catch (err) {
      console.error("[Copiloto WhatsApp] Erro ao importar:", err);
      if (err.message && err.message.includes("Failed to fetch")) {
        setStatus("error", "❌ Não foi possível conectar ao painel local (127.0.0.1:8787). Certifique-se de que o painel está rodando.");
      } else {
        setStatus("error", "❌ Erro inesperado: " + (err.message || err));
      }
      btnImport.disabled = false;
      btnCancel.disabled = false;
    }
  }

  // ─── Cancelar ──────────────────────────────────────────────

  function handleCancel() {
    capturedData = null;
    inputPhone.value = "";
    showCaptureButtons();
    setStatus("idle", "✕ Captura cancelada.");
  }

  // ─── Eventos ───────────────────────────────────────────────

  btnCapture.addEventListener("click", handleCapture);
  btnList.addEventListener("click", handleCaptureList);
  btnDiagnose.addEventListener("click", handleDiagnose);
  btnImport.addEventListener("click", handleImport);
  btnCancel.addEventListener("click", handleCancel);

  // Se o popup abrir e não houver WhatsApp Web, avisar
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const isWA = tabs.some(
      (tab) => tab.url && tab.url.startsWith("https://web.whatsapp.com")
    );
    if (!isWA) {
      setStatus("idle", "ℹ️ Abra o WhatsApp Web em outra aba e clique em uma conversa.");
    }
  });
})();

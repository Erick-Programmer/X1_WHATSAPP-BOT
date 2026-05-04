/**
 * content.js — Copiloto WhatsApp Extension
 *
 * Content script injetado no WhatsApp Web (https://web.whatsapp.com/*).
 *
 * ⚠️ ATENÇÃO: Este script APENAS LÊ o DOM. Ele NÃO:
 *   - Envia mensagens pelo WhatsApp
 *   - Clica em botões de envio
 *   - Preenche campos de mensagem
 *   - Modifica o DOM de qualquer forma
 *   - Acessa localStorage
 *   - Acessa internet externa
 *
 * ⚠️ Best-effort: O DOM do WhatsApp Web muda frequentemente.
 *   Os seletores abaixo funcionam na versão atual (2025),
 *   mas podem quebrar com atualizações. Teste antes de confiar.
 *
 * Fluxo:
 *   1. popup.js envia mensagem {action: "capture"}
 *   2. content.js tenta ler a conversa aberta
 *   3. Retorna {contactName, contactPhone, lastMessage, receivedAt}
 *   4. Se não conseguir dados válidos, retorna {error: "..."} com debug
 *
 * Regras de captura:
 *   - Só captura mensagens RECEBIDAS (do cliente)
 *   - Ignora mensagens ENVIADAS (message-out / respostas do bot)
 *   - Exige nome OU telefone do contato
 *   - Exige pelo menos uma mensagem recebida com texto
 */

(function () {
  "use strict";

  // ─── Listeners ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === "capture") {
      const result = captureOpenConversation();
      sendResponse(result);
    } else if (request && request.action === "diagnose") {
      const result = diagnosePage();
      sendResponse(result);
    } else if (request && request.action === "captureList") {
      const result = captureFromList();
      sendResponse(result);
    }
    return true;
  });

  // ─── Função de diagnóstico ──────────────────────────────────

  /**
   * Coleta amostras seguras do DOM para depuração de seletores.
   * Não posta nada para o painel. Só retorna para o popup exibir.
   */
  function diagnosePage() {
    try {
      const samples = [];

      function addSample(label, value) {
        const str = String(value).substring(0, 120);
        samples.push(`${label}: ${str}`);
      }

      // Informações básicas
      addSample("location.href", location.href);
      addSample("document.title", document.title);

      // Contagens de elementos
      addSample("bodyTextLength", (document.body ? document.body.innerText.length : 0));
      addSample("mainCount", document.querySelectorAll("main").length);
      addSample("headerCount", document.querySelectorAll("header").length);
      addSample("spanCount", document.querySelectorAll("span").length);
      addSample("divCount", document.querySelectorAll("div").length);
      addSample("roleRowCount", document.querySelectorAll('[role="row"]').length);
      addSample("roleListitemCount", document.querySelectorAll('[role="listitem"]').length);
      addSample("roleButtonCount", document.querySelectorAll('[role="button"]').length);
      addSample("roleTextboxCount", document.querySelectorAll('[role="textbox"]').length);
      addSample("roleApplicationCount", document.querySelectorAll('[role="application"]').length);

      // Amostras de aria-label (até 10)
      const ariaLabels = document.querySelectorAll("[aria-label]");
      let ariaCount = 0;
      for (const el of ariaLabels) {
        if (ariaCount >= 10) break;
        const label = el.getAttribute("aria-label") || "";
        if (label.trim()) {
          addSample(`aria-label[${ariaCount}]`, label.substring(0, 80));
          ariaCount++;
        }
      }

      // Amostras de data-testid (até 10)
      const testIds = document.querySelectorAll("[data-testid]");
      let testIdCount = 0;
      for (const el of testIds) {
        if (testIdCount >= 10) break;
        const tid = el.getAttribute("data-testid") || "";
        if (tid.trim()) {
          addSample(`data-testid[${testIdCount}]`, tid.substring(0, 80));
          testIdCount++;
        }
      }

      // Amostras de texto do body (até 20 linhas não vazias)
      if (document.body) {
        const lines = document.body.innerText.split("\n").filter(l => l.trim());
        let lineCount = 0;
        for (const line of lines) {
          if (lineCount >= 20) break;
          const clean = line.trim();
          if (clean) {
            addSample(`text[${lineCount}]`, clean.substring(0, 120));
            lineCount++;
          }
        }
      }

      return { ok: true, samples: samples };
    } catch (err) {
      return { ok: false, error: err.message || "Erro no diagnóstico" };
    }
  }


  // ─── Utilitários ───────────────────────────────────────────

  /**
   * Verifica se um texto é ruído (horário, data relativa, etc.)
   */
  function isNoise(text) {
    if (!text || !text.trim()) return true;
    const t = text.trim();

    // Apenas horário (ex: "12:34", "2:30", "00:00")
    if (/^\d{1,2}:\d{2}$/.test(t)) return true;

    // Apenas dia da semana / data relativa
    if (/^(Hoje|Ontem|Amanhã|Today|Yesterday)$/i.test(t)) return true;

    // Apenas número de telefone
    if (/^[\d\s\+\-\(\)]+$/.test(t) && t.length < 20) return true;

    return false;
  }

  /**
   * Verifica se um elemento é uma mensagem ENVIADA (message-out).
   * Usa múltiplos indicadores para maior precisão.
   */
  function isOutgoingMessage(el) {
    // Classe message-out (clássico do WhatsApp Web)
    if (el.classList.contains("message-out")) return true;
    if (el.closest(".message-out")) return true;

    // data-testid indicando outgoing
    if (el.querySelector('[data-testid*="outgoing"]')) return true;

    // Ícones de confirmação de envio (check, double-check)
    const hasCheck = el.querySelector(
      '[data-icon="check"], [data-icon="double-check"], ' +
      '[data-icon="msg-check"], [data-icon="msg-dblcheck"], ' +
      '[data-testid*="check"], [data-testid*="doublecheck"]'
    );
    if (hasCheck) return true;

    // Verifica alinhamento: mensagens enviadas geralmente estão à direita
    const parent = el.closest('[role="row"], [role="listitem"]');
    if (parent) {
      const style = window.getComputedStyle(parent);
      if (style.justifyContent === "flex-end" || style.marginLeft !== "0px") {
        return true;
      }
    }

    return false;
  }

  /**
   * Verifica se um elemento é uma mensagem RECEBIDA (message-in).
   */
  function isIncomingMessage(el) {
    // Classe message-in (clássico do WhatsApp Web)
    if (el.classList.contains("message-in")) return true;
    if (el.closest(".message-in")) return true;

    // data-testid indicando incoming
    if (el.querySelector('[data-testid*="incoming"]')) return true;

    // Se tem texto mas NÃO tem indicadores de mensagem enviada
    // e está dentro de um contexto de conversa
    const hasText = el.querySelector("span.selectable-text, span[dir='ltr'], span[dir='auto']");
    if (hasText && !isOutgoingMessage(el)) {
      // Verifica se está dentro do painel de conversa
      const inConversationPanel = el.closest(
        '[role="application"], main, div[aria-label*="mensagem"], div[aria-label*="message"]'
      );
      if (inConversationPanel) return true;
    }

    return false;
  }

  /**
   * Tenta extrair texto de um elemento de mensagem.
   * Retorna string vazia se não encontrar texto válido.
   */
  function extractTextFromMessage(el) {
    if (!el) return "";

    // Abordagem 1: span.selectable-text span (estrutura mais comum)
    const selectableSpan = el.querySelector("span.selectable-text span");
    if (selectableSpan && selectableSpan.textContent.trim()) {
      return selectableSpan.textContent.trim();
    }

    // Abordagem 2: span.selectable-text direto
    const selectable = el.querySelector("span.selectable-text");
    if (selectable && selectable.textContent.trim()) {
      return selectable.textContent.trim();
    }

    // Abordagem 3: span[dir="ltr"] (texto da mensagem)
    const ltrSpan = el.querySelector('span[dir="ltr"]');
    if (ltrSpan && ltrSpan.textContent.trim()) {
      return ltrSpan.textContent.trim();
    }

    // Abordagem 4: span[dir="auto"]
    const autoSpan = el.querySelector('span[dir="auto"]');
    if (autoSpan && autoSpan.textContent.trim()) {
      return autoSpan.textContent.trim();
    }

    // Abordagem 5: qualquer span com texto (evitando spans de horário)
    const allSpans = el.querySelectorAll("span");
    for (const span of allSpans) {
      const text = span.textContent.trim();
      if (text && !isNoise(text) && text.length > 1) {
        return text;
      }
    }

    return "";
  }

  /**
   * Tenta extrair o horário de um elemento de mensagem.
   */
  function extractTimeFromMessage(el) {
    if (!el) return "";

    const timeEl = el.querySelector(
      'span[data-testid*="message-time"], ' +
      '[role="button"] time, ' +
      '[role="button"] span[dir="auto"]'
    );

    if (timeEl) {
      return parseTime(timeEl.textContent.trim());
    }

    return "";
  }

  /**
   * Tenta converter texto de horário para ISO string.
   */
  function parseTime(timeText) {
    if (!timeText) return "";

    try {
      if (timeText.includes("/") || timeText.includes("-")) {
        const parsed = new Date(timeText);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }

      // Apenas horário (ex: "14:30")
      const [hours, minutes] = timeText.split(":").map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const now = new Date();
        now.setHours(hours, minutes, 0, 0);
        return now.toISOString();
      }
    } catch {
      // Ignora erro de parse
    }

    return "";
  }

  // ─── Função principal de captura ───────────────────────────

  function captureOpenConversation() {
    try {
      // ── DEBUG: coletar estatísticas do DOM ──────────────────
      const debug = {
        messageInCount: 0,
        messageOutCount: 0,
        selectableTextCount: document.querySelectorAll("span.selectable-text").length,
        candidateTexts: [],
      };

      // ── 1. Nome do contato ─────────────────────────────────
      const header = document.querySelector("header");
      let contactName = "";
      let contactPhone = "";

      if (header) {
        const nameButton =
          header.querySelector('div[role="button"][title]') ||
          header.querySelector('div[role="button"]');

        if (nameButton) {
          const titleAttr = nameButton.getAttribute("title");
          if (titleAttr) {
            contactName = titleAttr.trim();
          }

          if (!contactName) {
            const nameSpan = nameButton.querySelector(
              'span[dir="auto"], span[dir="ltr"]'
            );
            if (nameSpan) {
              contactName = nameSpan.textContent.trim();
            }
          }

          if (!contactName) {
            contactName = nameButton.textContent.trim();
          }
        }

        // Telefone (best-effort)
        const subtitleSpan = header.querySelector(
          'span[dir="auto"][aria-hidden="true"]'
        );
        if (subtitleSpan) {
          const text = subtitleSpan.textContent.trim();
          if (/\d/.test(text) && text.length < 30) {
            contactPhone = text;
          }
        }

        if (!contactPhone && nameButton) {
          const titleAttr = nameButton.getAttribute("title") || "";
          if (/^[\d\s\+\-\(\)]+$/.test(titleAttr.trim())) {
            contactPhone = titleAttr.trim();
            if (!contactName || contactName === contactPhone) {
              contactName = "";
            }
          }
        }
      }

      // ── 2. Validar contato ──────────────────────────────────
      //
      // Se não encontrou nem nome nem telefone, não adianta continuar.
      // O painel criaria um contato fallback genérico sem utilidade.

      if (!contactName && !contactPhone) {
        return {
          error:
            "Contato não identificado. Abra uma conversa individual no WhatsApp Web e tente novamente.",
          debug: debug,
        };
      }

      // ── 3. Última mensagem RECEBIDA do cliente ──────────────
      //
      // ESTRATÉGIA:
      //   a) .message-in (classe clássica do WhatsApp Web)
      //   b) span.selectable-text cujo ancestor NÃO seja .message-out
      //
      // IMPORTANTE: Ignorar completamente mensagens dentro de .message-out
      // para não capturar respostas enviadas pelo bot.

      let lastMessage = "";
      let receivedAt = "";

      // ── Estratégia A: .message-in ───────────────────────────
      const messageInElements = document.querySelectorAll(".message-in");
      debug.messageInCount = messageInElements.length;

      if (messageInElements.length > 0) {
        // Pega a última mensagem recebida (mais recente)
        const lastIncoming = messageInElements[messageInElements.length - 1];
        const text = extractTextFromMessage(lastIncoming);

        if (text && !isNoise(text)) {
          lastMessage = text;
          receivedAt = extractTimeFromMessage(lastIncoming);
        }
      }

      // ── Estratégia B: span.selectable-text filtrando message-out ──
      if (!lastMessage) {
        const selectableSpans = document.querySelectorAll("span.selectable-text");
        debug.selectableTextCount = selectableSpans.length;

        // Varre de trás para frente (mais recente primeiro)
        for (let i = selectableSpans.length - 1; i >= 0; i--) {
          const span = selectableSpans[i];
          const text = span.textContent.trim();

          // Ignora se estiver dentro de uma mensagem enviada
          if (span.closest(".message-out")) {
            debug.candidateTexts.push(`[OUT] ${text.substring(0, 50)}`);
            continue;
          }

          // Ignora ruídos
          if (!text || isNoise(text)) continue;

          // Verifica se está dentro do contexto de conversa
          const inConversation = span.closest(
            '[role="application"], main, div[aria-label*="mensagem"], div[aria-label*="message"]'
          );
          if (!inConversation) continue;

          // Se passou por todos os filtros, é uma mensagem recebida válida
          lastMessage = text;
          debug.candidateTexts.push(`[IN] ${text.substring(0, 50)}`);

          // Tenta extrair horário do elemento pai da mensagem
          const messageEl = span.closest(".message-in, [role='row'], [role='listitem']");
          if (messageEl) {
            receivedAt = extractTimeFromMessage(messageEl);
          }

          break;
        }
      }

      // ── 4. Validar mensagem recebida ─────────────────────────
      //
      // Só importa se encontrou uma mensagem RECEBIDA real do cliente.

      if (!lastMessage) {
        return {
          error:
            "Nenhuma mensagem recebida do cliente foi encontrada. " +
            "Certifique-se de que o cliente enviou pelo menos uma mensagem na conversa.",
          debug: debug,
        };
      }

      // ── 5. Horário (fallback) ────────────────────────────────
      if (!receivedAt) {
        receivedAt = new Date().toISOString();
      }

      // ── 6. Retorno ───────────────────────────────────────────
      return {
        contactName: contactName,
        contactPhone: contactPhone,
        lastMessage: lastMessage,
        receivedAt: receivedAt,
      };
    } catch (err) {
      console.error("[Copiloto WhatsApp] Erro ao capturar:", err);
      return {
        error:
          "Erro inesperado ao ler a conversa: " +
          (err.message || "desconhecido") +
          ". Tente novamente.",
      };
    }
  }

  // ─── Captura da lista de conversas ──────────────────────────

  /**
   * Tenta capturar dados da primeira conversa visível na lista lateral.
   *
   * Útil quando o usuário NÃO abriu uma conversa específica,
   * mas quer importar a conversa mais recente ou não lida.
   *
   * ⚠️ Best-effort: lê apenas o que está visível no DOM da lista.
   *   - contactName: nome do contato na lista
   *   - lastMessage: prévia da última mensagem (ignorando "Você:")
   *   - contactPhone: vazio (não visível na lista)
   *   - receivedAt: now ISO
   */
  function captureFromList() {
    try {
      const debug = {
        rowCount: 0,
        candidateCount: 0,
        candidateTexts: [],
      };

      // ── 1. Encontrar rows de conversa na lista lateral ──────
      //
      // O WhatsApp Web renderiza a lista de conversas como:
      //   - div[role="row"] dentro de um container
      //   - Cada row tem nome do contato + prévia da mensagem
      //
      // Tentamos vários seletores para encontrar essas rows.

      const rows = document.querySelectorAll(
        'div[role="row"], ' +
        'div[role="listitem"], ' +
        'div[data-testid*="chat"], ' +
        'div[data-testid*="conversation"], ' +
        'div[data-testid*="list-item"]'
      );

      debug.rowCount = rows.length;

      if (rows.length === 0) {
        return {
          error:
            "Nenhuma conversa encontrada na lista lateral. " +
            "Certifique-se de que o WhatsApp Web está carregado e há conversas visíveis.",
          debug: debug,
        };
      }

      // ── 2. Extrair dados de cada row ─────────────────────────
      //
      // Para cada row, tentamos extrair:
      //   - Nome do contato (primeiro span com texto relevante)
      //   - Prévia da mensagem (último span com texto, ignorando "Você:")
      //
      // Priorizamos conversas que parecem ter mensagens não lidas
      // (indicador visual de não lida).

      const candidates = [];

      for (const row of rows) {
        const allSpans = row.querySelectorAll("span");
        const texts = [];

        for (const span of allSpans) {
          const t = span.textContent.trim();
          if (t && !isNoise(t) && t.length > 1) {
            texts.push(t);
          }
        }

        if (texts.length === 0) continue;

        // O nome geralmente é o primeiro texto relevante
        const contactName = texts[0];

        // A prévia geralmente é o último texto
        let preview = texts[texts.length - 1];

        // Ignora prévias que começam com "Você:" (mensagens enviadas por mim)
        if (/^Você:/i.test(preview)) {
          // Tenta o penúltimo se houver
          if (texts.length >= 3) {
            preview = texts[texts.length - 2];
          } else {
            preview = "";
          }
        }

        // Ignora se a prévia for igual ao nome (sem mensagem)
        if (preview === contactName) {
          preview = "";
        }

        // Verifica se parece ser conversa de grupo (muitos participantes)
        const isGroup = contactName && contactName.length > 20;

        candidates.push({
          contactName: contactName,
          lastMessage: preview,
          isGroup: isGroup,
        });

        debug.candidateTexts.push(
          `nome="${contactName.substring(0, 30)}" preview="${preview.substring(0, 40)}"`
        );
      }

      debug.candidateCount = candidates.length;

      // ── 3. Selecionar o melhor candidato ─────────────────────
      //
      // Prioridade:
      //   1. Primeira conversa com preview não vazia (mais recente no topo)
      //   2. Que não seja grupo
      //   3. Que tenha nome

      let best = null;

      for (const c of candidates) {
        if (c.contactName && c.lastMessage && !c.isGroup) {
          best = c;
          break;
        }
      }

      // Fallback: primeira com nome e preview (mesmo grupo)
      if (!best) {
        for (const c of candidates) {
          if (c.contactName && c.lastMessage) {
            best = c;
            break;
          }
        }
      }

      // Fallback: primeira com nome
      if (!best) {
        for (const c of candidates) {
          if (c.contactName) {
            best = c;
            break;
          }
        }
      }

      if (!best) {
        return {
          error:
            "Nenhuma conversa com dados válidos encontrada na lista. " +
            "Tente clicar em uma conversa primeiro e usar 'Capturar'.",
          debug: debug,
        };
      }

      // ── 4. Retorno ───────────────────────────────────────────
      return {
        contactName: best.contactName,
        contactPhone: "",
        lastMessage: best.lastMessage,
        receivedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error("[Copiloto WhatsApp] Erro ao capturar da lista:", err);
      return {
        error:
          "Erro inesperado ao ler a lista de conversas: " +
          (err.message || "desconhecido") +
          ". Tente novamente.",
      };
    }
  }

  // ─── Polling de Leads ──────────────────────────────────────

  let pollingInterval = null;
  let highlightedLeads = new Set();

  async function fetchLeads() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { action: "fetchProxy", url: "http://127.0.0.1:8787/api/leads", method: "GET" },
          (res) => resolve((res && res.ok && res.data && res.data.leads) ? res.data.leads : [])
        );
      } catch { resolve([]); }
    });
  }

  function normalizePhone(str) {
    return String(str || "").replace(/\D/g, "");
  }

  async function scanAndHighlight() {
    const leads = await fetchLeads();
    if (!leads.length) return;

    const leadPhones = new Set(leads.map(l => normalizePhone(l.phone)));

    const rows = document.querySelectorAll('div[role="row"], div[role="listitem"]');
    for (const row of rows) {
      const spans = row.querySelectorAll("span");
      let matched = false;

      for (const span of spans) {
        const t = normalizePhone(span.textContent);
        if (t.length >= 8 && leadPhones.has(t)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        row.style.borderLeft = "4px solid #25D366";
        row.style.backgroundColor = "rgba(37,211,102,0.08)";
      }
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startPolling") {
      if (!pollingInterval) {
        pollingInterval = setInterval(scanAndHighlight, 5000);
        scanAndHighlight(); // roda imediatamente
      }
      sendResponse({ ok: true, running: true });
    } else if (request.action === "stopPolling") {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        // Remove highlights
        document.querySelectorAll('div[role="row"], div[role="listitem"]').forEach(r => {
          r.style.borderLeft = "";
          r.style.backgroundColor = "";
        });
      }
      sendResponse({ ok: true, running: false });
    } else if (request.action === "pollingStatus") {
      sendResponse({ running: !!pollingInterval });
    }
    return true;
  });
  
  // ─── Auto-import polling — inicia automaticamente ──────────
  let autoImportInterval = null;
  let importedCache = new Set();

  async function autoImportScan() {
    const rows = document.querySelectorAll('div[role="row"], div[role="listitem"]');
    for (const row of rows) {
      const spans = row.querySelectorAll("span");
      const texts = [];
      for (const span of spans) {
        const t = span.textContent.trim();
        if (t && t.length > 1) texts.push(t);
      }
      if (texts.length < 2) continue;
      // Se texts[0] for badge de notificação, pegar texts[1] como nome
      let contactName = texts[0];
      if (/^\d+\s*mensagem/i.test(contactName)) {
        contactName = texts[1] || "";
      }
      // Ignorar nomes de sistema do WhatsApp
      const NOME_INVALIDO = /^(default-|wa-chat-|wds-ic-|WhatsApp Business$|1\d{15,})/i;
      if (NOME_INVALIDO.test(contactName)) continue;
      // Ignorar textos que parecem notificações, não nomes
      if (/mensagem|não lida|unread|arquivad/i.test(contactName)) continue;
      // Ignorar se o "nome" for muito curto ou só números grandes
      if (contactName.length < 2) continue;
      
      let lastMessage = texts[texts.length - 1];
      // Ignorar previews que são ícones de status de envio
      if (/^(msg-dblcheck|msg-check|tail-in|tail-out|ic-|status-)/.test(lastMessage)) continue;
      if (lastMessage.length > 200) continue;
      // Ignorar se lastMessage parece horário ou número puro
      if (/^\d{1,2}:\d{2}$/.test(lastMessage)) continue;
      if (/^\d{10,}$/.test(lastMessage)) continue;
      if (/^Você:/i.test(lastMessage)) lastMessage = texts[texts.length - 2] || "";
      if (!lastMessage || lastMessage === contactName) continue;
      const cacheKey = `${contactName}::${lastMessage}`;
      if (importedCache.has(cacheKey)) continue;
      importedCache.add(cacheKey);
      try {
        chrome.runtime.sendMessage({
          action: "fetchProxy",
          url: "http://127.0.0.1:8787/api/inbox/import",
          method: "POST",
          body: { contactName, contactPhone: "", lastMessage, receivedAt: new Date().toISOString() },
        });
      } catch { /* extensão recarregando */ }
    }
  }

  // Inicia automaticamente ao carregar a página
  autoImportInterval = setInterval(autoImportScan, 5000);
  autoImportScan(); // roda imediatamente
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startAutoImport") {
      if (!autoImportInterval) {
        autoImportInterval = setInterval(autoImportScan, 5000);
        autoImportScan();
      }
      sendResponse({ ok: true });
    } else if (request.action === "stopAutoImport") {
      clearInterval(autoImportInterval);
      autoImportInterval = null;
      importedCache.clear();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ─── Injetar texto na conversa por telefone ────────────────
  async function openConversationAndInject(phone, text) {
    const digits = phone.replace(/\D/g, "");
    console.log('[INJECT] iniciando para:', digits, 'texto:', text.slice(0,20));

    const input = document.querySelector('input[aria-label="Pesquisar ou começar uma nova conversa"]');
    console.log('[INJECT] input encontrado:', !!input);
    if (!input) return { ok: false, error: "Campo de busca não encontrado." };

    input.focus();
    input.click();
    await new Promise(r => setTimeout(r, 300));

    // 2. Limpa e digita o número
    input.value = "";
    document.execCommand("insertText", false, digits);
    await new Promise(r => setTimeout(r, 1500));

    // 3. Clica no primeiro resultado
    // Aguarda resultados renderizarem
    await new Promise(r => setTimeout(r, 1500));
    const allResults = document.querySelectorAll('div[role="listitem"], div[role="row"]');
    
    let firstResult = null;
    for (let i = 0; i < allResults.length; i++) {
      const txt = allResults[i].textContent.replace(/\D/g,'');
      if (txt.includes(digits.slice(-8))) {
        firstResult = allResults[i];
        break;
      }
    }
    // Fallback: pega o segundo elemento (índice 1) se não achou pelo número
    if (!firstResult && allResults.length > 1) {
      firstResult = allResults[1];
    }

    if (!firstResult) {
      // Limpa busca e sai
      input.value = "";
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      return { ok: false, error: "Nenhum resultado encontrado para " + digits };
    }

    console.log('[INJECT] firstResult:', firstResult ? firstResult.textContent.slice(0,50) : 'null');

    // Clica na conversa
    firstResult.click();

    // Limpa o campo de busca
    await new Promise(r => setTimeout(r, 300));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    // Aguarda a conversa NOVA carregar verificando o aria-label do box
    let box = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const candidate = document.querySelector('[data-testid="conversation-compose-box-input"]');
      if (candidate && candidate.getAttribute('aria-label') && candidate.getAttribute('aria-label').includes(digits.slice(-8))) {
        box = candidate;
        break;
      }
    }
    // Fallback: pega qualquer box disponível
    if (!box) {
      await new Promise(r => setTimeout(r, 1000));
      box = document.querySelector('[data-testid="conversation-compose-box-input"]');
    }
    if (!box) return { ok: false, error: "Campo de texto não encontrado." };

    await new Promise(r => setTimeout(r, 200));
    console.log('[INJECT] box encontrado:', !!box, box ? box.getAttribute('aria-label') : '');    
    box.focus();
    box.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    document.execCommand('insertText', false, text);

    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "injectText") {
      openConversationAndInject(request.phone, request.text)
        .then(sendResponse);
      return true;
    }
  });

})();



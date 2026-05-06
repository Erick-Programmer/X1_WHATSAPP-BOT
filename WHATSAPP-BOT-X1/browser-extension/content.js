/**
 * content.js â€” Copiloto WhatsApp Extension
 *
 * Content script injetado no WhatsApp Web (https://web.whatsapp.com/*).
 *
 * âš ï¸ ATENÃ‡ÃƒO: Este script APENAS LÃŠ o DOM. Ele NÃƒO:
 *   - Envia mensagens pelo WhatsApp
 *   - Clica em botÃµes de envio
 *   - Preenche campos de mensagem
 *   - Modifica o DOM de qualquer forma
 *   - Acessa localStorage
 *   - Acessa internet externa
 *
 * âš ï¸ Best-effort: O DOM do WhatsApp Web muda frequentemente.
 *   Os seletores abaixo funcionam na versÃ£o atual (2025),
 *   mas podem quebrar com atualizaÃ§Ãµes. Teste antes de confiar.
 *
 * Fluxo:
 *   1. popup.js envia mensagem {action: "capture"}
 *   2. content.js tenta ler a conversa aberta
 *   3. Retorna {contactName, contactPhone, lastMessage, receivedAt}
 *   4. Se nÃ£o conseguir dados vÃ¡lidos, retorna {error: "..."} com debug
 *
 * Regras de captura:
 *   - SÃ³ captura mensagens RECEBIDAS (do cliente)
 *   - Ignora mensagens ENVIADAS (message-out / respostas do bot)
 *   - Exige nome OU telefone do contato
 *   - Exige pelo menos uma mensagem recebida com texto
 */

(function () {
  "use strict";

  // â”€â”€â”€ Listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ FunÃ§Ã£o de diagnÃ³stico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Coleta amostras seguras do DOM para depuraÃ§Ã£o de seletores.
   * NÃ£o posta nada para o painel. SÃ³ retorna para o popup exibir.
   */
  function diagnosePage() {
    try {
      const samples = [];

      function addSample(label, value) {
        const str = String(value).substring(0, 120);
        samples.push(`${label}: ${str}`);
      }

      // InformaÃ§Ãµes bÃ¡sicas
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

      // Amostras de aria-label (atÃ© 10)
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

      // Amostras de data-testid (atÃ© 10)
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

      // Amostras de texto do body (atÃ© 20 linhas nÃ£o vazias)
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
      return { ok: false, error: err.message || "Erro no diagnÃ³stico" };
    }
  }


  // â”€â”€â”€ UtilitÃ¡rios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Verifica se um texto Ã© ruÃ­do (horÃ¡rio, data relativa, etc.)
   */
  function isNoise(text) {
    if (!text || !text.trim()) return true;
    const t = text.trim();

    // Apenas horÃ¡rio (ex: "12:34", "2:30", "00:00")
    if (/^\d{1,2}:\d{2}$/.test(t)) return true;

    // Apenas dia da semana / data relativa
    if (/^(Hoje|Ontem|AmanhÃ£|Today|Yesterday)$/i.test(t)) return true;

    // Apenas nÃºmero de telefone
    if (/^[\d\s\+\-\(\)]+$/.test(t) && t.length < 20) return true;

    return false;
  }

  /**
   * Verifica se um elemento Ã© uma mensagem ENVIADA (message-out).
   * Usa mÃºltiplos indicadores para maior precisÃ£o.
   */
  function isOutgoingMessage(el) {
    // Classe message-out (clÃ¡ssico do WhatsApp Web)
    if (el.classList.contains("message-out")) return true;
    if (el.closest(".message-out")) return true;

    // data-testid indicando outgoing
    if (el.querySelector('[data-testid*="outgoing"]')) return true;

    // Ãcones de confirmaÃ§Ã£o de envio (check, double-check)
    const hasCheck = el.querySelector(
      '[data-icon="check"], [data-icon="double-check"], ' +
      '[data-icon="msg-check"], [data-icon="msg-dblcheck"], ' +
      '[data-testid*="check"], [data-testid*="doublecheck"]'
    );
    if (hasCheck) return true;

    // Verifica alinhamento: mensagens enviadas geralmente estÃ£o Ã  direita
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
   * Verifica se um elemento Ã© uma mensagem RECEBIDA (message-in).
   */
  function isIncomingMessage(el) {
    // Classe message-in (clÃ¡ssico do WhatsApp Web)
    if (el.classList.contains("message-in")) return true;
    if (el.closest(".message-in")) return true;

    // data-testid indicando incoming
    if (el.querySelector('[data-testid*="incoming"]')) return true;

    // Se tem texto mas NÃƒO tem indicadores de mensagem enviada
    // e estÃ¡ dentro de um contexto de conversa
    const hasText = el.querySelector("span.selectable-text, span[dir='ltr'], span[dir='auto']");
    if (hasText && !isOutgoingMessage(el)) {
      // Verifica se estÃ¡ dentro do painel de conversa
      const inConversationPanel = el.closest(
        '[role="application"], main, div[aria-label*="mensagem"], div[aria-label*="message"]'
      );
      if (inConversationPanel) return true;
    }

    return false;
  }

  /**
   * Tenta extrair texto de um elemento de mensagem.
   * Retorna string vazia se nÃ£o encontrar texto vÃ¡lido.
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

    // Abordagem 5: qualquer span com texto (evitando spans de horÃ¡rio)
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
   * Tenta extrair o horÃ¡rio de um elemento de mensagem.
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
   * Tenta converter texto de horÃ¡rio para ISO string.
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

      // Apenas horÃ¡rio (ex: "14:30")
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

  // â”€â”€â”€ FunÃ§Ã£o principal de captura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function captureOpenConversation() {
    try {
      // â”€â”€ DEBUG: coletar estatÃ­sticas do DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const debug = {
        messageInCount: 0,
        messageOutCount: 0,
        selectableTextCount: document.querySelectorAll("span.selectable-text").length,
        candidateTexts: [],
      };

      // â”€â”€ 1. Nome do contato â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      // â”€â”€ 2. Validar contato â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // Se nÃ£o encontrou nem nome nem telefone, nÃ£o adianta continuar.
      // O painel criaria um contato fallback genÃ©rico sem utilidade.

      if (!contactName && !contactPhone) {
        return {
          error:
            "Contato nÃ£o identificado. Abra uma conversa individual no WhatsApp Web e tente novamente.",
          debug: debug,
        };
      }

      // â”€â”€ 3. Ãšltima mensagem RECEBIDA do cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // ESTRATÃ‰GIA:
      //   a) .message-in (classe clÃ¡ssica do WhatsApp Web)
      //   b) span.selectable-text cujo ancestor NÃƒO seja .message-out
      //
      // IMPORTANTE: Ignorar completamente mensagens dentro de .message-out
      // para nÃ£o capturar respostas enviadas pelo bot.

      let lastMessage = "";
      let receivedAt = "";

      // â”€â”€ EstratÃ©gia A: .message-in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const messageInElements = document.querySelectorAll(".message-in");
      debug.messageInCount = messageInElements.length;

      if (messageInElements.length > 0) {
        // Pega a Ãºltima mensagem recebida (mais recente)
        const lastIncoming = messageInElements[messageInElements.length - 1];
        const text = extractTextFromMessage(lastIncoming);

        if (text && !isNoise(text)) {
          lastMessage = text;
          receivedAt = extractTimeFromMessage(lastIncoming);
        }
      }

      // â”€â”€ EstratÃ©gia B: span.selectable-text filtrando message-out â”€â”€
      if (!lastMessage) {
        const selectableSpans = document.querySelectorAll("span.selectable-text");
        debug.selectableTextCount = selectableSpans.length;

        // Varre de trÃ¡s para frente (mais recente primeiro)
        for (let i = selectableSpans.length - 1; i >= 0; i--) {
          const span = selectableSpans[i];
          const text = span.textContent.trim();

          // Ignora se estiver dentro de uma mensagem enviada
          if (span.closest(".message-out")) {
            debug.candidateTexts.push(`[OUT] ${text.substring(0, 50)}`);
            continue;
          }

          // Ignora ruÃ­dos
          if (!text || isNoise(text)) continue;

          // Verifica se estÃ¡ dentro do contexto de conversa
          const inConversation = span.closest(
            '[role="application"], main, div[aria-label*="mensagem"], div[aria-label*="message"]'
          );
          if (!inConversation) continue;

          // Se passou por todos os filtros, Ã© uma mensagem recebida vÃ¡lida
          lastMessage = text;
          debug.candidateTexts.push(`[IN] ${text.substring(0, 50)}`);

          // Tenta extrair horÃ¡rio do elemento pai da mensagem
          const messageEl = span.closest(".message-in, [role='row'], [role='listitem']");
          if (messageEl) {
            receivedAt = extractTimeFromMessage(messageEl);
          }

          break;
        }
      }

      // â”€â”€ 4. Validar mensagem recebida â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // SÃ³ importa se encontrou uma mensagem RECEBIDA real do cliente.

      if (!lastMessage) {
        return {
          error:
            "Nenhuma mensagem recebida do cliente foi encontrada. " +
            "Certifique-se de que o cliente enviou pelo menos uma mensagem na conversa.",
          debug: debug,
        };
      }

      // â”€â”€ 5. HorÃ¡rio (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!receivedAt) {
        receivedAt = new Date().toISOString();
      }

      // â”€â”€ 6. Retorno â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Captura da lista de conversas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Tenta capturar dados da primeira conversa visÃ­vel na lista lateral.
   *
   * Ãštil quando o usuÃ¡rio NÃƒO abriu uma conversa especÃ­fica,
   * mas quer importar a conversa mais recente ou nÃ£o lida.
   *
   * âš ï¸ Best-effort: lÃª apenas o que estÃ¡ visÃ­vel no DOM da lista.
   *   - contactName: nome do contato na lista
   *   - lastMessage: prÃ©via da Ãºltima mensagem (ignorando "VocÃª:")
   *   - contactPhone: vazio (nÃ£o visÃ­vel na lista)
   *   - receivedAt: now ISO
   */
  function captureFromList() {
    try {
      const debug = {
        rowCount: 0,
        candidateCount: 0,
        candidateTexts: [],
      };

      // â”€â”€ 1. Encontrar rows de conversa na lista lateral â”€â”€â”€â”€â”€â”€
      //
      // O WhatsApp Web renderiza a lista de conversas como:
      //   - div[role="row"] dentro de um container
      //   - Cada row tem nome do contato + prÃ©via da mensagem
      //
      // Tentamos vÃ¡rios seletores para encontrar essas rows.

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
            "Certifique-se de que o WhatsApp Web estÃ¡ carregado e hÃ¡ conversas visÃ­veis.",
          debug: debug,
        };
      }

      // â”€â”€ 2. Extrair dados de cada row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // Para cada row, tentamos extrair:
      //   - Nome do contato (primeiro span com texto relevante)
      //   - PrÃ©via da mensagem (Ãºltimo span com texto, ignorando "VocÃª:")
      //
      // Priorizamos conversas que parecem ter mensagens nÃ£o lidas
      // (indicador visual de nÃ£o lida).

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

        // O nome geralmente Ã© o primeiro texto relevante
        const contactName = texts[0];

        // A prÃ©via geralmente Ã© o Ãºltimo texto
        let preview = texts[texts.length - 1];

        // Ignora prÃ©vias que comeÃ§am com "VocÃª:" (mensagens enviadas por mim)
        if (/^VocÃª:/i.test(preview)) {
          // Tenta o penÃºltimo se houver
          if (texts.length >= 3) {
            preview = texts[texts.length - 2];
          } else {
            preview = "";
          }
        }

        // Ignora se a prÃ©via for igual ao nome (sem mensagem)
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

      // â”€â”€ 3. Selecionar o melhor candidato â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      //
      // Prioridade:
      //   1. Primeira conversa com preview nÃ£o vazia (mais recente no topo)
      //   2. Que nÃ£o seja grupo
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
            "Nenhuma conversa com dados vÃ¡lidos encontrada na lista. " +
            "Tente clicar em uma conversa primeiro e usar 'Capturar'.",
          debug: debug,
        };
      }

      // â”€â”€ 4. Retorno â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Polling de Leads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  
  // â”€â”€â”€ Auto-import polling â€” inicia automaticamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let autoImportInterval = null;
  let importedCache = new Set();

  function isSystemPreview(text) {
    if (!text) return true;
    const value = text.trim();
    if (!value) return true;
    if (/^Voc/i.test(value)) return true;
    if (/^\d{1,2}:\d{2}$/.test(value)) return true;
    if (/^\+?\d[\d\s().-]{7,}$/.test(value)) return true;
    if (/^(msg-|tail-|ic-|status-|media-|forward-|default-|wa-chat-|wds-ic-)/i.test(value)) return true;
    if (/forward-refreshed|tail-out|tail-in|media-gif/i.test(value)) return true;
    if (/voc[eê] entrou usando um link de convite/i.test(value)) return true;
    if (/bem-vindo\(a\)|bem vindo\(a\)|bem-vindo|bem vindo/i.test(value)) return true;
    if (/mensage(?:m|ns)\s+n[aã]o\s+lidas?/i.test(value)) return true;
    if (/^\d{1,3}$/.test(value)) return true;
    return false;
  }

  function isLikelyGroupName(name) {
    if (!name) return true;
    const value = name.trim();
    if (value.length < 2) return true;
    if (/^(default-|wa-chat-|wds-ic-|WhatsApp Business$|1\d{15,})/i.test(value)) return true;
    if (/mensagem|n[aã]o lida|unread|arquivad/i.test(value)) return true;
    if (/grupo|turma|col[eé]gio|ano[a-z]?\/|enem|professor|comunidade|leil[aã]o|off:|gr[aá]tis/i.test(value)) return true;
    return false;
  }

  function isVisualToken(text) {
    return /^(default-contact-refreshed|wds-ic-|wa-chat-psa|msg-|tail-|ic-|status-|media-|forward-)/i.test(text || "");
  }

  function isGroupRow(texts) {
    return texts.some(t => /^default-group-refreshed$/i.test(t)) ||
      texts.slice(0, 3).some(t => /grupo|turma|col[eé]gio|ano[a-z]?\/|enem|professor|comunidade|leil[aã]o|off:|gr[aá]tis/i.test(t));
  }

  async function autoImportScan() {
    if (window.__copilotoInjectingText) return;
    const rows = document.querySelectorAll('div[role="row"], div[role="listitem"]');
    for (const row of rows) {
      const rowText = row.innerText || "";
      if (/entrou usando um link de convite/i.test(rowText)) continue;
      if (/bem-vindo\(a\)|bem vindo\(a\)|bem-vindo|bem vindo/i.test(rowText)) continue;

      const spans = row.querySelectorAll("span");
      const texts = [];
      for (const span of spans) {
        const t = span.textContent.trim();
        if (t && t.length > 1) texts.push(t);
      }
      if (texts.length < 2) continue;
      if (isGroupRow(texts)) continue;

      const hasUnreadSignal = texts.some(t => /mensage(?:m|ns)\s+n[aã]o\s+lidas?|unread/i.test(t));
      if (!hasUnreadSignal) continue;

      const cleanTexts = texts.filter(t => !isVisualToken(t));
      const phoneText = cleanTexts.find(t => /^\+?\d[\d\s().-]{7,}$/.test(t)) || "";

      // Se texts[0] for badge de notificaÃ§Ã£o, pegar texts[1] como nome
      let contactName = cleanTexts[0] || "";
      if (/^\d+\s*mensagem/i.test(contactName)) {
        contactName = phoneText || "";
      }
      if (/mensage(?:m|ns)\s+n[aã]o\s+lidas?/i.test(contactName)) {
        contactName = phoneText || "";
      }
      if (isLikelyGroupName(contactName)) continue;
      const contactPhone = phoneText ? phoneText.replace(/\D/g, "") : "";
      
      let lastMessage = "";
      for (let i = cleanTexts.length - 1; i >= 0; i--) {
        if (!isSystemPreview(cleanTexts[i]) && cleanTexts[i] !== contactName && cleanTexts[i].length <= 200) {
          lastMessage = cleanTexts[i];
          break;
        }
      }
      if (!lastMessage) continue;

      const cacheKey = `${contactName}::${lastMessage}`;
      if (importedCache.has(cacheKey)) continue;
      importedCache.add(cacheKey);
      try {
        chrome.runtime.sendMessage({
          action: "fetchProxy",
          url: "http://127.0.0.1:8787/api/inbox/import",
          method: "POST",
          body: { contactName, contactPhone, lastMessage, receivedAt: new Date().toISOString() },
        });
      } catch { /* extensÃ£o recarregando */ }
    }
  }

  // Inicia automaticamente ao carregar a pÃ¡gina
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

  // â”€â”€â”€ Injetar texto na conversa por telefone â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function findComposeBox() {
    const selectors = [
      '[data-testid="conversation-compose-box-input"]',
      '[aria-placeholder*="mensagem"][contenteditable="true"]',
      '[aria-placeholder*="message"][contenteditable="true"]',
      '[aria-label*="mensagem"][contenteditable="true"]',
      '[aria-label*="message"][contenteditable="true"]',
      'footer div[contenteditable="true"][role="textbox"]',
      'footer div[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-tab]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    return null;
  }

  async function waitForComposeBox(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const box = findComposeBox();
      if (box) return box;
      await new Promise(r => setTimeout(r, 700));
    }
    return null;
  }

  function findSendButton() {
    const direct = document.querySelector('[data-testid="send"], button[aria-label*="Enviar"], [aria-label*="Enviar"][role="button"], [data-icon="send"]');
    if (!direct) return null;
    return direct.closest('button,[role="button"]') || direct;
  }

  async function injectIntoOpenChat(text) {
    if (window.__copilotoInjectingText) return { ok: false, error: "Injecao ja em andamento." };
    window.__copilotoInjectingText = true;
    try {
    const box = await waitForComposeBox(30000);
    if (!box) {
      return {
        ok: false,
        error: "Campo de mensagem nao encontrado.",
        debug: {
          url: location.href,
          title: document.title,
          footerText: document.querySelector("footer")?.innerText || "",
          editableCount: document.querySelectorAll('[contenteditable="true"]').length
        }
      };
    }

    await new Promise(r => setTimeout(r, 300));
    // Limpa o campo antes de injetar
    box.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 200));
    document.execCommand('insertText', false, text);
    await new Promise(r => setTimeout(r, 500));

    // Envia a mensagem
    const sendBtn = findSendButton();
    if (sendBtn) sendBtn.click();
    await new Promise(r => setTimeout(r, 500));
    location.href = "https://web.whatsapp.com/";
    return { ok: true };
    } finally {
      setTimeout(() => { window.__copilotoInjectingText = false; }, 1000);
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "injectIntoOpenChat" || request.action === "injectText") {
      injectIntoOpenChat(request.text)
        .then(sendResponse);
      return true;
    }
  });

})();




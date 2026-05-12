(function () {
  const seen = new Set();
  let queueBusy = false;
  let captureScheduled = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function normalizeUsername(value) {
    const raw = String(value || "").trim();
    const fromHash = raw.match(/#@([a-zA-Z0-9_]{5,})/)?.[1];
    const fromLink = raw.match(/t\.me\/([a-zA-Z0-9_]{5,})/i)?.[1];
    return (fromHash || fromLink || raw).replace(/^@/, "").replace(/[^\w]/g, "");
  }

  function isSendableUsername(username) {
    const value = String(username || "");
    return /^peer_\d+$/.test(value) || /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value);
  }

  function telegramTargetHash(username) {
    const value = String(username || "");
    const peerMatch = value.match(/^peer_(\d+)$/);
    if (peerMatch) return "@peer_" + peerMatch[1]; // ← retorna "@peer_760967815"
    return "@" + encodeURIComponent(value);
  }

  async function clickTelegramRow(row) {
    row.scrollIntoView({ block: "center" });
    await sleep(300);
    const rect = row.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      row.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        clientX: x,
        clientY: y
      }));
      row.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      }));
    }
  }

  async function api(method, path, body) {
    const response = await chrome.runtime.sendMessage({
      action: "apiRequest",
      method,
      path,
      body
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "Falha ao chamar backend pelo background.");
    }
    return response.data;
  }

  function cleanLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function peerIdFromTarget(username) {
    const match = String(username || "").match(/^peer_(\d+)$/);
    return match ? match[1] : "";
  }

  async function openTelegramTarget(username, searchAlias) {
    const peerId = peerIdFromTarget(username);

    function getComposerPeer() {
      const composer = document.querySelector('.input-message-input[contenteditable="true"]:not(.input-field-input-fake)');
      return composer ? composer.getAttribute("data-peer-id") || "" : "";
    }

    async function waitForComposerPeer(expectedPeerId, attempts = 20) {
      for (let i = 0; i < attempts; i++) {
        await sleep(500);
        if (getComposerPeer() === expectedPeerId) return true;
      }
      return false;
    }

    async function tryClickPeerRow(row, expectedPeerId) {
      if (!row) return false;

      try {
        row.scrollIntoView({ block: "center", behavior: "instant" });
      } catch {
        row.scrollIntoView({ block: "center" });
      }

      await sleep(500);
      await clickTelegramRow(row);

      return waitForComposerPeer(expectedPeerId, 10);
    }

    // 1. Se o chat certo ja estiver aberto, usa direto.
    if (peerId && getComposerPeer() === peerId) return peerId;

    // 2. Tenta row visivel primeiro.
    if (peerId) {
      const rows = [...document.querySelectorAll(`[data-peer-id="${peerId}"]`)]
        .filter((el) => el.tagName === "A" && String(el.className || "").includes("row-clickable"));

      const visibleRow = rows.find(visible);
      if (await tryClickPeerRow(visibleRow, peerId)) return peerId;

      // 3. Se a row existir mas estiver invisivel/virtualizada, tenta clicar mesmo assim.
      const invisibleRow = rows.find((row) => !visible(row));
      if (await tryClickPeerRow(invisibleRow, peerId)) return peerId;
    }

    // Aguarda a lista lateral terminar de renderizar antes de cair na busca.
    if (peerId) {
      for (let i = 0; i < 2; i++) {
        await sleep(500);

        const lateRows = [...document.querySelectorAll(`[data-peer-id="${peerId}"]`)]
          .filter((el) => el.tagName === "A" && String(el.className || "").includes("row-clickable"));

        const lateVisibleRow = lateRows.find(visible);
        if (await tryClickPeerRow(lateVisibleRow, peerId)) return peerId;

        const lateInvisibleRow = lateRows.find((row) => !visible(row));
        if (await tryClickPeerRow(lateInvisibleRow, peerId)) return peerId;
      }
    }

    // 4. Fallback: usa campo de busca.
    const searchInput = document.querySelector('input.input-search-input');
    if (!searchInput) throw new Error("Campo de busca do Telegram não encontrado.");

    searchInput.focus();
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(300);

    const searchTerm = searchAlias || username;

    searchInput.value = searchTerm;
    searchInput.dispatchEvent(new InputEvent("input", { bubbles: true, data: searchTerm }));
    await sleep(2000);

    const target = String(searchTerm || "").toLowerCase();

    const row = [...document.querySelectorAll("a.row-clickable[data-peer-id]")]
      .find((el) => {
        const pid = el.getAttribute("data-peer-id") || "";
        if (pid.startsWith("-")) return false;

        const href = (el.getAttribute("href") || "").toLowerCase();
        const text = (el.innerText || "").toLowerCase();

        return href.includes(target) || text.includes(target);
      });

    if (!row) throw new Error(`Contato @${username} não encontrado na busca.`);

    await clickTelegramRow(row);

    const foundPeerId = row.getAttribute("data-peer-id") || "";
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const composerPeer = getComposerPeer();
      if (composerPeer) return foundPeerId || composerPeer;
    }

    throw new Error(`Chat não abriu para @${username}.`);
  }

  async function findComposer(expectedPeerId) {
    const selectors = [
      "[contenteditable=\"true\"][role=\"textbox\"]",
      ".input-message-input[contenteditable=\"true\"]",
      "[contenteditable=\"true\"]"
    ];
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const selector of selectors) {
        const candidates = Array.from(document.querySelectorAll(selector))
          .filter((el) => !String(el.className || "").includes("fake"))
          .filter((el) => !expectedPeerId || el.getAttribute("data-peer-id") === expectedPeerId);
        const footerBox = candidates.find((el) => el.closest(".bubbles, .chat-input, footer, .input-message-container"));
        if (footerBox) return footerBox;
        if (candidates[0]) return candidates[0];
      }
      await sleep(500);
    }
    return null;
  }

  async function insertText(text, expectedPeerId) {
    const box = await findComposer(expectedPeerId);
    if (!box) throw new Error("Campo de mensagem do Telegram não encontrado.");

    box.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    await sleep(150);
    document.execCommand("insertText", false, text);
    box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    await sleep(700);
    return box;
  }

  function clearComposer(box) {
    if (!box || !visible(box)) return;
    box.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }

  function findSendButton() {
    return Array.from(document.querySelectorAll('button.btn-send'))
      .find(el => !!(el.offsetWidth || el.offsetHeight)) || null;
  }

  async function injectTelegramMessage(text, expectedPeerId) {
    const box = await insertText(text, expectedPeerId);

    let sendButton = null;
    for (let i = 0; i < 8; i++) {
      await sleep(i === 0 ? 2000 : 800);
      sendButton = findSendButton();
      if (sendButton) break;
    }

    if (!sendButton) throw new Error("Botão enviar do Telegram não encontrado.");
    sendButton.click();
    await sleep(1600);
    const sent = Array.from(document.querySelectorAll(".bubble.is-out, .message.is-out, [class*=\"bubble\"][class*=\"is-out\"]"))
      .filter(visible)
      .slice(-8)
      .some((el) => cleanLines(el.innerText || "").join(" ").includes(text.slice(0, 40)));
    if (!sent) {
      console.warn("Bolha .is-out não detectada — mensagem pode ter sido enviada mesmo assim.");
    }
    clearComposer(box);
    const peerId = expectedPeerId || box.getAttribute("data-peer-id") || "";
    return { ok: true, peerId: peerId || undefined, peerUsername: peerId ? `peer_${peerId}` : undefined };
  }

  async function markTask(taskId, status, error, peerUsername) {
    await api("POST", `/api/inject-telegram/${taskId}/status`, { status, error, peerUsername });
  }

  async function processTelegramQueue() {
    if (queueBusy) return;
    queueBusy = true;
    let task = null;
    try {
      const pending = await api("GET", "/api/inject-telegram/pending");
      if (!pending.ok) return;
      task = pending;
      if (!isSendableUsername(task.username)) {
        await markTask(task.taskId, "failed", `Username Telegram inválido para envio: ${task.username}`);
        return;
      }
      await markTask(task.taskId, "sending");
      const expectedPeerId = await openTelegramTarget(task.username, task.searchAlias || "");
      const sentResult = await injectTelegramMessage(task.text || "", expectedPeerId);
      await markTask(task.taskId, "sent", undefined, sentResult.peerUsername);
    } catch (err) {
      if (task && task.taskId) {
        try {
          await markTask(task.taskId, "failed", err instanceof Error ? err.message : String(err));
        } catch (_) {}
      }
    } finally {
      queueBusy = false;
    }
  }

  function looksLikeNoise(text) {
    const value = String(text || "").trim();
    if (!value) return true;
    if (value.length < 3) return true;
    if (/^\d{1,2}:\d{2}$/.test(value)) return true;
    if (/^(online|typing|visto|seen|hoje|ontem|today|yesterday)$/i.test(value)) return true;
    if (/^last seen/i.test(value)) return true;
    if (/^draft:/i.test(value)) return true;
    if (/^(forwarded|encaminhado)/i.test(value)) return true;
    if (/^(photo|video|audio|document|sticker|gif|voice|foto|vídeo|áudio|documento)/i.test(value)) return true;
    if (/^(@)?[a-zA-Z0-9_]{5,}$/.test(value) && value.length < 32) return true;
    return false;
  }

  function isTelegramSystemItem(name, username, message) {
    const haystack = [name, username, message].join(" ").toLowerCase();
    return (
      /\btelegram\b/.test(haystack) ||
      /verifiediconcheck/.test(haystack) ||
      /c[oó]digo de login/.test(haystack) ||
      /login code/.test(haystack) ||
      /n[aã]o envie esse c[oó]digo/.test(haystack) ||
      /do not give this code/.test(haystack) ||
      /last seen/i.test(message) ||
      /^unknown$/i.test(message) ||
      /^draft:/i.test(message) ||
      /^\d{1,2}:\d{2}$/.test(message)
    );
}

  function getUsernameFromRow(row) {
    const links = Array.from(row.querySelectorAll("a[href], [href]"));
    for (const link of links) {
      const username = normalizeUsername(link.getAttribute("href") || "");
      if (username) return username;
    }
    const rowText = row.innerText || "";
    const inline = rowText.match(/@([a-zA-Z0-9_]{5,})/);
    if (inline) return inline[1];
    const peerId = row.getAttribute("data-peer-id") || "";
    if (peerId && !peerId.startsWith("-")) return `peer_${peerId}`;
    return "";
  }

  function extractChatListMessage(row, lines) {
    const title = row.querySelector(".peer-title")?.textContent?.trim() || "";
    const first = lines[0] || "";
    const second = lines[1] || "";
    const third = lines[2] || "";
    if (/^\d+$/.test(second) && third === title && first && !looksLikeNoise(first)) {
      return first;
    }
    return lines
      .filter((line) => line !== title)
      .find((line) => !looksLikeNoise(line) && !/^\d+$/.test(line)) || "";
  }

  function getActiveChatIdentity() {
    const active =
      document.querySelector(".chatlist-chat.active") ||
      document.querySelector(".row.active[data-peer-id]") ||
      document.querySelector("[data-peer-id].active");
    const peerId = active ? active.getAttribute("data-peer-id") : "";
    const titleEl =
      active?.querySelector(".peer-title") ||
      document.querySelector(".chat-info .peer-title") ||
      document.querySelector(".topbar .peer-title") ||
      document.querySelector("header .peer-title");
    const name = titleEl ? titleEl.textContent.trim() : "";
    const username = peerId && !peerId.startsWith("-")
      ? `peer_${peerId}`
      : normalizeUsername(name);
    return { name, username, peerId };
  }

  function captureOpenChatMessage() {
    const identity = getActiveChatIdentity();
    if (!identity.username) return null;
    if (String(identity.peerId || "").startsWith("-")) return null;

    const incoming = Array.from(document.querySelectorAll(".bubble.is-in, .message.is-in, [class*=\"bubble\"][class*=\"is-in\"]"))
      .filter(visible);
    if (!incoming.length) return null;

    const lastBubble = incoming[incoming.length - 1];
    const lines = cleanLines(lastBubble.innerText || "");
    const message = lines.find((line) => !looksLikeNoise(line));
    if (!message) return null;
    if (isTelegramSystemItem(identity.name, identity.username, message)) return null;

    return {
      contactUsername: identity.username,
      contactName: identity.name || identity.username,
      lastMessage: message,
      receivedAt: new Date().toISOString()
    };
  }

  function captureTelegramVisible() {
    const rows = Array.from(document.querySelectorAll(
      ".chatlist-chat[data-peer-id], .row[data-peer-id], a[data-peer-id]"
    )).filter(visible);

    const items = [];
    for (const row of rows.slice(0, 80)) {
      const peerId = row.getAttribute("data-peer-id") || "";
      if (peerId.startsWith("-")) continue;
      const rowText = row.innerText || "";
      const lines = cleanLines(rowText);
      const unread = /\b\d+\s*(mensagens?\s+)?(não lida|não lidas|unread)\b/i.test(rowText) ||
        !!row.querySelector(".unread, [class*=\"unread\"], .badge, [class*=\"badge\"]");
      const username = getUsernameFromRow(row);
      if (!unread || !username) continue;

      const message = extractChatListMessage(row, lines);
      if (!message) continue;

      const name = row.querySelector(".peer-title")?.textContent?.trim() ||
        lines.find((line) => !looksLikeNoise(line) && !line.includes(message) && !/^\d+$/.test(line)) ||
        username;
      if (isTelegramSystemItem(name, username, message)) continue;
      items.push({
        contactUsername: username,
        contactName: name,
        lastMessage: message,
        receivedAt: new Date().toISOString()
      });
    }
    const openChat = captureOpenChatMessage();
    if (openChat) items.unshift(openChat);
    return { ok: true, items };
  }

  async function importVisibleReplies() {
    if (queueBusy) return;
    try {
      const result = captureTelegramVisible();
      if ((result.items || []).length) {
        const imported = await chrome.runtime.sendMessage({
          action: "importTelegramItems",
          items: result.items
        });
        console.log("[Copiloto Telegram] captura enviada ao painel", result.items, imported);
      } else {
        console.log("[Copiloto Telegram] captura sem itens importaveis");
      }
    } catch (err) {
      console.warn("[Copiloto Telegram] falha na captura", err);
    }
  }

  function scheduleImportVisibleReplies() {
    if (captureScheduled) return;
    captureScheduled = true;
    setTimeout(async () => {
      captureScheduled = false;
      await importVisibleReplies();
    }, 600);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (message.action === "injectTelegramMessage") {
          const peerId = (message.username || "").match(/^peer_(\d+)$/)?.[1] || "";
          sendResponse(await injectTelegramMessage(message.text || "", peerId || ""));
          return;
        }
        if (message.action === "processTelegramTask") {
          const expectedPeerId = await openTelegramTarget(message.username || "", message.searchAlias || "");
          sendResponse(await injectTelegramMessage(message.text || "", expectedPeerId));
          return;
        }
        if (message.action === "captureTelegramVisible") {
          sendResponse(captureTelegramVisible());
          return;
        }
        if (message.action === "clickTelegramRow") {
        const peerId = (message.username || "").match(/^peer_(\d+)$/)?.[1] || "";
        const row = peerId ? document.querySelector(`[data-peer-id="${peerId}"]`) : null;
        if (row) {
          row.scrollIntoView({ block: "center" });
          const rect = row.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            row.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
            row.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          }
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Row não encontrada." });
        }
        return;
      }
        sendResponse({ ok: false, error: "Ação desconhecida." });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });

  setTimeout(importVisibleReplies, 1500);
  new MutationObserver(scheduleImportVisibleReplies).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

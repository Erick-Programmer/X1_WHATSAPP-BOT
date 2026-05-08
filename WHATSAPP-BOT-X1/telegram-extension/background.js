const API_BASE = "http://127.0.0.1:8787";
const TELEGRAM_URL = "https://web.telegram.org/k/";

let busy = false;
let lastStatus = {
  running: true,
  busy: false,
  lastTask: null,
  lastError: null,
  lastCapture: null
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function api(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function getTelegramTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.telegram.org/*" });
  if (tabs.length > 0) return tabs[0];
  throw new Error("Abra o Telegram Web em web.telegram.org/k/ antes de capturar.");
}

async function waitForTelegramTab(tabId) {
  for (let i = 0; i < 30; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(500);
  }
}

async function sendToContent(tabId, message) {
  for (let i = 0; i < 18; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      await sleep(700);
    }
  }
  throw new Error("Content script do Telegram não respondeu. Recarregue o Telegram Web e tente novamente.");
}

async function updateTask(taskId, status, error, peerUsername) {
  await api("POST", `/api/inject-telegram/${taskId}/status`, { status, error, peerUsername });
}

async function processNextTask() {
  if (busy || !lastStatus.running) return;
  busy = true;
  lastStatus.busy = true;
  try {
    const pending = await api("GET", "/api/inject-telegram/pending");
    if (!pending.ok) return;

    lastStatus.lastTask = pending;
    lastStatus.lastError = null;
    if (!isSendableUsername(pending.username)) {
      throw new Error(`Username Telegram inválido para envio: ${pending.username}`);
    }
    await updateTask(pending.taskId, "sending");

    const tab = await getTelegramTab();
    const targetUrl = `${TELEGRAM_URL}#${telegramTargetHash(pending.username)}`;
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    await waitForTelegramTab(tab.id);
    await sleep(2000);

    await sendToContent(tab.id, {
      action: "clickTelegramRow",
      username: pending.username
    });
    await sleep(3000);

    const result = await sendToContent(tab.id, {
      action: "injectTelegramMessage",
      username: pending.username,
      text: pending.text
    });

    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Falha ao enviar no Telegram Web.");
    }

    await updateTask(pending.taskId, "sent", undefined, result.peerUsername);
    lastStatus.lastTask = { ...pending, status: "sent" };
    const dashboardTabs = await chrome.tabs.query({ url: "http://127.0.0.1:8787/*" });
    if (dashboardTabs.length > 0) {
      await chrome.tabs.update(dashboardTabs[0].id, { active: true });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lastStatus.lastError = error;
    if (lastStatus.lastTask && lastStatus.lastTask.taskId) {
      try { await updateTask(lastStatus.lastTask.taskId, "failed", error); } catch (_) {}
    }
  } finally {
    busy = false;
    lastStatus.busy = false;
  }
}

async function captureVisibleReplies() {
  if (busy || !lastStatus.running) return;
  try {
    const tab = await getTelegramTab();
    const result = await sendToContent(tab.id, { action: "captureTelegramVisible" });
    const items = result && Array.isArray(result.items) ? result.items : [];
    let imported = 0;
    for (const item of items) {
      try {
        await api("POST", "/api/inbox/import", {
          channel: "telegram",
          source: "telegram_web_extension",
          contactName: item.contactName || item.contactUsername || "",
          contactUsername: item.contactUsername || "",
          lastMessage: item.lastMessage || "",
          receivedAt: item.receivedAt || new Date().toISOString()
        });
        imported++;
      } catch (_) {}
    }
    lastStatus.lastCapture = { imported, checked: items.length, at: new Date().toISOString() };
  } catch (err) {
    lastStatus.lastCapture = { imported: 0, checked: 0, error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() };
  }
}

async function importTelegramItems(items) {
  let imported = 0;
  let skipped = 0;
  let checked = Array.isArray(items) ? items.length : 0;
  const results = [];
  for (const item of items || []) {
    try {
      const result = await api("POST", "/api/inbox/import", {
        channel: "telegram",
        source: "telegram_web_extension",
        contactName: item.contactName || item.contactUsername || "",
        contactUsername: item.contactUsername || "",
        lastMessage: item.lastMessage || "",
        receivedAt: item.receivedAt || new Date().toISOString()
      });
      if (result.skipped) {
        skipped++;
      } else {
        imported++;
      }
      results.push({
        name: item.contactName || item.contactUsername || "",
        message: item.lastMessage || "",
        skipped: result.skipped === true,
        reason: result.reason || "",
        reviewId: result.reviewId || ""
      });
    } catch (err) {
      console.warn("[Copiloto Telegram] falha ao importar item", item, err);
      results.push({
        name: item.contactName || item.contactUsername || "",
        message: item.lastMessage || "",
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  lastStatus.lastCapture = { imported, skipped, checked, results, at: new Date().toISOString() };
  return lastStatus.lastCapture;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === "status") {
        sendResponse({ ok: true, status: lastStatus });
        return;
      }
      if (message.action === "toggleRunning") {
        lastStatus.running = message.running === true;
        sendResponse({ ok: true, status: lastStatus });
        return;
      }
      if (message.action === "captureNow") {
        await captureVisibleReplies();
        sendResponse({ ok: true, status: lastStatus });
        return;
      }
      if (message.action === "importTelegramItems") {
        const capture = await importTelegramItems(message.items || []);
        sendResponse({ ok: true, capture });
        return;
      }
      if (message.action === "apiRequest") {
        const data = await api(message.method || "GET", message.path || "/", message.body);
        sendResponse({ ok: true, data });
        return;
      }
      sendResponse({ ok: false, error: "Ação desconhecida." });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      lastStatus.lastError = error;
      sendResponse({ ok: false, error });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("telegram-capture", { periodInMinutes: 0.2 });
  chrome.alarms.create("telegram-queue", { periodInMinutes: 0.1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("telegram-capture", { periodInMinutes: 0.2 });
  chrome.alarms.create("telegram-queue", { periodInMinutes: 0.1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "telegram-capture") {
    captureVisibleReplies();
  }
  if (alarm.name === "telegram-queue") {
    processNextTask();
  }
});

chrome.alarms.create("telegram-capture", { periodInMinutes: 0.2 });
chrome.alarms.create("telegram-queue", { periodInMinutes: 0.1 });

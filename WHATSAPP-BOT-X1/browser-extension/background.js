// background.js - proxy de fetch + fila segura de injecao
let isInjecting = false;
const CURRENT_TASK_KEY = "copilotoCurrentInjectionTask";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key] || null));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function storageRemove(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], resolve);
  });
}

function updateInjectionStatus(taskId, status, error) {
  if (!taskId) return Promise.resolve();
  return fetch(`http://127.0.0.1:8787/api/inject-whatsapp/${taskId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error }),
  }).catch(() => {});
}

function getWhatsAppTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(true);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "Sem resposta do content script." });
    });
  });
}

async function sendMessageToTabWithRetry(tabId, message, attempts = 25) {
  let last = { ok: false, error: "Content script indisponivel." };
  for (let i = 0; i < attempts; i++) {
    last = await sendMessageToTab(tabId, message);
    if (last && last.ok) return last;
    const error = String((last && last.error) || "");
    if (!error.includes("Receiving end does not exist") && !error.includes("Could not establish connection")) {
      return last;
    }
    await sleep(1000);
  }
  return last;
}

async function injectToWhatsApp(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return { ok: false, error: "Telefone invalido para envio." };

  const tab = await getWhatsAppTab();
  if (!tab || !tab.id) return { ok: false, error: "WhatsApp Web nao aberto" };

  const targetUrl = `https://web.whatsapp.com/send?phone=${encodeURIComponent(digits)}`;
  const currentUrl = tab.url || "";

  if (!currentUrl.includes(`/send?phone=${digits}`)) {
    chrome.tabs.update(tab.id, { url: targetUrl });
    await waitForTabComplete(tab.id);
    await sleep(5500);
  } else {
    await sleep(1500);
  }

  return sendMessageToTabWithRetry(tab.id, {
    action: "injectIntoOpenChat",
    text,
  });
}

async function processInjectionTask(task) {
  if (!task || !task.taskId || !task.phone || !task.text) return;
  if (isInjecting) return;

  isInjecting = true;
  await storageSet(CURRENT_TASK_KEY, task);

  try {
    await updateInjectionStatus(task.taskId, "sending");
    const response = await injectToWhatsApp(task.phone, task.text);

    if (response && response.ok) {
      await updateInjectionStatus(task.taskId, "sent");
      await storageRemove(CURRENT_TASK_KEY);
    } else {
      await updateInjectionStatus(task.taskId, "failed", (response && response.error) || "Falha na injecao");
      await storageRemove(CURRENT_TASK_KEY);
    }
  } finally {
    isInjecting = false;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchProxy") {
    fetch(request.url, {
      method: request.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: request.body ? JSON.stringify(request.body) : undefined,
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === "injectToWhatsApp") {
    injectToWhatsApp(request.phone, request.text).then(sendResponse);
    return true;
  }
});

chrome.alarms.create('inject-poll', { periodInMinutes: 0.1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'inject-poll') return;
  if (isInjecting) return;

  const savedTask = await storageGet(CURRENT_TASK_KEY);
  if (savedTask) {
    processInjectionTask(savedTask);
    return;
  }

  fetch("http://127.0.0.1:8787/api/inject-whatsapp/pending")
    .then(r => r.json())
    .then((data) => {
      if (!data.ok || !data.phone) return;
      processInjectionTask({
        taskId: data.taskId,
        phone: data.phone,
        text: data.text,
        source: data.source,
      });
    })
    .catch(() => { isInjecting = false; });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('inject-poll', { periodInMinutes: 0.1 });
});

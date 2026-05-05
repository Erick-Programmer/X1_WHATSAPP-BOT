// background.js - proxy de fetch + polling de injecao
let isInjecting = false;

function updateInjectionStatus(taskId, status, error) {
  if (!taskId) return Promise.resolve();
  return fetch(`http://127.0.0.1:8787/api/inject-whatsapp/${taskId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error }),
  }).catch(() => {});
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
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      if (!tabs.length) { sendResponse({ ok: false, error: "WhatsApp Web nao aberto" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "injectText",
        phone: request.phone,
        text: request.text,
      }, sendResponse);
    });
    return true;
  }
});

// Polling de injecao: pega uma tarefa por vez e aguarda confirmacao do content.js.
setInterval(() => {
  if (isInjecting) return;

  fetch("http://127.0.0.1:8787/api/inject-whatsapp/pending")
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.phone) return;
      isInjecting = true;

      chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if (!tabs.length) {
          updateInjectionStatus(data.taskId, "failed", "WhatsApp Web nao aberto").finally(() => {
            isInjecting = false;
          });
          return;
        }

        updateInjectionStatus(data.taskId, "sending");
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "injectText",
          phone: data.phone,
          text: data.text,
          taskId: data.taskId,
        }, (response) => {
          if (chrome.runtime.lastError) {
            updateInjectionStatus(data.taskId, "failed", chrome.runtime.lastError.message).finally(() => {
              isInjecting = false;
            });
            return;
          }

          if (response && response.ok) {
            updateInjectionStatus(data.taskId, "sent").finally(() => {
              isInjecting = false;
            });
          } else {
            updateInjectionStatus(data.taskId, "failed", (response && response.error) || "Falha na injecao").finally(() => {
              isInjecting = false;
            });
          }
        });
      });
    })
    .catch(() => {
      isInjecting = false;
    });
}, 3000);

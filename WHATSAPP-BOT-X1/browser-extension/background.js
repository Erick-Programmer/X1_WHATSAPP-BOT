// background.js — proxy de fetch + polling de injeção
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
      if (!tabs.length) { sendResponse({ ok: false, error: "WhatsApp Web não aberto" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "injectText",
        phone: request.phone,
        text: request.text,
      }, sendResponse);
    });
    return true;
  }
});

// Polling de injeção — background faz o fetch e manda para o content.js
setInterval(() => {
  fetch("http://127.0.0.1:8787/api/inject-whatsapp/pending")
    .then(r => r.json())
    .then(data => {
      if (!data.ok || !data.phone) return;
      chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if (!tabs.length) return;
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "injectText",
          phone: data.phone,
          text: data.text,
        });
      });
    })
    .catch(() => {});
}, 3000);
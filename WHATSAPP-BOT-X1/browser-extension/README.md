# Copiloto WhatsApp — Extensão para Chrome/Edge

Extensão de navegador que **apenas lê** dados da conversa aberta no WhatsApp Web e envia para o painel Copiloto local.

> ⚠️ **Atenção:** Esta extensão **NÃO envia mensagens**, **NÃO clica em botões**, **NÃO preenche campos**. Ela funciona exclusivamente como uma ponte de **leitura** entre o WhatsApp Web e o painel local.

---

## 📋 Pré-requisitos

1. **Node.js** instalado
2. **Painel Copiloto** rodando localmente na porta `8787`
3. **Chrome** ou **Edge** atualizado

---

## 🚀 Como usar

### 1. Compilar e iniciar o painel

No diretório raiz do projeto (`WHATSAPP-BOT-X1/`):

```bash
npm run build
node dist/dev/copilotPanel/server.js
```

O painel iniciará em `http://127.0.0.1:8787`.

### 2. Instalar a extensão no navegador

**Chrome:**
1. Abra `chrome://extensions/`
2. Ative **"Modo do desenvolvedor"** (canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `browser-extension/` deste projeto

**Edge:**
1. Abra `edge://extensions/`
2. Ative **"Modo do desenvolvedor"**
3. Clique em **"Carregar extensão"**
4. Selecione a pasta `browser-extension/` deste projeto

### 3. Usar

1. Abra o **WhatsApp Web** (`https://web.whatsapp.com`) e faça login
2. **Clique em uma conversa** para abri-la
3. Clique no ícone da extensão (🟢 "Copiloto WhatsApp") na barra de ferramentas
4. Clique em **"📥 Capturar conversa aberta"**
5. Aguarde o resultado:
   - ✅ **Sucesso:** os dados foram enviados ao painel
   - ❌ **Erro:** siga as instruções na mensagem

---

## 📦 Estrutura dos arquivos

```
browser-extension/
├── manifest.json      # Manifest V3 — configurações da extensão
├── popup.html         # Interface do popup (HTML + CSS)
├── popup.js           # Lógica do popup (comunicação + POST)
├── content.js         # Content script (leitura do DOM do WhatsApp Web)
└── README.md          # Este arquivo
```

---

## 🔄 Fluxo de funcionamento

```
Usuário clica no botão "Capturar"
        │
        ▼
popup.js → envia mensagem para content.js
        │
        ▼
content.js → lê o DOM do WhatsApp Web
        │
        ├── Nome do contato (header)
        ├── Telefone (se visível — best-effort)
        ├── Última mensagem recebida
        └── Horário aproximado
        │
        ▼
popup.js → recebe os dados → POST http://127.0.0.1:8787/api/inbox/import
        │
        ▼
Painel → cria atendimento na fila de revisão
```

---

## 🛡️ Regras de segurança

| Regra | Status |
|-------|--------|
| ❌ Não enviar mensagem pelo WhatsApp | ✅ Content.js **só lê** o DOM |
| ❌ Não clicar no botão enviar | ✅ Nenhum `click()` no código |
| ❌ Não preencher campo de mensagem | ✅ Nenhuma escrita no DOM |
| ❌ Não acessar internet externa | ✅ Só `fetch` para `127.0.0.1:8787` |
| ✅ Só coletar o necessário | ✅ Nome, telefone (se visível), última mensagem, horário |
| ✅ Não armazenar dados | ✅ Sem `localStorage` ou `chrome.storage` |
| ✅ Não instalar dependências | ✅ JS puro, sem npm |

---

## ⚠️ Limitações conhecidas

- **DOM do WhatsApp Web muda com frequência** — os seletores podem quebrar a qualquer momento. Esta é uma versão MVP (best-effort).
- **Telefone** raramente fica visível sem abrir manualmente o painel de contato. Quando não encontrado, é enviado como vazio.
- **Mensagens de mídia** (imagem, áudio, vídeo) podem não ter texto capturável.
- **Apenas conversa aberta** — não lê listas de conversas ou mensagens em massa.

---

## 🐛 Solução de problemas

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| "Nenhuma aba do WhatsApp Web encontrada" | WhatsApp Web não está aberto | Abra `https://web.whatsapp.com` |
| "Sem resposta do WhatsApp Web" | Página carregando ou content script não injetado | Recarregue a página (F5) |
| "Não foi possível conectar ao painel local" | Painel não está rodando | Execute `node dist/dev/copilotPanel/server.js` |
| "Não foi possível capturar a última mensagem" | Conversa sem mensagens visíveis | Abra uma conversa com mensagens |
| Erro 400: "lastMessage é obrigatório" | Mensagem vazia | Certifique-se de capturar uma conversa com texto |

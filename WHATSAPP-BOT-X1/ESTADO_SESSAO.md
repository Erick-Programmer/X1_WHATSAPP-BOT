# ESTADO DA SESSÃO — X1_WHATSAPP BOT

## Status atual
Sistema funcional em produção local. Servidor: `node dist/dev/copilotPanel/server.js`. Dashboard: `http://127.0.0.1:8787`. Extensão Edge carregada em `browser-extension/`.

## O que está funcionando
- Auto-import: extensão varre lista lateral do WhatsApp Web a cada 5s e importa conversas automaticamente
- Injeção: botão "📲 Injetar no WhatsApp" no dashboard abre a conversa, injeta o texto e envia automaticamente
- Status: ao injetar, o review muda de `pending_review` para `sent` automaticamente
- Mensagens enviadas aparecem em verde no chat do dashboard (via `chosenSuggestionId`), lado direito
- Delete em lote: checkboxes na lista lateral + botão "🗑️ Deletar selecionados"
- Checkboxes preservados no refresh do polling
- Scroll do chat sempre vai para o final absoluto (última mensagem visível)

## Arquivos principais modificados
- `browser-extension/content.js` — auto-import, injeção, background proxy
- `browser-extension/background.js` — proxy fetch (contorna CSP do WhatsApp)
- `browser-extension/manifest.json` — adicionado `background.service_worker`
- `src/dev/copilotPanel/server.ts` — rotas inject-whatsapp, pending, delete, manual-sent
- `src/dev/copilotPanel/public/index.html` — dashboard completo

## Fixes aplicados nesta sessão

### Bug 1 — Mensagem do vendedor reimportada como cliente (lado esquerdo)
**Arquivo:** `browser-extension/content.js`
**Fix:** Se a prévia da conversa começa com `"Você:"`, pula — não importa.
```js
if (/^Você:/i.test(lastMessage)) continue;
```

### Bug 2 — Status não virava `sent` após injetar (polling reimportava antes)
**Arquivo:** `src/dev/copilotPanel/public/index.html` — função `injectWhatsApp`
**Fix:** Aguarda 4s antes de chamar `loadReviews()` após injetar.
```js
await new Promise(r => setTimeout(r, 4000));
await loadReviews();
```

### Bug 3 — Reviews antigos do mesmo contato ficavam `pending_review` após envio
**Arquivo:** `src/dev/copilotPanel/server.ts` — rota `manual-sent`
**Fix:** Após marcar o review como `sent`, cancela todos os outros `pending_review` do mesmo contato.

### Bug 4 — Mensagem enviada pelo vendedor criava novo `pending_review` no dashboard
**Arquivo:** `src/dev/copilotPanel/server.ts` — rota `POST /api/inbox/import`
**Fix:** Checa se o contato tem um `sent` nos últimos 30s. Se sim, retorna `skipped: recent_sent`.
```ts
const hasRecentSent = (existingItems as any[]).some(
  (i) => i.contactId === contactId && i.status === "sent" &&
  (Date.now() - new Date(i.updatedAt || 0).getTime()) < 30000
);
```

### Bug 5 — Scroll do chat focava no contexto recente, não na última mensagem
**Arquivo:** `src/dev/copilotPanel/public/index.html` — função `scrollChatToBottom`
**Fix:** Removido `scrollIntoView` no `.last-message`. Usa apenas `scrollTop = scrollHeight`.

### Melhoria — Altura do chat
**Arquivo:** `src/dev/copilotPanel/public/index.html` — CSS `.chat-messages`
**Fix:** `max-height: 45vh` → `65vh`. `force-scroll` de `height: 120px` → `min-height: 120px`.

## Próximo foco
1. **[TESTE]** npm run build + testar simulação como cliente no painel
2. **[CONFIG]** Preencher `.env` com preço + link Cakto
3. **[ETAPA 2]** Integrar DeepSeek: passar `productKnowledge` + últimas 3 mensagens do cliente para gerar sugestões dinâmicas
2. **[GO LIVE]** Integração WhatsApp Business API real

## ESTADO DOS ARQUIVOS CRÍTICOS

| Arquivo | Status |
|---------|--------|
| `dist/dev/copilotPanel/server.js` | ⚠️ Precisa rebuild após fixes no server.ts |
| `src/dev/copilotPanel/public/index.html` | ✅ Atualizado |
| `browser-extension/content.js` | ✅ Atualizado |
| `src/dev/copilotPanel/server.ts` | ✅ Atualizado |
| `assets/produto-planners.png` | ❓ A verificar |
| `assets/ebooks-bonus.png` | ❓ A verificar |
| `.env` (credenciais reais) | ❌ Não configurado (aguarda aprovação) |
| `src/config/product.ts`          | ✅ Atualizado com produto real |
| `src/services/replySuggestions.ts` | ✅ Revisado e humanizado       |
| `src/services/deepseekSuggestions.ts` | ✅ Criado — integração DeepSeek |
| `.env`                                | ✅ Criado com DEEPSEEK_API_KEY  |

## COMO RODAR AGORA

```powershell
# Na pasta WHATSAPP-BOT-X1:
npm run build
node dist/dev/copilotPanel/server.js
# Abre http://127.0.0.1:8787 no Edge
```

**Instalar extensão Edge:**
1. `edge://extensions/` → Modo desenvolvedor ON
2. "Carregar extensão" → selecionar pasta `browser-extension/`

---

## VISÃO GERAL DO PROJETO

Sistema semi-automático de vendas por WhatsApp.  
Produto sendo vendido: **Planner Estudante Pro** — 10 planners + 3 ebooks bônus (arquivos em `X1 - PLANO 2`).

**Arquitetura:**
- Bot TypeScript (`src/`) — classifica intenções, gera sugestões de resposta, fluxos de venda
- Painel Copiloto local (`src/dev/copilotPanel/`) — servidor HTTP na porta 8787, dashboard para o vendedor revisar e enviar respostas
- Extensão Edge/Chrome (`browser-extension/`) — captura conversa aberta no WhatsApp Web e envia ao painel (SÓ LEITURA)
- **Modo de operação:** semi-manual — o humano aprova e envia cada mensagem pelo painel

---

## TASKS CONCLUÍDAS ✅

- [x] Estrutura base do bot (flows, services, types, config)
- [x] Classificador de intenções (`intentClassifier.ts`)
- [x] Gerador de sugestões (`replySuggestions.ts`)
- [x] Fila de revisão humana (`reviewQueue.ts`)
- [x] Scripts de simulação
- [x] Painel Copiloto — servidor HTTP completo (`copilotPanel/server.ts`)
- [x] Extensão browser (Manifest V3, Edge/Chrome)
- [x] Build compilado em `dist/`
- [x] Services: `commercialSettings`, `whatsappCredentials`, `leadStore`, `botRuntimeState`
- [x] `.clinerules` definido
- [x] `data/leads.json` criado — importação de leads funcionando
- [x] Polling de leads na extensão (`scanAndHighlight` a cada 5s)
- [x] Toggle Liga/Desliga leads no popup (`btnPolling`)
- [x] Auto-import de conversas via extensão
- [x] Injeção de mensagem via dashboard → WhatsApp Web
- [x] Bolha verde para mensagens enviadas (lado direito)
- [x] Fix: mensagem do vendedor não cria pending_review
- [x] Fix: reviews antigos cancelados ao enviar
- [x] Fix: scroll sempre vai para o final do chat
- [x] Fix: delay de 4s após injetar antes de recarregar reviews
- [x] `product.ts` atualizado com nomes reais dos 10 planners, ebooks e frases humanas
- [x] `replySuggestions.ts` revisado e humanizado (sem travessão, sem "super entendo", sem autoelogio)
- [x] Etapa 2: `deepseekSuggestions.ts` criado — integração DeepSeek com histórico das últimas 3 mensagens
- [x] `replySuggestions.ts` convertido para async com fallback estático
- [x] `server.ts` atualizado nos 3 pontos de chamada (inbox/import, mock-message, regenerate)
- [x] `.env` criado com `DEEPSEEK_API_KEY`

---

**Atualizado em:** 2026-05-04  
**QA:** Claude Sonnet 4.6
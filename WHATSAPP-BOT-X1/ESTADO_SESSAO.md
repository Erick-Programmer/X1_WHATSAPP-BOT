# ESTADO DA SESSÃO — X1_WHATSAPP BOT

## Status atual
Sistema funcional em produção local. Servidor: `node dist/dev/copilotPanel/server.js`. Dashboard: `http://127.0.0.1:8787`. Extensão Edge carregada em `browser-extension/`.

## Atualização desta rodada — 2026-05-05

### Avanços principais concluídos
- Mídias do produto atualizadas: `assets/produto-completo-preview.gif` registrado como mídia opcional em `src/templates/media.json`.
- Lembretes do painel ajustados para orientar uso de `assets/produto-planners.png` ou `assets/produto-completo-preview.gif` quando fizer sentido.
- Configuração de ambiente melhorada com `src/config/env.ts`, carregando `.env` local sem depender de `dotenv`.
- `.env.example` atualizado com variáveis úteis: `COPILOT_PANEL_PORT`, `SIMULATION_FAST` e `DEEPSEEK_API_KEY`.
- Checkout normal e checkout de recuperação separados no `commercialSettings`.
- Painel Comercial passou a aceitar link normal e link de recuperação, com validação e aprovação separadas.
- Sugestões de recuperação adicionadas: botão para gerar mensagens com oferta de recuperação, usando preço/link aprovado.
- Score de sugestões implementado com `suggestionScorer`: o painel destaca a sugestão mais promissora com base em histórico e respostas aprovadas.
- Campanha inicial criada no painel: importa lista de leads, prepara fila, envia mensagem inicial com delay controlado e mostra progresso.
- Botões para limpar leads e limpar fila de campanha adicionados no painel.
- Controle de pendências por cliente evoluído: responder/focar pendência específica, resolver sem responder e manter contexto de múltiplas mensagens.
- Fluxo manual adicionado: quando não há pendência, o painel pode gerar follow-up por etapa comercial.
- DeepSeek integrado ao fluxo manual com histórico da conversa + etapa escolhida, gerando 3 respostas contextuais.
- Fila real de injeção criada com status `queued`, `claimed`, `sending`, `sent`, `failed`.
- Extensão ganhou trava/lock de envio: só pega uma tarefa por vez e confirma status para o backend.
- Auto-import da extensão pausa durante injeção para evitar capturar mensagem enviada como se fosse resposta do cliente.
- Painel agora mostra a fila real de envio e permite limpar tarefas finalizadas.
- Banner de checkout criado e refinado em `assets/checkout-banner-planner-estudante-pro-v4.png`.
- Mensagem inicial de abordagem definida para testes manuais/campanha, sem emoji e sem apresentar o produto antes da permissão.

### Estado operacional atual
- Dashboard local continua em `http://127.0.0.1:8787`.
- Servidor recomendado: `npm run build` e depois `node dist/dev/copilotPanel/server.js`.
- Extensão precisa ser recarregada no Chrome/Edge quando `browser-extension/background.js` ou `browser-extension/content.js` forem alterados.
- Fluxo recomendado para campanha: preparar lote, iniciar envio com delay, aguardar fila terminar, depois trabalhar respostas pelo painel.
- Para WhatsApp real via API oficial, ainda fica como etapa futura; hoje o fluxo prático é WhatsApp Web + extensão + painel.

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
1. **[EXTENSÃO / ROBUSTEZ]** Testar fila real com lote maior e confirmar que nenhum envio fica preso em `queued`, `claimed` ou `sending`.
2. **[CAMPANHA]** Rodar lote diário pequeno primeiro, validar taxa de resposta e ajustar mensagem inicial antes de escalar para 50 números/dia.
3. **[APRENDIZADO]** Continuar aprovando/editando respostas para alimentar `approved-responses.json` e melhorar o estilo do DeepSeek.
4. **[RECUPERAÇÃO]** Testar recuperação de R$ 17 em conversas reais quando houver objeção de preço.
5. **[CHECKOUT]** Usar o banner final `assets/checkout-banner-planner-estudante-pro-v4.png` nos checkouts normal e recuperação.
6. **[QUALIDADE]** Revisar métricas e conversões após os primeiros testes reais.
7. **[FUTURO]** WhatsApp Business API oficial fica para etapa futura; manter fluxo prático atual (WhatsApp Web + extensão + painel local).

## ESTADO DOS ARQUIVOS CRÍTICOS

| Arquivo | Status |
|---------|--------|
| `dist/dev/copilotPanel/server.js` | ⚠️ Precisa rebuild após fixes no server.ts |
| `src/dev/copilotPanel/public/index.html` | ✅ Atualizado |
| `browser-extension/content.js` | ✅ Atualizado |
| `src/dev/copilotPanel/server.ts` | ✅ Atualizado |
| `assets/produto-planners.png` | ❓ A verificar |
| `assets/ebooks-bonus.png` | ❓ A verificar |
| `assets/produto-completo-preview.gif` | ✅ Criado/registrado |
| `assets/checkout-banner-planner-estudante-pro-v4.png` | ✅ Criado |
| `src/config/env.ts` | ✅ Criado |
| `.env.example` | ✅ Atualizado |
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
- [x] DeepSeek integrado e funcionando com link real da Cakto
- [x] `buy_intent` corrigido: manda link direto sem justificar preço
- [x] `objection_expensive` corrigido: sem autoelogio
- [x] `commercialSettings` substituindo `commercialConfig` no prompt do DeepSeek
- [x] Simulação real via WhatsApp validada — respostas humanas e contextuais
- [x] `data/approved-responses.json` — salva intenção + texto injetado (few-shot)
- [x] `deepseekSuggestions.ts` — lê últimos 3 exemplos aprovados por intenção e injeta no prompt
- [x] `index.html` — textarea editável por sugestão antes de injetar
- [x] `index.html` — `injectWhatsAppEdited` usa texto editado + grava no few-shot
- [x] `index.html` — polling pausado com `isEditing` enquanto usuário edita textarea
- [x] `index.html` — sugestões lado a lado (grid 3 colunas)
- [x] `assets/produto-completo-preview.gif` — GIF registrado como mídia opcional
- [x] Lembretes do painel para uso de PNG/GIF do produto
- [x] `src/config/env.ts` — carregamento de `.env` local sem dotenv
- [x] `.env.example` — variáveis `COPILOT_PANEL_PORT`, `SIMULATION_FAST`, `DEEPSEEK_API_KEY`
- [x] `commercialSettings` — checkout normal e recuperação separados
- [x] Painel Comercial — validação/aprovação de checkout normal e recuperação
- [x] Sugestões de recuperação para oferta de R$ 17
- [x] Sistema de score das sugestões com destaque da mais recomendada
- [x] Campanha inicial com fila controlada, delay e progresso no painel
- [x] Controles para limpar leads e limpar fila
- [x] Pendências por cliente: responder/focar pendência específica, resolver sem responder, manter contexto
- [x] Fluxo manual de continuação quando cliente não responde
- [x] DeepSeek com histórico da conversa + etapa escolhida para gerar 3 follow-ups
- [x] Fila real de injeção com status `queued`, `claimed`, `sending`, `sent`, `failed`
- [x] Extensão com lock para não misturar envios
- [x] Auto-import pausa durante injeção para evitar reimportar mensagem enviada
- [x] Painel mostra fila real de envio e permite limpar tarefas finalizadas
- [x] Banner final de checkout: `assets/checkout-banner-planner-estudante-pro-v4.png`

---

**Atualizado em:** 2026-05-05
**QA:** Claude Sonnet 4.6

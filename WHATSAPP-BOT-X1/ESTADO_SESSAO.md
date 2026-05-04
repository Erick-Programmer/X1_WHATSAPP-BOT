# ESTADO_SESSAO.md — X1_WHATSAPP BOT

**Atualizado em:** 2026-05-04  
**QA:** Claude Sonnet 4.6

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

---

## TASK PENDENTE ATUAL ⏳

### Testar polling de leads end-to-end

1. Recarregar extensão em `edge://extensions/`
2. Servidor rodando em `127.0.0.1:8787`
3. Clicar ⚪ Leads OFF → virar 🟢 Leads ON
4. Confirmar borda verde nas conversas que são leads

---

## PRÓXIMOS PASSOS

1. **[TESTE]** Validar polling de leads visualmente no WhatsApp Web
2. **[CONFIG]** Preencher `.env` com preço + link Cakto
3. **[GO LIVE]** Integração WhatsApp Business API real

---

## ESTADO DOS ARQUIVOS CRÍTICOS

| Arquivo | Status |
|---------|--------|
| `dist/dev/copilotPanel/server.js` | ✅ Compilado |
| `src/dev/copilotPanel/public/index.html` | ❓ A verificar |
| `browser-extension/` (4 arquivos) | ✅ Pronto para instalação |
| `assets/produto-planners.png` | ❓ A verificar |
| `assets/ebooks-bonus.png` | ❓ A verificar |
| `.env` (credenciais reais) | ❌ Não configurado (aguarda aprovação) |

---

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

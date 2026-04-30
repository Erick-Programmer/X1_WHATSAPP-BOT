# WHATSAPP-BOT-X1 — Planner Estudante Pro

Bot de atendimento comercial para WhatsApp Business/Cloud API.

Produto: **Planner Estudante Pro** — pacote digital com 10 planners + 3 ebooks bônus.

## Estrutura do Projeto

```
WHATSAPP-BOT-X1/
├── README.md
├── .env.example
├── package.json
├── assets/
│   └── README.md
├── src/
│   ├── config/
│   │   ├── product.ts
│   │   └── rules.ts
│   ├── flows/
│   │   ├── entry.ts
│   │   ├── qualification.ts
│   │   ├── productPresentation.ts
│   │   ├── pricing.ts
│   │   ├── objections.ts
│   │   ├── closing.ts
│   │   └── fallback.ts
│   ├── prompts/
│   │   ├── system-prompt.md
│   │   ├── qa-prompt.md
│   │   ├── product-knowledge.md
│   │   └── sales-rules.md
│   ├── templates/
│   │   ├── messages.json
│   │   └── media.json
│   ├── services/
│   │   ├── intentClassifier.ts
│   │   ├── responseGenerator.ts
│   │   ├── qaValidator.ts
│   │   ├── delayQueue.ts
│   │   └── whatsappClient.ts
│   ├── types/
│   │   ├── conversation.ts
│   │   └── intent.ts
│   └── index.ts
```

## Casos de Classificação Esperados

| Entrada | Intenção Classificada |
|---------|----------------------|
| "sim" | positive_confirmation |
| "claro pode mandar" | positive_confirmation |
| "quero ver" | positive_confirmation |
| "quanto custa?" | ask_price |
| "serve para ensino médio?" | ask_target_audience |
| "tem simulado?" | ask_content |
| "não quero mais" | stop_contact |
| "quero falar com atendente" | human_needed |

## Como usar

1. Copie `.env.example` para `.env` e preencha as variáveis.
2. Instale as dependências: `npm install`
3. Compile: `npm run build`
4. Inicie: `npm start`

## Configuração Comercial

Antes de colocar o bot em produção, edite o arquivo `src/config/commercial.ts`:

1. **Preço** — ajuste `price` para o valor desejado (ex: `"R$ 27,00"`).
2. **Link da Cakto** — substitua `checkoutUrl` pelo link real do checkout na Cakto.
3. **Ativar checkout** — altere `isCheckoutConfigured` de `false` para `true` quando o link estiver pronto.

Enquanto `isCheckoutConfigured` for `false`, o bot informará o preço e dirá que o link será enviado em seguida, sem exibir link nenhum.

## Simulação Rápida (modo teste)

Para rodar o bot sem o delay humanizado (8-25s), use a variável `SIMULATION_FAST=true`:

**Linux / Mac:**
```bash
SIMULATION_FAST=true node dist/index.js
```

**Windows PowerShell:**
```powershell
$env:SIMULATION_FAST="true"; node dist/index.js
```

Com essa variável ativa, o `waitForDelay()` resolve imediatamente, permitindo testar o fluxo completo em segundos.



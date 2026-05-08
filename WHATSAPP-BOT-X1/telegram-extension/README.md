# Copiloto Telegram

Extensão separada da extensão do WhatsApp. Ela usa a fila Telegram do painel e trabalha apenas no Telegram Web.

## Como usar

1. Inicie o painel:

```bash
npm run build
node dist/dev/copilotPanel/server.js
```

2. Abra `https://web.telegram.org/k/` e faça login.
3. No Chrome/Edge, vá em Extensões, ative Modo desenvolvedor e clique em Carregar sem compactação.
4. Selecione a pasta `telegram-extension`.
5. No painel, abra a aba Telegram, cole `@username` ou links `https://t.me/usuario`, escreva a mensagem e clique em Preparar envio Telegram.

## O que ela faz

- Com o Telegram Web aberto, consulta `http://127.0.0.1:8787/api/inject-telegram/pending`.
- Abre o Telegram Web no usuário da fila.
- Injeta a mensagem no campo de texto.
- Clica em enviar quando encontra o botão do Telegram.
- Marca a tarefa como `sent` ou `failed`.
- Faz captura best-effort de conversas visíveis com indicador de não lida e username detectável.

## Separação do WhatsApp

- Pasta diferente: `telegram-extension/`.
- Fila diferente: `data/telegram-injection-queue.json`.
- Rotas diferentes: `/api/inject-telegram/*`.
- O fluxo do WhatsApp e a pasta `browser-extension/` não são usados por esta extensão.

## Limitações

- Telegram Web muda DOM com frequência; seletores podem precisar de ajuste.
- Só envia para `@username` ou link `t.me/usuario`.
- A captura de respostas depende do Telegram mostrar username no DOM/lista.
- Não usa bot oficial do Telegram.

# Processo do WHATSAPP-BOT-X1

## Objetivo

Este projeto contém o bot comercial do WhatsApp para vender o Planner Estudante Pro.

O produto principal fica separado em `X1 - PLANO 2`. Este bot não deve alterar os planners, ebooks ou PDFs finais.

## Dependências

- Não instalar dependências globalmente sem aprovação.
- Preferir dependências locais do projeto.
- Para Node.js, usar instalação local dentro do projeto somente quando aprovado.
- Para Python, se for necessário usar bibliotecas como PyMuPDF, criar venv local antes ou pedir autorização.
- Não criar `node_modules`, lockfile, venv ou instalar pacotes durante tarefas de planejamento.
- Registrar neste documento quando uma dependência externa for usada.

## Conversão de Previews

- Os PNGs em `assets/preview-source/planners/` são materiais auxiliares para design.
- Os PDFs dos planners em `X1 - PLANO 2` são somente leitura.
- Não alterar arquivos do produto final durante conversões.
- A arte final `produto-planners.png` será criada manualmente no Photoshop.

## Assets Comerciais

Arquivos finais esperados:

- `assets/produto-planners.png`
- `assets/ebooks-bonus.png`
- `assets/produto-planners-preview.gif` opcional
- `assets/ebooks-bonus-preview.gif` opcional

O bot deve usar PNG estático no fluxo principal. GIFs são apenas follow-up se o cliente pedir prévia interna.

## WhatsApp

- Não usar WhatsApp real nesta fase.
- Não colocar tokens reais no código.
- Usar apenas `.env.example` até a etapa de integração.
- A integração real com WhatsApp Cloud API será uma etapa separada.

## Observação de Dependência Já Usada

Durante a geração inicial dos previews dos planners, o PyMuPDF foi instalado globalmente no Python 3.13 em:

`C:\Users\TIGER GAMER\AppData\Local\Programs\Python\Python313\Lib\site-packages\`

Isso funcionou, mas não deve ser repetido sem aprovação. Em próximas tarefas Python, preferir venv local ou pedir autorização.

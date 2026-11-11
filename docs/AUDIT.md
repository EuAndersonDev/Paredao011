# Auditoria de segurança e arquitetura — Paredão 011

Data: 2026-11-11 · Escopo: repositório completo, histórico do git e saída do build (`dist/`).

## Stack e chamadas externas

HTML/CSS/JS puro, sem dependências npm. Um build em Node (`scripts/build.mjs`) gera `dist/`, publicado pela Vercel, mais uma Vercel Function (`api/trip.js`).

| Chamada | Onde roda | Chave? |
|---|---|---|
| `POST /api/trip` (mesma origem) | navegador → Vercel Function | não |
| `https://viacep.com.br/ws/{cep}/json/` (`api/trip.js:24`) | Vercel Function | não |
| `https://routes.googleapis.com/directions/v2:computeRoutes` (`api/trip.js:64`) | Vercel Function | `GOOGLE_MAPS_API_KEY` no cabeçalho `X-Goog-Api-Key` |
| `https://wa.me/...` | link aberto pelo usuário (sem fetch) | não |
| `https://www.instagram.com/paredao_011/` | link | não |

As fontes são servidas pelo próprio site, sem chamadas ao Google Fonts.

## Chave de API

- `GOOGLE_MAPS_API_KEY` só é lida em `api/trip.js:205` (`process.env`, sem prefixo público). O navegador nunca a recebe: a função devolve apenas `outboundKm`, `returnKm`, `tollsBRL` e `tollsStatus`.
- Busca por padrões de chave (`AIza…`, `api_key=`, `secret`, `token`) em **todo o histórico do git**: nada encontrado. Nenhum arquivo `.env*` foi commitado (`.env*` está no `.gitignore`).
- Busca por padrões de chave em `dist/`: nada encontrado. Um teste (`tests/config-and-build.test.js`) agora falha o build se `process.env`, `GOOGLE_MAPS_API_KEY` ou uma chave `AIza…` aparecer no bundle do navegador.
- **Status: NÃO exposta.** A forma como a chave chega ao código não foi alterada.

## Achados

| Severidade | Arquivo:linha | Problema | Correção |
|---|---|---|---|
| Média | `api/trip.js:133` | `/api/trip` é público e sem limite de uso: alguém pode chamar a função em massa e gerar custo na API de rotas do Google. Os caches em memória ajudam, mas não impedem. | Ação do dono: restringir a chave no Google Cloud (só a Routes API) e criar cota diária e alerta de cobrança. Se houver abuso, ativar uma regra de rate limit no Firewall da Vercel (configuração, não código). |
| Média (bug, **não corrigido**) | `src/simulator/simulator.js:59,71` | Pedágio manual: o primeiro valor válido digitado trava o cálculo e as edições seguintes são ignoradas. Digitar `12,50` tecla por tecla gera R$ 873,17; colar `12,50` gera R$ 896,17. **O cliente pode receber um valor menor que o correto.** | Aguardando aprovação: permitir recalcular enquanto o status for `unknown` ou `manual`. Comportamento original mantido e registrado nos testes. |
| Baixa (bug, **não corrigido**) | `src/simulator/simulator.js:123,189` | Depois de um cálculo com sucesso, a mensagem "Consultando o CEP e calculando a rota..." continua na tela. | Limpar o status ao mostrar o total. Mantido igual ao original. |
| Baixa | `src/simulator/simulator.js:114` | O nome do responsável só era checado como "não vazio". | **Corrigido:** agora exige 2–80 caracteres (`maxlength="80"` no campo). |
| Baixa | `vercel.json` | Faltavam `X-Frame-Options`, `Strict-Transport-Security` e `Permissions-Policy`. | **Corrigido:** cabeçalhos adicionados. |
| Info | `src/simulator/simulator.js:112` | A mensagem de erro fala em "nome do local", mas o campo é "Nome do responsável". | Ajuste de texto pendente de aprovação (não alterado). |
| Info | `src/lib/whatsapp.js:18` | Eventos de vários dias mostram só a data de início na mensagem do WhatsApp. | Decisão de negócio; não alterado. |
| Info | — | Não há Content-Security-Policy. | Sugestão para a próxima versão: `default-src 'self'; img-src 'self' data:; script-src 'self' 'sha256-…'` (hash do script inline que adiciona a classe `js`); `style-src 'self'`; `frame-ancestors 'none'`. |

Também verificado, sem problemas:
- Nenhum `innerHTML`, `insertAdjacentHTML` ou `document.write`. Dados do usuário e da API entram na página só via `textContent`.
- A mensagem do WhatsApp é codificada linha a linha com `encodeURIComponent` (`src/lib/whatsapp.js`).
- `npm audit`: 0 vulnerabilidades (o projeto não tem dependências).
- Nenhum dado é armazenado: o CEP vai para `/api/trip`, que guarda em memória só o resultado da rota por CEP, por até 6 h, sem nome nem endereço.

## Código morto e duplicado removido

- `EXTRA_HOUR_RATE_BRL` (config): nunca era usado.
- Linha duplicada `if (data.tollsStatus === "unknown") showStatus("", "")` (antigo `app.js:415-416`).
- `ORIGIN_CEP` e `TOLL_VEHICLE_MULTIPLIER` duplicados em `api/trip.js`: agora vêm de `src/config.js`.
- `site.config.json`: incorporado a `src/config.js` (arquivo único).
- Telefone e Instagram repetidos no HTML e no `llms.txt`: agora vêm do config no build.
- Código que reescrevia os links do WhatsApp em JS: o build já gera o link certo.
- CSS sem uso: `.card .subtitle` e `.grid--2`.
- Header e botão do WhatsApp duplicados nas duas páginas: agora são componentes (`src/components/`).

# Auditoria de segurança, código e UX — Paredão 011

Última revisão: 2026-11-16 · Escopo: repositório, histórico do git, build (`dist/`) e site no ar.

## Stack e chamadas externas

HTML/CSS/JS puro. Dependências npm só nas funções: `nodemailer` e `@neondatabase/serverless` (versões fixas, sem dependências próprias); `@electric-sql/pglite` só nos testes. `scripts/build.mjs` gera `dist/`, publicado pela Vercel, mais uma Vercel Function (`api/trip.js`).

| Chamada | Onde roda | Chave? |
|---|---|---|
| `POST /api/trip` (mesma origem) | navegador → Vercel Function | não |
| `https://viacep.com.br/ws/{cep}/json/` | Vercel Function | não |
| `https://routes.googleapis.com/directions/v2:computeRoutes` | Vercel Function | `GOOGLE_MAPS_API_KEY` no cabeçalho `X-Goog-Api-Key` |
| `https://wa.me/...`, Instagram | links abertos pelo usuário | não |
| `POST /api/event` (mesma origem) | navegador → Vercel Function | não |
| Postgres Neon (`DATABASE_URL`) | Vercel Functions (`api/_lib/db.js`) | credencial no `DATABASE_URL` |
| Gmail SMTP (`smtp.gmail.com:465`, Nodemailer) | Vercel Function `api/report.js` (Cron diário, 18h) | `SMTP_USER` / `SMTP_PASS` (senha de app) |

Fontes, imagens e vídeos são servidos pelo próprio site.

## Chave de API

- `GOOGLE_MAPS_API_KEY` só é lida em `api/trip.js` (`process.env`, sem prefixo público). A função devolve apenas `outboundKm`, `returnKm`, `tollsBRL` e `tollsStatus`.
- Nenhuma chave ou arquivo `.env*` no histórico do git; nenhum padrão de chave em `dist/`. Os testes falham se `process.env` ou uma chave aparecer no bundle do navegador, ou se a chave for parar numa URL.
- **Status: NÃO exposta.**

## Verificado no site no ar

- `/api/trip` rejeita método errado (405), tipo de conteúdo errado (415), corpo grande (413) e CEP malformado (400).
- `/src`, `/tests`, `/docs`, `/.env`, `/.git`, `/package.json` e `/vercel.json` respondem 404.
- Cabeçalhos: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Permissions-Policy`.

## Corrigido nesta revisão

| Área | Problema | Correção |
|---|---|---|
| Preço | Pedágio manual digitado tecla por tecla usava só o primeiro dígito. | Recalcula a cada edição; coberto por teste. |
| Simulador | Botão "Confirmar Orçamento no WhatsApp" clicável sem valor (abria a própria página). | Sem `href` e `aria-disabled` até existir um total. |
| Simulador | "Consultando o CEP..." ficava na tela depois do cálculo. | Mensagem limpa ao terminar. |
| Simulador | Erros apareciam um por vez, longe do campo, sem destaque nem anúncio. | Erro sob o campo, foco no campo, `aria-invalid`, `role="alert"`; validação de cima para baixo; mensagens separadas para nome e endereço. |
| Simulador | Enter não calculava; campos e botão em Arial; CEP sem traço; botão flutuante cobria o botão de confirmar; sem rodapé; topo longo no celular. | Formulário de verdade, fonte do site, `01001-000`, flutuante some perto do botão, rodapé incluído, topo encurtado. |
| Acessibilidade | Resultado e mensagens não eram anunciados. | `aria-live` no status, no total e no pedágio manual. |
| Vídeos | Seção com 6,9 telas de rolagem, sem como pular e inalcançável por teclado. | 5,15 telas, "Pular os vídeos" e "Assistir aos vídeos" (leva o foco aos controles). |
| Página inicial | Menu sem Galeria, Vídeos e Dúvidas; links do rodapé pequenos para toque; vídeos sem capa sem JavaScript. | Links adicionados; áreas de toque de 44 px; capas via CSS sem JS. |
| HTML | `autocomplete` inválido em dois campos; link sem `rel="noopener"`. | Corrigidos; `html-validate` sem erros. |
| Segurança | Lista de CEPs não encontrados crescia sem limite. | Limitada a 200 entradas, como o cache de resultados. |
| Segurança | Sem Content-Security-Policy. | CSP em `vercel.json` (sem `unsafe-inline`); teste confere o hash do script inline. |
| CI | Workflow sem permissões mínimas. | `permissions: contents: read`. |
| Testes | Usavam os preços de produção: toda mudança de preço quebrava o CI. | Tabela de preços fixa nos testes. |
| Testes | Sem cobertura da função da API e do fluxo do simulador. | `tests/api-trip.test.js` e `tests/simulator.test.js`. |

## Pendências do dono (não são código)

| Gravidade | Item | Como resolver |
|---|---|---|
| Média | `/api/trip` é público e sem limite de uso: chamadas em massa geram custo no Google. | Google Cloud: restringir a chave à Routes API, criar cota diária e alerta de cobrança. Se houver abuso, regra de rate limit no Firewall da Vercel. |
| Média | `main` sem proteção; a Vercel publica mesmo com o CI vermelho. | GitHub → Settings → Branches: exigir o check "CI" no `main`. |
| Baixa | GitHub Pages publica uma cópia do repositório. | Settings → Pages → Source: None. |
| Baixa | "Regiões atendidas" mostra só "Grande São Paulo". | Preencher `BUSINESS.cities` em `src/config.js`. |
| Info | Placa do caminhão e rostos aparecem nos vídeos. | Confirmar autorização de quem aparece. |
| Info | Eventos de vários dias mostram só a data de início na mensagem do WhatsApp. | Decisão de negócio. |

## Estatísticas do relatório (adicionado em 2026-11-22)

- O site passou a guardar **estatísticas anônimas** no Postgres (Neon): uma linha por orçamento e por confirmação, com cidade/UF, distância, duração e valor estimado. Nome, endereço, bairro e rua nunca são guardados; o CEP fica na tabela `recent_quote_ceps` por no máximo 2 dias, para ligar a confirmação à cidade, e é apagado na rotina diária. Eventos com mais de 400 dias também são apagados. O texto de privacidade do simulador foi atualizado para dizer isso.
- Todas as consultas usam parâmetros (`$1`, `$2`…), nunca texto do usuário concatenado no SQL.
- `/api/event` aceita só confirmações de CEPs consultados nos últimos 2 dias e valida tamanho e valores, o que dificulta inflar os números. Não há limite de uso; se houver abuso, a mesma regra de rate limit do Firewall da Vercel sugerida para `/api/trip` resolve.
- `/api/report` (diário, às 18h) exige `Authorization: Bearer CRON_SECRET` (enviado automaticamente pela Vercel Cron) e recusa tudo se o segredo não estiver configurado.
- Se o banco não estiver configurado ou cair, o simulador funciona normalmente (o registro desiste após 2,5 s); só a contagem deixa de acontecer.

## Observações

- A CSP bloqueia scripts de terceiros. Em deploys de **preview** da Vercel, a barra de comentários da Vercel pode ser bloqueada e gerar avisos no console; em produção isso não ocorre. Se um dia for adicionado analytics ou outro serviço externo, ele precisa entrar na CSP.
- As seções animam ao rolar para baixo e para cima, a pedido. Se ficar cansativo no uso real, basta voltar a animar uma vez só em `src/components/scroll-reveal.js`.
- Não há linter/formatador automático; opcional para um projeto deste tamanho.

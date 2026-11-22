# Paredão 011

Site da Paredão 011 (aluguel de paredão de som na Grande SP): landing page (`/`) e simulador de orçamento (`/orcamento`).
HTML/CSS/JS puro; um build em Node gera `dist/`, que a Vercel publica. A função `api/trip.js` calcula distância e pedágios.

## Rodar

Requer Node 20+. Instale as dependências com `npm install` (só as funções usam: Nodemailer e o driver do Neon).

```bash
npm run dev      # build + servidor local em http://localhost:3000 (inclui /api/trip)
npm test         # testes de preço, datas, WhatsApp, simulador, API e build
npm run check    # testes + build (o mesmo que o CI roda)
```

Para o simulador calcular rotas localmente, crie `.env.local` (já ignorado pelo git) com `GOOGLE_MAPS_API_KEY=...`.

## Mudar preços, telefone ou endereço do site

Tudo fica em **`src/config.js`**, no bloco marcado `EDIT PRICES HERE`: valor por hora, consumo do carro, gasolina, multiplicador de pedágio e sinal (%).
Telefone do WhatsApp, Instagram, `SITE_URL` e dados de SEO (`BUSINESS`) estão no mesmo arquivo.
Depois de editar, rode `npm run check`. Os testes usam uma tabela de preços própria (`tests/fixtures/golden-quotes.json`), então **mudar preço não quebra o CI**; eles só falham se a conta ou o formato da mensagem do WhatsApp mudarem.

## Visual ("cartaz de baile + placa de caminhão")

- Cores (em `src/styles/base.css`): `--ink` preto, `--paper` papel jornal, `--hazard` amarelo do caminhão, `--hot` só para erros.
- Fontes próprias em `public/fonts/`: Archivo (títulos ultra-condensados, `font-stretch: 62%`) e IBM Plex Mono (etiquetas e o cupom do orçamento).
- Fundo das seções: `section--paper` (papel), `section--ink` (preto) ou `section--hazard` (amarelo). A faixa listrada entre seções é automática.
- Ação principal: classe `sticker`; secundária: `link-line`. Sem cantos arredondados, sem brilho: bordas grossas e sombra dura.
- Animações: todas em `src/styles/site.css`, dentro de `prefers-reduced-motion: no-preference`.

## Vercel

- Variável de ambiente: **`GOOGLE_MAPS_API_KEY`** (Settings → Environment Variables). Fica só no servidor; não use prefixo público.
- `vercel.json` já define o build (`npm run build` → `dist/`), URLs limpas, redirecionamento e cabeçalhos de segurança, incluindo a Content-Security-Policy. Se o script inline das páginas mudar, o teste avisa que o hash da CSP precisa ser atualizado.

## Relatório diário por e-mail

Todos os dias às 18h (horário de Brasília), a Vercel chama `/api/report`, que envia para **paredaoonze@gmail.com** o resumo das últimas 24 horas (18h de ontem às 18h de hoje):
orçamentos calculados, confirmações no WhatsApp, taxa de conversão, valor estimado, ticket médio, cidades, distâncias e números hora a hora.

O site guarda só **estatísticas anônimas** (contagens, cidade/UF, faixa de distância, valor estimado e duração); nunca nome, endereço ou CEP completo nos contadores.

O site guarda só **estatísticas anônimas** no Postgres (Neon): uma linha por orçamento e por confirmação, com cidade/UF, distância, duração e valor estimado. Nome, endereço e rua nunca são guardados; o CEP fica no máximo 2 dias (só para ligar a confirmação à cidade). As tabelas são criadas sozinhas no primeiro uso (`db/schema.sql`).

O e-mail sai pelo **Gmail via SMTP** (Nodemailer), sem serviço de terceiros. Configure uma vez:

1. **Banco:** a integração do **Neon** na Vercel já cria o `DATABASE_URL`. Nada mais a fazer.
2. **Senha de app do Gmail:** entre em myaccount.google.com com a conta **paredaoonze@gmail.com** → *Segurança* → ative a **verificação em duas etapas** → *Senhas de app* → crie uma (nome: "Site Paredão 011") e copie os 16 caracteres.
3. Na Vercel (*Settings → Environment Variables*, ambientes *Production* e *Preview*):
   - `SMTP_USER` = `paredaoonze@gmail.com`
   - `SMTP_PASS` = a senha de app (16 caracteres, sem espaços)
   - `CRON_SECRET` já está criado.
4. Opcional: `REPORT_EMAIL` (outro destinatário), `REPORT_FROM`, e `SMTP_HOST`/`SMTP_PORT` para outro provedor de e-mail (padrão: `smtp.gmail.com`, porta 465).
5. Faça um novo deploy de produção. O agendamento só roda em produção.

Testar sem esperar as 18h (troque `SEU_SEGREDO`):

```bash
curl -H "Authorization: Bearer SEU_SEGREDO" "https://paredao011.vercel.app/api/report?dry=1" > relatorio.html
```

Sem `dry=1` o e-mail é enviado na hora. `days=7` ou `days=30` geram um resumo da semana ou do mês.

## Estrutura

```
api/trip.js        função Vercel: CEP -> distância de ida/volta e pedágios (usa a chave)
api/event.js       função Vercel: registra a confirmação no WhatsApp (estatística anônima)
api/report.js      função Vercel: relatório diário às 18h por e-mail (Vercel Cron + Gmail SMTP)
api/_lib/          banco (Neon), estatísticas e envio de e-mail (Nodemailer)
db/schema.sql      tabelas das estatísticas (criadas automaticamente)
src/config.js      preços, taxas, contato, SITE_URL (único arquivo de configuração)
src/lib/           funções puras: pricing, whatsapp, datetime, format
src/simulator/     formulário, exibição do resultado, controle e efeitos do simulador
src/components/    header, footer, botão do WhatsApp, menu hambúrguer, revelação ao rolar, parallax
src/pages/         páginas HTML (montadas com os componentes no build)
src/styles/        CSS
public/            imagens, fontes, robots.txt, sitemap.xml, llms.txt
scripts/           build, servidor local, otimização de imagens
tests/             testes (node:test)
docs/AUDIT.md      auditoria de segurança
```

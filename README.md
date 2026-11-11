# Paredão 011

Site da Paredão 011 (aluguel de paredão de som na Grande SP): landing page (`/`) e simulador de orçamento (`/orcamento`).
HTML/CSS/JS puro, sem dependências; um build em Node gera `dist/`, que a Vercel publica. A função `api/trip.js` calcula distância e pedágios.

## Rodar

Requer Node 20+.

```bash
npm run dev      # build + servidor local em http://localhost:3000 (inclui /api/trip)
npm test         # testes de preço, datas, WhatsApp e build
npm run check    # testes + build (o mesmo que o CI roda)
```

Para o simulador calcular rotas localmente, crie `.env.local` (já ignorado pelo git) com `GOOGLE_MAPS_API_KEY=...`.

## Mudar preços, telefone ou endereço do site

Tudo fica em **`src/config.js`**, no bloco marcado `EDIT PRICES HERE`: valor por hora, consumo do carro, gasolina, multiplicador de pedágio e sinal (%).
Telefone do WhatsApp, Instagram, `SITE_URL` e dados de SEO (`BUSINESS`) estão no mesmo arquivo.
Depois de editar um preço, rode:

```bash
npm run test:update   # regrava os valores de referência dos testes com os novos preços
npm run check         # testes + build
```

Os testes de referência (`tests/fixtures/golden-quotes.json`) travam os totais de propósito: se um preço mudar sem `test:update`, o CI fica vermelho. Confira a diferença no commit antes de enviar.

## Vercel

- Variável de ambiente: **`GOOGLE_MAPS_API_KEY`** (Settings → Environment Variables). Fica só no servidor; não use prefixo público.
- `vercel.json` já define o build (`npm run build` → `dist/`), URLs limpas, redirecionamento e cabeçalhos de segurança.

## Estrutura

```
api/trip.js        função Vercel: CEP -> distância de ida/volta e pedágios (usa a chave)
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

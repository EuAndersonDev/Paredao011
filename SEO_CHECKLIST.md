# Checklist de SEO — tarefas manuais do dono do site

O código já entrega títulos, descrições, dados estruturados, `robots.txt`, `sitemap.xml` e `llms.txt`.
Estes passos dependem de contas e acessos do dono e precisam ser feitos à mão.

## 1. Google Search Console
- [ ] Acesse https://search.google.com/search-console e adicione a propriedade **Prefixo do URL** com o endereço do site.
- [ ] Escolha a verificação por **tag HTML**, copie só o valor de `content="..."` e cole em `src/config.js` → `BUSINESS.googleSiteVerification`. Faça o deploy e clique em **Verificar**.
- [ ] Em **Sitemaps**, envie `sitemap.xml`.
- [ ] Em **Inspeção de URL**, peça a indexação de `/` e de `/orcamento`.

## 2. Perfil da Empresa no Google (Google Business Profile)
- [ ] Complete o perfil com **NAP idêntico ao site**: nome "Paredão 011", telefone (11) 98356-9830, site com o mesmo endereço do `siteUrl`.
- [ ] Categoria principal: **"Serviço de aluguel de equipamento de som"** (ou a mais próxima disponível).
- [ ] Área de atendimento: Grande São Paulo e as cidades atendidas (as mesmas de `cities` em `src/config.js` (bloco `BUSINESS`)).
- [ ] Adicione fotos reais do paredão montado em eventos e publique posts com frequência.
- [ ] Copie o link público do perfil para `src/config.js` → `BUSINESS.googleBusinessUrl`.

## 3. Avaliações
- [ ] Depois de cada evento, peça ao cliente uma avaliação no Google (envie o link "Pedir avaliações" do perfil pelo WhatsApp).
- [ ] Nunca publique avaliações inventadas no site nem adicione `AggregateRating` sem avaliações reais.

## 4. Instagram
- [ ] Coloque o link do site na bio do @paredao_011, de preferência apontando para `/orcamento`.

## 5. Bing Webmaster Tools
- [ ] Acesse https://www.bing.com/webmasters, use **Importar do Google Search Console** (mais rápido) e envie o `sitemap.xml`.

## 6. Dados pendentes em `src/config.js` (bloco `BUSINESS`)
Preencha quando tiver os valores reais (o build omite automaticamente os campos ainda com `{{...}}`):
- `cities`: lista de cidades atendidas (aparece em "Regiões atendidas" e no `areaServed` do JSON-LD).
- `priceRange`: faixa de preço (ex.: "$$").
- `openingHours` (formato schema.org, ex.: `Mo-Su 10:00-23:00`) e `openingHoursLabel` (texto visível, ex.: "Seg a dom, 10h às 23h").
- `googleBusinessUrl` e `googleSiteVerification`.

## 7. Depois de cada deploy
- [ ] Confira que `/robots.txt`, `/sitemap.xml` e `/llms.txt` abrem com status 200.
- [ ] Valide o JSON-LD em https://validator.schema.org e https://search.google.com/test/rich-results.
- [ ] Rode o Lighthouse (modo mobile) nas duas páginas.

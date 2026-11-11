# Paredao011
Site do Paredao011

- `/` → `index.html` — landing page
- `/orcamento` → `orcamento.html` — simulador de orçamento (`app.js` + `config.js` + `api/trip.js`)
- `site.css` / `site.js` — header, menu hambúrguer e estilos da landing (compartilhados)
- `vercel.json` — `cleanUrls` para `/orcamento` funcionar ao recarregar

## Rodar localmente

Requer a variável `GOOGLE_MAPS_API_KEY` (usada por `api/trip.js`).

```bash
npx vercel dev
```

## Deploy

```bash
npx vercel --prod
```

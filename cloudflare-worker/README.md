# Proxy DNS para el diagnosticador (Safari iOS)

Safari en iPhone bloquea consultas DNS directas a servicios externos (Google DoH, Cloudflare, etc.).  
La solución es un **Cloudflare Worker** en la misma ruta del sitio: `www.inboxseguro.com/api/dns`.

## Despliegue rápido (Cloudflare Dashboard)

1. Entra a [Cloudflare Dashboard](https://dash.cloudflare.com) → zona **inboxseguro.com**
2. **Workers & Pages** → **Create application** → **Create Worker**
3. Pega el contenido de `cloudflare-worker/dns-proxy.js`
4. **Save and deploy**
5. **Settings** → **Triggers** → **Add route**:
   - Route: `www.inboxseguro.com/api/dns*`
   - Zone: `inboxseguro.com`
6. (Opcional) Añade también: `inboxseguro.com/api/dns*`

## Despliegue con Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

Requiere `wrangler.toml` en la raíz del repo (ya incluido).

## Verificar

```bash
curl "https://www.inboxseguro.com/api/dns?name=inboxseguro.com&type=TXT"
```

Debe devolver JSON con `"Status": 0` y registros TXT (SPF, etc.).

## Alternativa: endpoint en el panel

Si prefieres resolver DNS desde `panel.inboxseguro.com`, implementa:

`GET /api/public/dns-resolve?name=DOMAIN&type=TXT`

El cliente ya intenta esa URL como segundo proxy automáticamente.

# SEO — configuración externa (medición)

Pasos manuales fuera del repositorio:

## Google Search Console

1. Ir a [Google Search Console](https://search.google.com/search-console)
2. Añadir propiedad **URL prefix**: `https://www.inboxseguro.com`
3. Verificar dominio (DNS TXT en el registrador o archivo HTML en la raíz)
4. **Sitemaps** → enviar: `https://www.inboxseguro.com/sitemap.xml`
5. Revisar en 1–2 semanas: Cobertura → páginas indexadas (Tier A y B del sitemap)

## Google Analytics 4

1. Crear propiedad GA4 para `inboxseguro.com`
2. Insertar antes de `seo-analytics.js` en las páginas:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX');
</script>
<script src="/seo-analytics.js" defer></script>
```

## Eventos definidos (`seo-analytics.js`)

| Evento | Cuándo |
|--------|--------|
| `checker_submit` | Tras ejecutar diagnóstico en checkers (`trackCheckerSubmit('spf')`) |
| `cta_precios` | Clic en enlaces con `data-seo-event="cta_precios"` |
| `cta_plataforma` | Clic en enlaces con `data-seo-event="cta_plataforma"` |
| `cta_demo_whatsapp` | Clic en enlaces con `data-seo-event="cta_demo_whatsapp"` |

## KPIs (90 días)

- Todas las URLs Tier A/B indexadas
- +30% impresiones vs. mes baseline
- ≥5% de sesiones desde checkers con clic a plataforma o precios

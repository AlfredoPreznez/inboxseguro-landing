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
2. Copiar el Measurement ID (`G-XXXXXXXX`)
3. Editar [`analytics-config.js`](analytics-config.js):

```javascript
window.INBOXSEGURO_ANALYTICS = {
  ga4Id: 'G-TU-ID-REAL',
  clarityId: 'TU_CLARITY_ID', // opcional
};
```

Las 15 páginas HTML cargan automáticamente:
- `analytics-config.js`
- `analytics-loader.js`
- `seo-analytics.js`

## Microsoft Clarity (opcional)

1. Crear proyecto en [clarity.microsoft.com](https://clarity.microsoft.com)
2. Pegar el Project ID en `analytics-config.js` → `clarityId`

## Herramientas SEO recomendadas

| Herramienta | Uso |
|-------------|-----|
| Google Search Console | Indexación, keywords, errores crawl |
| Google Analytics 4 | Tráfico y conversiones |
| Microsoft Clarity | Heatmaps y scroll |
| Ahrefs Webmaster Tools / Ubersuggest | Posiciones y auditoría |
| Google Alerts | Menciones "DMARC Chile", "seguridad correo PYME" |
| Schema Markup Validator | Validar JSON-LD tras cambios |

## Eventos definidos (`seo-analytics.js`)

| Evento | Cuándo |
|--------|--------|
| `checker_submit` | Tras ejecutar diagnóstico en checkers |
| `checker_high_risk` | Dominio sin protección o con advertencias |
| `cta_precios` | Clic en enlaces con `data-seo-event="cta_precios"` |
| `cta_plataforma` | Clic en enlaces con `data-seo-event="cta_plataforma"` |
| `cta_demo_whatsapp` | Clic en WhatsApp demo |
| `cta_informe_demo` | Clic en "Ver informe de ejemplo" |
| `cta_fundador` | Clic en Programa Fundadores |

## KPIs (90 días)

| Métrica | Día 30 | Día 90 |
|---------|--------|--------|
| Páginas indexadas (GSC) | 14+ | 17+ |
| Impresiones orgánicas/mes | Baseline + 20% | Baseline + 50% |
| Clics checkers → precios/demo | 3% | 5% |
| Keywords en top 20 | 5 | 15 |
| Leads vía diagnosis-notify (Discord) | 10 | 40 |

## Páginas SEO nuevas (pivote due diligence)

- `/seguridad-correo-proveedores`
- `/informe-higiene-correo-corporativo`
- `/due-diligence-ciberseguridad-pyme`

# Informe de Investigación SEO, GEO y AEO (Octubre 2026)

> Documento interno de análisis técnico y verificación de fuentes para InboxSeguro Landing. No publicado en sitemap ni navegación pública.

---

## 1. Estado Actual por Página (Checkers DoH)

| Archivo | JSON-LD Actual | Lee Parámetro URL (`?d=` o `?domain=`) | Observación |
| :--- | :--- | :---: | :--- |
| `dmarc-checker.html` | `WebApplication` | **No** | Falta `FAQPage` estructurado (el texto visible ya tiene sección de FAQ). |
| `spf-checker.html` | `WebApplication` | **No** | Falta `FAQPage` estructurado (el texto visible ya tiene sección de FAQ). |
| `verificar-lista-negra.html` | `WebApplication`, `BreadcrumbList`, `FAQPage` | **No** | Cuenta con `FAQPage` y `BreadcrumbList`. Falta lectura de `?d=` / `?domain=`. |
| `mx-lookup.html` | `WebApplication`, `BreadcrumbList`, `FAQPage` | **No** | Cuenta con `FAQPage` y `BreadcrumbList`. Falta lectura de `?d=` / `?domain=`. |
| `domain-checker.html` | `WebApplication`, `FAQPage` | **No** | Cuenta con `FAQPage`. Falta lectura de `?d=` / `?domain=`. |
| `dkim-checker.html` | `WebApplication` | **No** | Solo `WebApplication`. Soporta selector opcional además del dominio. |
| `quien-puede-enviar-correos.html` | `WebApplication`, `FAQPage` | **No** | Cuenta con `FAQPage`. Falta lectura de `?d=` / `?domain=`. |
| `inboxscore.html` | `WebApplication`, `BreadcrumbList`, `FAQPage` | **Sí** (`?d=`) | Ya implementa `new URLSearchParams(location.search).get('d')`. Falta aceptar también `?domain=`. |

---

## 2. Inicialización de Cada Checker (Función, Input y Evento)

1. **`dmarc-checker.html`**:
   - **ID Input**: `dominioInput`
   - **ID Formulario / Evento**: `diagForm` con `onsubmit="handleDiagnostico(event)"`
   - **Función diagnóstica**: `handleDiagnostico(event)`
   - **Normalización y Validación**:
     - Limpieza: `value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')`
     - Validación dominio: `/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/`

2. **`spf-checker.html`**:
   - **ID Input**: `dominioInput`
   - **ID Formulario / Evento**: `diagForm` con `onsubmit="handleDiagnostico(event)"`
   - **Función diagnóstica**: `handleDiagnostico(event)`
   - **Normalización y Validación**: idéntica a `dmarc-checker.html`.

3. **`verificar-lista-negra.html`**:
   - **ID Input**: `rblInput`
   - **ID Formulario / Evento**: `rblForm` con listener `rblForm.addEventListener('submit', ...)`
   - **Normalización y Validación**:
     - Limpieza: `value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')`
     - Acepta IP (`ipRegex`) o Dominio (`domainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/`).

4. **`mx-lookup.html`**:
   - **ID Input**: `dominioInput`
   - **ID Formulario / Evento**: `mxForm` con listener `mxForm.addEventListener('submit', ...)`
   - **Normalización y Validación**:
     - Limpieza: `value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')`
     - Regex dominio: `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/`

5. **`domain-checker.html`**:
   - **ID Input**: `dominioInput`
   - **ID Formulario / Evento**: `diagForm` con `onsubmit="handleDiagnostico(event)"`
   - **Función diagnóstica**: `handleDiagnostico(event)`
   - **Normalización y Validación**: función global `normalizeDomain(val)` y regex `/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/`.

6. **`dkim-checker.html`**:
   - **ID Input**: `dominioInput` (y opcional `selectorInput`)
   - **ID Formulario / Evento**: `diagForm` con `onsubmit="handleDiagnostico(event)"`
   - **Función diagnóstica**: `handleDiagnostico(event)`

7. **`quien-puede-enviar-correos.html`**:
   - **ID Input**: `systemsDomain`
   - **ID Formulario / Evento**: `systemsForm` con listener `submit`
   - **Normalización**: `normalizeDomain(val)`.

8. **`inboxscore.html`**:
   - **ID Input**: `isInput`
   - **Función de disparo**: `submit(value, push)`
   - **Lógica actual**: `var q = new URLSearchParams(location.search).get('d'); if (q) submit(q, false);`

---

## 3. Verificación de Fuentes y Estándares

### a) RFC 7208 §4.6.4 (Límite de 10 consultas DNS en SPF)
- **Estado**: **VERIFICADA**
- **URL Oficial**: https://www.rfc-editor.org/rfc/rfc7208#section-4.6.4
- **Fecha de Consulta**: 26 de octubre de 2026.
- **Cita y contenido**:
  > *"SPF implementations MUST limit the number of mechanisms and modifiers that do DNS lookups to at most 10 per SPF check, including any lookups caused by the use of the 'include' mechanism or the 'redirect' modifier. If this limit is exceeded, the check MUST return 'permerror'."*
- **Precisión para InboxSeguro**: El verificador SPF de InboxSeguro únicamente lee el registro publicado en DNS; no realiza árbol recursivo ni cuenta los 10 lookups. No debe insinuarse lo contrario.

### b) Número correcto de la RFC vigente de DMARC
- **Estado**: **VERIFICADA**
- **URL Oficial Datatracker**: https://datatracker.ietf.org/doc/rfc9989/
- **URL Oficial RFC Editor**: https://www.rfc-editor.org/info/rfc9989/
- **Fecha de Consulta**: 26 de octubre de 2026.
- **Hallazgo**:
  - La RFC 7489 histórica (publicada en marzo 2015 como *Informational*) fue formalmente **obsoletada** por el IETF con el conjunto de especificaciones estándar (Proposed Standard):
    1. **RFC 9989**: *Domain-Based Message Authentication, Reporting, and Conformance (DMARC)* — Protocolo base, alineación y DNS walk (obsoleta a RFC 7489 y RFC 9091).
    2. **RFC 9990**: *DMARC Aggregate Reporting (RUA)*.
    3. **RFC 9991**: *DMARC Failure Reporting (RUF)*.
  - La referencia a "RFC 9989" es exacta y corresponde al estándar publicado en IETF Datatracker.

### c) RFC 6376 (DKIM) y RFC 8461 (MTA-STS)
- **Estado**: **VERIFICADA**
- **RFC 6376 (DKIM)**:
  - **URL Oficial**: https://www.rfc-editor.org/info/rfc6376/ y https://datatracker.ietf.org/doc/html/rfc6376
  - **Fecha de Consulta**: 26 de octubre de 2026.
  - **Detalle**: *DomainKeys Identified Mail (DKIM) Signatures*, estándar de Internet (STD 76), septiembre 2011 (actualizada por RFC 8301 para firmas criptográficas modernas).
- **RFC 8461 (MTA-STS)**:
  - **URL Oficial**: https://www.rfc-editor.org/info/rfc8461/ y https://datatracker.ietf.org/doc/html/rfc8461
  - **Fecha de Consulta**: 26 de octubre de 2026.
  - **Detalle**: *SMTP MTA Strict Transport Security (MTA-STS)*, Proposed Standard, septiembre 2018. Define la política vía HTTPS (`/.well-known/mta-sts.txt`) y registro DNS `_mta-sts` para exigir TLS en transferencias SMTP.

### d) Dmarcian y EasyDMARC: Verificación de Precios, Idioma y Soporte
- **Dmarcian**:
  - **URL Precios Oficial**: https://dmarcian.com/pricing/
  - **URL Soporte / Idiomas**: https://dmarcian.com/dmarcian-in-europe/
  - **Fecha de Consulta**: 26 de octubre de 2026.
  - **Precios publicados**:
    - Basic: $24/mes (o $19.99/mes anual), 2 dominios, 1 usuario, hasta 100k mensajes/mes.
    - Plus: $240/mes (o $199/mes anual), 8 dominios, 3 usuarios, hasta 1M mensajes/mes.
    - Enterprise: a medida (habitualmente $600+/mes).
    - Plan Personal gratuito únicamente para uso no comercial (1.250 correos/mes).
  - **Moneda de cobro**: USD (y EUR/CAD en sus subsidiarias regionales).
  - **Idioma y Soporte**: La plataforma está en inglés, pero su equipo europeo (EMEA) ofrece soporte en español, inglés, alemán, francés, italiano y búlgaro. Afirmar que Dmarcian "no ofrece soporte en español" es falso.
  - **Funciones**: Monitor de fuentes DMARC, subdominios automáticos, inspectores SPF/DKIM/BIMI, reportes RUA/RUF. No cuenta con asistente guiado con IA integrado para edición DNS paso a paso.
- **EasyDMARC**:
  - **URL Precios Oficial**: https://easydmarc.com/pricing/
  - **Fecha de Consulta**: 26 de octubre de 2026.
  - **Precios publicados**:
    - DMARC Plus: $44.99/mes ($35.99/mes en facturación anual).
    - DMARC Premium: $89.99/mes ($71.99/mes en facturación anual).
    - Enterprise: cotización a medida.
    - Prueba gratuita de 14 días sin tarjeta de crédito.
  - **Moneda de cobro**: USD.
  - **Idioma**: Sitio web, plataforma y documentación principalmente en inglés.
  - **Funciones**: EasySPF (delegación/aplanamiento de SPF en sus servidores), agregación RUA, visor forense, Managed MTA-STS.

### e) Ley Marco de Ciberseguridad de Chile (Ley 21.663) y Normas CMF
- **Estado**: **VERIFICADA**
- **URL Ley 21.663 (BCN)**: https://www.bcn.cl/leychile/navegar?idNorma=1204631
- **URL CMF Capítulo 20-10 RAN**: https://www.cmfchile.cl/normativa/ran/ran_cap_20-10.pdf
- **Fecha de Consulta**: 26 de octubre de 2026.
- **Análisis Legal Riguroso**:
  1. **¿Existe obligación legal sobre DMARC, SPF o DKIM?**: **NO.** En ningún artículo de la Ley 21.663 ni del Capítulo 20-10 de la CMF se mencionan explícitamente las siglas o términos "DMARC", "SPF" o "DKIM".
  2. **¿A quién obliga la Ley 21.663?**: A órganos de la Administración del Estado y a instituciones privadas catalogadas como Operadores de Servicios Esenciales (OSE) u Operadores de Importancia Vital (OIV).
  3. **¿Qué exige realmente?**: Implementar medidas de gestión de riesgos, contar con políticas de seguridad de la información, aplicar controles para prevenir incidentes de seguridad (incluyendo ataques dirigidos como suplantación o phishing) y reportar incidentes significativos a la Agencia Nacional de Ciberseguridad (ANCI) en un plazo de **3 horas**.
  4. **Conclusión**: Afirmar en una landing o anuncio que *"la Ley 21.663 exige DMARC"* es jurídicamente falso. Lo verificable y veraz es decir: *"DMARC y la autenticación de correo son los estándares técnicos recomendados internacionalmente para mitigar incidentes de suplantación y apoyar la debida diligencia exigida por la Ley Marco de Ciberseguridad"*.

### f) Funcionamiento del Destino `reportes@inboxseguro.com`
- **Estado**: **VERIFICADA EN EL REPOSITORIO**
- **Fuentes**: `docs/COMPATIBILIDAD_RUA.md`, `libs/rua_tls_config.py`, `libs/dmarc_inbound.py`, `bots/rua_imap_fetch.py`.
- **Detalle de Arquitectura**:
  - `reportes@inboxseguro.com` es un buzón centralizado único configurado en **Zoho Mail Lite**.
  - Todos los reportes RUA agregados generados por los servidores de destino (Google, Yahoo, Microsoft) se envían a esta casilla única.
  - El procesador backend descarga los informes, descomprime los archivos ZIP/GZIP y lee la etiqueta `<policy_published><domain>` del XML para atribuir cada reporte al cliente correspondiente.
  - La autorización externa según RFC 7489 §7.1 / RFC 9989 se realiza mediante el registro DNS comodín `*._report._dmarc.inboxseguro.com` TXT `"v=DMARC1"` activo en Cloudflare.

---

## 4. Estrategia de Compilación para `llms-full.txt`

Para generar un `llms-full.txt` completo, exhaustivo y 100% verídico sin redactar texto no verificado, se utilizará un script reproducible en Python (`scripts/build_llms_full.py`):
1. **Encabezado y Metadatos**: Extraído de `llms.txt`.
2. **Glosario DNS y Definiciones Oficiales**: Extraído de `glosario/` y de los diccionarios de `scripts/generate_glosario_guias.py`.
3. **Guías de Configuración**: Extraídas de las guías publicadas (Google Workspace, Microsoft 365, Zoho Mail, Shopify, HubSpot, Mailchimp).
4. **Artículos Técnicos del Blog**: Contenido completo en Markdown original de los 7 artículos existentes en `_content/blog/*.md`.
5. **Preguntas Frecuentes**: Preguntas y respuestas públicas publicadas en `faq.html`.
6. **Límites y Precisión Operativa**: Transcripción exacta de los límites declarados en `llms.txt`.

El script se complementará con un validador `scripts/check_llms_full.py` para asegurar que el archivo se mantenga sincronizado.

---

## 5. Lista de Riesgos y Qué NO Recomiendo Hacer

| Acción No Recomendada | Motivo Técnico / Legal |
| :--- | :--- |
| ❌ Publicar páginas comparativas con afirmaciones categóricas sobre competidores | Dmarcian sí cuenta con soporte en español vía EMEA y opciones variadas. Afirmar lo contrario genera riesgo de publicidad engañosa y demandas. |
| ❌ Afirmar que la Ley 21.663 o la CMF "obligan a implementar DMARC" | La ley no menciona DMARC. Cualquier cliente con asesoría jurídica o auditoría interna notará la falta de rigor y perderá la confianza en InboxSeguro. |
| ❌ Prometer o insinuar que InboxSeguro "aplana" o "arregla" SPF | La plataforma no ofrece aplanamiento dinámico ni cuenta los 10 lookups DNS en su checker. Prometerlo crea falsas expectativas en infraestructura crítica. |
| ❌ Agregar nuevas clases de Tailwind CSS sin compilar | Rompe el diseño en producción. Toda modificación debe utilizar únicamente clases ya presentes en `styles.css`. |
| ❌ Crear páginas nuevas o alterar URLs existentes en este PR | Sin reglas 301 configuradas, cualquier renombre de rutas genera errores 404 y desindexación en Google. |

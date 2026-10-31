---
title: "Phishing con IA: qué frena DMARC y qué no"
slug: phishing-con-ia-dmarc
description: "La IA ayuda a crear correos falsos más creíbles. Te explicamos cómo DMARC frena los que usan tu dominio exacto y qué ataques no detiene."
excerpt: "La IA ayuda a crear correos falsos más creíbles. Te explicamos cómo DMARC frena los que usan tu dominio exacto y qué ataques no detiene."
resumen: "DMARC frena la suplantación de tu dominio exacto: indica a Gmail, Outlook, Yahoo y otros receptores qué hacer con los correos que usan tu dominio en el campo \"De\" y no pueden probarlo con SPF o DKIM. Como no evalúa el texto, da igual lo bien redactado que esté un correo falso hecho con IA. DMARC no frena los dominios parecidos ni el nombre visible falso. Tampoco frena los correos que salen de cuentas comprometidas de tu empresa, que suelen pasar SPF, DKIM y DMARC porque se envían desde la infraestructura legítima. La protección llega con las políticas quarantine y reject; p=none solo da visibilidad. La autenticación multifactor ayuda a proteger las cuentas contra el compromiso. Ante dominios parecidos y nombres visibles falsos, verifica por otro canal, como una llamada a un número conocido, cualquier cambio de cuenta bancaria o pago urgente."
category: Seguridad
date: 2026-10-22
updated: 2026-10-22
tags: [phishing, inteligencia-artificial, dmarc, suplantacion, fraude-del-ceo, empresas]
keyword_objetivo: phishing con inteligencia artificial
draft: false
audio_alias:
  "I-120324-PSA": "i guion uno dos cero tres dos cuatro, pe ese a"
  "550; 5.7.515": "quinientos cincuenta, cinco punto siete punto quinientos quince"
  "v=DMARC1": "ve igual di marc uno"
  '_dmarc.ejemplo.cl TXT "v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl"': "un registro TXT en guion bajo di marc punto ejemplo punto ce ele, con ve igual di marc uno, pe igual none, y los reportes rua a di marc arroba ejemplo punto ce ele"
---

Un proveedor recibe un correo de `facturacion@ejemplo.cl` que le pide pagar la próxima factura a una cuenta bancaria nueva. Está bien escrito, en buen español y con el tono de siempre. Es un ejemplo, no un caso real, pero resume el phishing con inteligencia artificial: correos falsos que ya no se delatan por la forma. La IA no inventó el phishing, pero, como advierte el [FBI](https://www.ic3.gov/PSA/2024/PSA241203), lo hace más creíble y más rápido de producir. Aquí verás qué parte de ese problema puede frenar DMARC, qué parte no y por dónde empezar.

## Qué cambia con el phishing con inteligencia artificial

### Correos sin las señales de siempre

El **phishing** es un correo falso que busca que alguien entregue datos, haga un pago o abra un enlace malicioso. En diciembre de 2024, el FBI advirtió que los delincuentes usan IA generativa para crear mensajes creíbles de ingeniería social (engaños que se apoyan en la confianza), llegar más rápido a más personas y traducir textos con menos errores gramaticales u ortográficos ([FBI IC3, alerta I-120324-PSA](https://www.ic3.gov/PSA/2024/PSA241203)).

Por eso, "fíjate en las faltas de ortografía" ya no basta como consejo.

### Lo que dicen las cifras

Las cifras del [informe 2025 del IC3](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf), el centro de denuncias del FBI, corresponden a **denuncias recibidas por el FBI, principalmente de Estados Unidos**. No son cifras de Latinoamérica.

- **Phishing/spoofing** fue el tipo de delito con más denuncias: 191.561.
- El **fraude del CEO por correo**, que el FBI llama *business email compromise* (BEC), sumó 24.768 denuncias y USD 3.046.598.558 en pérdidas declaradas, el segundo tipo de delito con más pérdidas.
- Por primera vez, el informe incluye una sección sobre IA: 22.364 denuncias marcadas como relacionadas con IA y USD 893.346.472 en pérdidas ([comunicado del FBI](https://www.fbi.gov/news/press-releases/cryptocurrency-and-ai-scams-bilk-americans-of-billions)).

## El ataque que DMARC sí frena: la suplantación de tu dominio exacto

### Cualquiera puede escribir tu dominio en el campo "De"

El correo permite poner cualquier dirección como remitente. Por eso un correo puede decir que viene de `pagos@ejemplo.cl` sin haber salido de tu empresa. Eso es la **suplantación de dominio de correo**, o *spoofing*: tus clientes pueden recibir instrucciones de pago falsas con tu dirección exacta.

### Cómo lo frena DMARC

DMARC se apoya en dos controles:

- **SPF:** la lista, publicada en tu dominio, de los servidores autorizados a enviar correo en tu nombre.
- **DKIM:** una firma digital en cada correo que prueba que viene de tu dominio.

**DMARC** es una regla publicada en tu dominio que pide a Gmail, Outlook, Yahoo y otros qué hacer con los correos que dicen ser tuyos y no lo pueden probar con SPF o DKIM, con el mismo dominio que aparece en "De" ([Google](https://support.google.com/a/answer/81126?hl=es-419)). El estándar actual, el [RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.txt) de mayo de 2026, dice que DMARC está diseñado para impedir el uso no autorizado del dominio del autor, lo que se conoce como *spoofing* (sección 2.2).

La regla tiene tres niveles: `p=none` (solo observar), `p=quarantine` (tratar como sospechoso, por ejemplo enviar a spam) y `p=reject` (rechazar). Con `p=reject`, los proveedores que aplican DMARC pueden rechazar los correos que suplantan tu dominio exacto antes de entregarlos. CISA, la agencia de ciberseguridad de Estados Unidos, junto con la NSA, el FBI y el MS-ISAC, recomienda configurar DMARC en "reject" para el correo que envía tu organización ([guía de CISA](https://www.cisa.gov/sites/default/files/2023-10/Phishing%20Guidance%20-%20Stopping%20the%20Attack%20Cycle%20at%20Phase%20One_508c.pdf), p. 6).

Da igual lo bien redactado que esté el correo falso: DMARC no evalúa el texto, sino si puede probar que viene de tu dominio. Por eso la IA no cambia esta parte de la ecuación.

> **Advertencia:** si tu CRM o tu sistema de facturación no pasan SPF o DKIM con tu dominio, `p=reject` también puede rechazar sus correos legítimos.

### Una protección para tus clientes y proveedores

DMARC protege sobre todo a quienes **reciben** correos con tu nombre: clientes, proveedores y tu equipo. Los reportes de DMARC te ayudan a identificar a quien podría estar suplantando tu dominio ([Google](https://support.google.com/a/answer/81126?hl=es-419)).

## Lo que DMARC no frena

El RFC 9989 dice que DMARC solo puede usarse para combatir directamente formas específicas de suplantación del dominio exacto. No aborda los dominios visualmente parecidos ni el abuso del nombre visible ([RFC 9989](https://www.rfc-editor.org/rfc/rfc9989.txt), sección 2.2).

### Dominios parecidos

Un atacante registra `ejemplo-cl.com` (dominio de ejemplo) o cambia una letra del tuyo. Ese dominio es suyo y puede tener SPF, DKIM y DMARC en regla. Tu DMARC no lo cubre.

### Nombre visible falso

El correo muestra "Gerencia de Finanzas Ejemplo", pero la dirección es otra. El RFC 9989 deja estos ataques al nombre visible fuera del alcance de DMARC (secciones 2.4 y 11.4).

### Cuentas comprometidas

Si roban la contraseña de una cuenta de tu empresa, los correos salen de tu propio servidor y pasan SPF, DKIM y DMARC. El FBI describe que el fraude del CEO se lleva a cabo comprometiendo cuentas de correo y otros medios mediante ingeniería social o intrusión ([informe IC3 2025](https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf), p. 59).

Aquí ayuda la **autenticación multifactor (MFA)**, que pide un segundo paso además de la contraseña. CISA señala que reduce el uso de credenciales robadas, pero que sus formas débiles (SMS, voz o notificaciones push sin coincidencia de números) se pueden eludir ([guía de CISA](https://www.cisa.gov/sites/default/files/2023-10/Phishing%20Guidance%20-%20Stopping%20the%20Attack%20Cycle%20at%20Phase%20One_508c.pdf), p. 4).

DMARC es **una capa**, no la solución al phishing. Acuerda con tu equipo que todo cambio de cuenta bancaria o pago urgente se confirme por otro canal, como una llamada a un número conocido, en línea con el consejo del FBI de verificar la identidad cortando y llamando directamente a la organización ([FBI IC3](https://www.ic3.gov/PSA/2024/PSA241203)).

## Gmail, Yahoo y Outlook ya piden DMARC a quienes envían mucho

No aplica a todas las empresas:

- **Gmail:** desde el 1 de febrero de 2024, Google pide a quienes envían más de 5.000 mensajes al día a cuentas personales de Gmail que tengan SPF, DKIM y DMARC (la política puede ser `none`), con el dominio del "De" alineado con SPF o DKIM ([Google](https://support.google.com/a/answer/81126?hl=es-419)).
- **Yahoo:** pide a los remitentes masivos una política DMARC válida de al menos `p=none` que pase ([Yahoo](https://senders.yahooinc.com/best-practices/)).
- **Outlook.com** (hotmail.com, live.com y outlook.com): exige SPF, DKIM y DMARC de al menos `p=none` a los dominios que envían más de 5.000 correos al día. Según la actualización del 29 de abril de 2025, desde mayo de 2025 los mensajes que no cumplan se rechazan con el error `550; 5.7.515`; es decir, no llegan ([Microsoft](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)).

Ojo: `p=none` cumple estos requisitos, pero **no frena la suplantación**; solo da visibilidad. La protección llega con `quarantine` y `reject`.

## Cómo empezar sin cortar tus propios correos

El detalle está en [cómo activar DMARC por etapas](https://www.inboxseguro.com/blog/que-es-dmarc-como-activarlo/). En resumen:

1. **Haz la lista** de lo que envía correo con tu dominio (correo de la empresa, CRM, facturación, newsletter, mesa de ayuda), con un responsable por servicio.
2. **Empieza en `p=none`** para recibir reportes sin cambiar la entrega. Según el RFC 9989, así no pasas por alto ningún servidor o servicio externo (secciones 5.1.4 y 5.1.5).
3. **Corrige los servicios legítimos que fallan.** Por ejemplo, [revisa que DKIM firme con tu dominio](https://www.inboxseguro.com/blog/como-verificar-dkim-de-tu-dominio/).
4. **Avanza a `quarantine` y después a `reject`** cuando los reportes estén limpios. Para dominios cuyos usuarios escriben en listas de correo, el RFC 9989 da como ejemplo al menos un mes en `none` y otro periodo similar en `quarantine` antes de `reject` (sección 7.4).

> **Advertencia:** si un servicio legítimo todavía falla, `quarantine` puede mandar sus correos a spam y `reject` puede hacer que no lleguen. No avances mientras tus herramientas aparezcan con fallas.

Si ya sospechas que te suplantan, revisa [cómo detectar si alguien ya usa tu dominio](https://www.inboxseguro.com/blog/como-saber-si-suplantan-tu-dominio/).

## Para tu equipo técnico

- DMARC actual: RFC 9989 (protocolo), RFC 9990 (reportes agregados) y RFC 9991 (reportes de fallas), de mayo de 2026; reemplazan a RFC 7489 ([dmarc.org](https://dmarc.org/2026/05/ietf-publishes-updated-dmarc-specification/)). Los registros siguen siendo `v=DMARC1`.
- Inicio: `_dmarc.ejemplo.cl TXT "v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl"`.
- La etiqueta `pct` se retiró (RFC 9989, anexo A.6): avanza por etapas, sin porcentajes.

## Cómo ayuda InboxSeguro

InboxSeguro te muestra qué sistemas envían correo con tu dominio y te permite asignar un responsable a cada uno. Te guía en la activación gradual de DMARC, de `p=none` a `quarantine` y después a `reject`, sin cortar correos legítimos. Y detecta intentos de suplantación cuando fallan SPF o DKIM.

**¿Sabes en qué punto está tu dominio?** Revisa gratis si tu dominio está protegido con el [verificador de dominio de InboxSeguro](https://www.inboxseguro.com/domain-checker). Te muestra si tiene SPF, DKIM y DMARC, y qué política usa. No te dice si alguien está suplantando tu dominio en este momento; para eso necesitas leer los reportes de DMARC.

## Fuentes

- FBI IC3, alerta I-120324-PSA (3-12-2024): IA generativa en fraudes y consejo de verificar. https://www.ic3.gov/PSA/2024/PSA241203
- FBI IC3, Internet Crime Report 2025: cifras (pp. 7-8) y definición de BEC (p. 59). https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf
- FBI, comunicado: primera sección sobre IA. https://www.fbi.gov/news/press-releases/cryptocurrency-and-ai-scams-bilk-americans-of-billions
- IETF, RFC 9989 (mayo de 2026): alcance de DMARC, etapas y retiro de `pct`. https://www.rfc-editor.org/rfc/rfc9989.txt
- RFC Editor y dmarc.org: publicación de RFC 9989, 9990 y 9991. https://www.rfc-editor.org/subjects/dmarc/ · https://dmarc.org/2026/05/ietf-publishes-updated-dmarc-specification/
- Google, lineamientos para remitentes: requisitos de Gmail e informes DMARC. https://support.google.com/a/answer/81126?hl=es-419
- Yahoo Sender Hub: requisitos de Yahoo. https://senders.yahooinc.com/best-practices/
- Microsoft, requisitos de Outlook.com (2-4-2025, actualizado 29-4-2025). https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730
- CISA, NSA, FBI y MS-ISAC, guía de phishing (octubre de 2023): DMARC en "reject" (p. 6) y MFA (p. 4). https://www.cisa.gov/sites/default/files/2023-10/Phishing%20Guidance%20-%20Stopping%20the%20Attack%20Cycle%20at%20Phase%20One_508c.pdf

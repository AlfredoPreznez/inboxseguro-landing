---
title: "Reputación de dominio de correo: qué revisar"
slug: reputacion-de-dominio-de-correo
description: "Qué es la reputación de dominio de correo, qué cambió en Google Postmaster Tools y qué señales revisar hoy en Gmail, Outlook y listas negras."
excerpt: "Google retirará los paneles de reputación de Postmaster Tools. Qué mirar en su lugar: tasa de spam, autenticación, errores de entrega y listas negras."
category: Entregabilidad
date: 2026-11-12
updated: 2026-11-12
tags: [reputacion, postmaster-tools, gmail, outlook, listas-negras, entregabilidad, empresas]
keyword_objetivo: reputación de dominio de correo
featured: false
resumen: "La reputación de dominio de correo es la valoración que hacen Gmail, Outlook y otros receptores según cómo envías. Google anunció que los paneles Reputación del dominio y Reputación de las IPs de Postmaster Tools se retirarán, aunque pospuso la discontinuación de la interfaz antigua. Hoy conviene revisar el panel Estado de cumplimiento, la tasa de spam, la autenticación SPF, DKIM y DMARC, los errores de entrega, SNDS de Microsoft y las listas negras."
faq:
  - q: "¿Google eliminó ya el panel de reputación de Postmaster Tools?"
    a: "Google anunció que los paneles Reputación del dominio y Reputación de las IPs se retirarán y que no están en la versión 2 de Postmaster Tools. También indicó que pospuso la discontinuación de la interfaz antigua y que compartirá más información sobre los plazos."
  - q: "¿Qué tasa de spam recomienda Google?"
    a: "Las directrices de Google piden mantener la tasa de spam que muestra Postmaster Tools por debajo del 0,30 %. Como buena práctica, recomiendan mantenerla por debajo del 0,10 % y evitar que llegue al 0,30 % o lo supere."
  - q: "¿Cómo reviso mi reputación en Outlook?"
    a: "Microsoft ofrece SNDS (Smart Network Data Services), que entrega datos sobre las IP desde las que envías a Outlook.com. Tienes que iniciar sesión con una cuenta Microsoft y pedir acceso a las IP de las que eres responsable."
draft: false
---

Un cliente te escribe que tus cotizaciones le están llegando a spam. Revisas la configuración y todo parece en orden. Una posible causa es la **reputación de dominio de correo**: la valoración que hacen Gmail, Outlook y otros receptores según cómo envía correo tu empresa.

Muchas empresas la revisaban en el panel de reputación de Google Postmaster Tools, que Google anunció que retirará. Aquí verás qué cambió y qué revisar hoy.

> **¿Tienes prisa?** Revisa si tu dominio o tu IP aparece en 6 listas negras públicas con el [verificador de listas negras](/verificar-lista-negra).

## Qué es la reputación de un dominio de correo

### Una valoración según tu forma de enviar

Google la define en la ayuda de Postmaster Tools: la reputación es una valoración de la calidad de los dominios y las direcciones IP que envían correo, y depende del comportamiento de envío. Una **dirección IP** es el número que identifica al servidor que entrega tus correos.

Según Google, los proveedores de internet y de correo monitorean la reputación de los remitentes. Los mensajes de remitentes con buena reputación tienen más probabilidades de llegar a la bandeja de entrada de Gmail en lugar de a spam.

### Qué la afecta

Las directrices de Google para remitentes mencionan varios factores:

- **Denuncias de spam.** Si los destinatarios marcan tus correos como spam con frecuencia, con el tiempo eso puede perjudicar la reputación de tu dominio.
- **IP compartidas.** Si tu proveedor de correo usa una IP compartida, la actividad de todos los que la usan afecta la reputación de todos.
- **Picos de volumen.** Duplicar de golpe lo que envías, sin historial de grandes volúmenes, puede provocar límites de envío o bajas de reputación.
- **Pruebas desde tu dominio.** Enviar pruebas de phishing desde tu dominio puede afectar su reputación.

## Qué cambió en Google Postmaster Tools

**Postmaster Tools** es la herramienta de Google que muestra datos sobre los correos que envías a cuentas personales de Gmail.

### Los paneles de reputación se retirarán

En su página sobre la discontinuación de la interfaz antigua, Google explica que todos los paneles de la versión antigua están disponibles en la versión 2 de Postmaster Tools, lanzada en 2024, salvo **Reputación del dominio** y **Reputación de las IPs**, que se retirarán. Según Google, esos datos son difíciles de usar para actuar, tardan en reflejar los cambios y pueden inducir a error, porque la reputación es solo uno de muchos factores que afectan la entrega.

### La interfaz antigua sigue, por ahora

Google indica textualmente: "Gracias a los comentarios de los remitentes, vamos a posponer la discontinuación de la interfaz web antigua de Postmaster Tools". También recomienda pasarse a la versión 2, porque la versión antigua acabará retirándose, y dice que pronto dará más información sobre los plazos. Google no ha publicado una fecha.

### El nuevo panel Estado de cumplimiento

La versión 2 incluye el panel **Estado de cumplimiento** (Compliance status), que muestra si tus correos cumplen las directrices de Google para remitentes. Cada requisito aparece con uno de tres estados:

- **Conforme** (Compliant): no hace falta hacer nada.
- **Necesita mejorar** (Needs work): hay que corregir algo; la columna Estado describe qué hacer. Tras corregirlo, el cambio puede tardar hasta 7 días en verse en el panel.
- **No se han encontrado datos** (No data found): la ayuda de Google no define este estado con claridad. Indica que debería haber suficientes correos para evaluar el cumplimiento de ese requisito, y que el cumplimiento se calcula con los correos recibidos que cumplen ciertos criterios.

Ten en cuenta estos límites, según la ayuda de Google:

- Los datos corresponden solo a correos enviados a cuentas personales de Gmail.
- No son en tiempo real: normalmente se actualizan en 24 horas, pero pueden tardar más.
- El panel muestra el estado del dominio principal, no de los subdominios. Si agregas `correo.ejemplo.cl`, verás el estado de todo `ejemplo.cl`.
- En los requisitos de DNS, el estado refleja la configuración que Google vio al recibir tus correos, no necesariamente la actual.

## Qué mirar hoy en lugar del semáforo de reputación

### Tasa de spam

Es el porcentaje de mensajes entregados a la bandeja de entrada que los destinatarios marcan como spam en Gmail. Las directrices de Google piden a todos los remitentes mantener la tasa de spam que muestra Postmaster Tools por debajo del 0,30 %. Como buena práctica, Google recomienda mantenerla por debajo del 0,10 % y evitar que llegue al 0,30 % o lo supere.

Ojo: según Google, una tasa muy baja puede significar que Gmail ya envía muchos de tus correos a spam, y por eso menos destinatarios los ven en su bandeja y los denuncian.

### Autenticación SPF, DKIM y DMARC

Son tres registros que publicas en el **DNS**, el sistema que guarda la información pública de tu dominio:

- **SPF** indica qué servidores pueden enviar correo con tu dominio.
- **DKIM** agrega una firma digital que demuestra que el mensaje no se alteró.
- **DMARC** le dice al receptor qué hacer si un correo con tu dominio no pasa esas revisiones.

Google pide SPF o DKIM a todos los remitentes. A quienes envían más de 5.000 mensajes al día a cuentas de Gmail les pide SPF, DKIM y DMARC (este último puede estar en `p=none`), y que el dominio del remitente visible coincida con el de SPF o DKIM. En Postmaster Tools, el panel **Autenticación** muestra qué porcentaje de tus correos pasa SPF, DKIM y DMARC. Puedes revisar tu configuración con el [verificador de dominio](/domain-checker) y el [verificador DMARC](/dmarc-checker).

### Errores de entrega

El panel **Errores de entrega** muestra el porcentaje de mensajes autenticados (SPF o DKIM) que Gmail rechazó o que fallaron temporalmente, frente al total de autenticados, y el motivo. Si ves rechazos, lee el rebote completo. Por ejemplo, el [error 550 5.7.26 de Gmail](/blog/error-550-5-7-26-gmail-dmarc/) tiene su propia guía.

### Cumplimiento de las pautas

El panel Estado de cumplimiento también revisa los registros DNS, el formato de los mensajes, el cifrado de la conexión y, para quienes envían en gran volumen, la baja con un clic. Si algún requisito aparece en "Necesita mejorar", ese es el primer punto para corregir.

## Microsoft: SNDS para revisar tus IP

Para Outlook.com, Microsoft ofrece **SNDS** (Smart Network Data Services). Su página oficial dice que la entrega a Outlook.com depende de tu reputación y que SNDS te da datos para entenderla y mejorarla.

Lo que indica esa página:

- Entrega datos sobre **IP individuales**, no sobre dominios.
- Para usarlo, inicias sesión con una cuenta Microsoft y pides acceso a las IP de las que eres responsable.
- Incluye un programa que te avisa cuando los usuarios marcan tus mensajes como correo no deseado.
- Ayuda a detectar servidores comprometidos y malware.

Microsoft agrega que la reputación siempre es responsabilidad del remitente.

## Las listas negras, otra señal

Una **lista negra** (DNSBL o [RBL](/glosario/rbl/)) es una lista pública de IP o dominios asociados a spam u otros abusos. La RFC 5782 describe cómo funcionan: se consultan a través del DNS y existen listas de IP (sección 2) y de dominios (sección 3).

Según la misma RFC (sección 6), algunos servidores rechazan la conexión si encuentran la IP en una lista, y otros usan el resultado como un factor más de un puntaje. Google también lo advierte: los correos enviados desde IP incluidas en listas de bloqueo tienen más probabilidades de marcarse como spam.

Consulta tu dominio o tu IP en el [verificador de listas negras](/verificar-lista-negra) y, si aparece, sigue la guía de [lista negra de dominio](/blog/como-saber-si-mi-dominio-esta-en-lista-negra/) o la de [lista negra de IP](/blog/como-saber-si-mi-ip-esta-en-lista-negra/).

## Qué hacer si tu reputación es mala

### 1. Autentica tu dominio

Revisa que SPF y DKIM estén bien configurados y que exista un registro DMARC. Si tus correos llegan a spam, lee también [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

### 2. Revisa quién envía con tu dominio

Además de tu correo corporativo, pueden enviar con tu dominio el CRM, el sistema de facturación o la herramienta de marketing. Las directrices de Google dicen que tu registro SPF debe incluir a todos los que envían correo con tu dominio. Te explicamos cómo encontrarlos en [quién está enviando correos con mi dominio](/blog/quien-esta-enviando-correos-con-mi-dominio/).

### 3. Avanza con DMARC de forma gradual

La RFC 9989, que reemplazó a la RFC 7489 como estándar de DMARC, recomienda empezar con `p=none`, que solo monitorea, y usar los informes para encontrar servidores o servicios olvidados (secciones 5.1.4 y 5.1.5). Los flujos de correo legítimos que no pasen deben corregirse antes de pasar a `p=quarantine` (enviar a spam) o `p=reject` (rechazar), según la sección 5.1.6. La sección 5.1.7 advierte que esto puede tomar muchos meses.

> **Advertencia:** si pasas a `p=quarantine` o `p=reject` antes de autenticar todos tus sistemas, puedes cortar correos legítimos, como facturas o avisos a clientes. Avanza paso a paso.

### 4. Cuida cómo envías

Envía solo a quienes quieren recibir tus mensajes y evita los picos bruscos de volumen. Según Google, las mejoras en la tasa de spam tardan en reflejarse.

## Cómo ayuda InboxSeguro

InboxSeguro no mide tu reputación en Google ni en Microsoft; para eso están Postmaster Tools y SNDS. Lo que hace es ayudarte con las causas que puedes controlar:

- Te muestra qué sistemas envían correo con tu dominio y te permite asignar un responsable a cada uno.
- Te guía para avanzar con DMARC de `p=none` a `quarantine` y `reject` sin cortar correos legítimos.
- Detecta posibles suplantaciones de tu dominio.
- Muestra el estado DNS de SPF, DKIM, DMARC, BIMI, MTA-STS y RUA.
- Monitorea cada hora 6 listas negras y te guía para pedir la remoción.

## Fuentes

- [Google: Información sobre la discontinuación de la interfaz antigua de Postmaster Tools](https://support.google.com/mail/answer/16594218?hl=es).
- [Google: Paneles de control de Postmaster Tools](https://support.google.com/mail/answer/14668346?hl=es), secciones Estado de cumplimiento, Tasa de spam, Autenticación, Errores de entrega y Reputación.
- [Google: Directrices para remitentes de correo](https://support.google.com/mail/answer/81126?hl=es).
- [Google for Developers: Migrate to Postmaster Tools API v2](https://developers.google.com/workspace/gmail/postmaster/guides/migration-v2).
- [Microsoft: Outlook.com Smart Network Data Services (SNDS)](https://sendersupport.olc.protection.outlook.com/snds/).
- [RFC 5782: DNS Blacklists and Whitelists](https://www.rfc-editor.org/rfc/rfc5782), secciones 2, 3 y 6.
- [RFC 9989: DMARC](https://www.rfc-editor.org/rfc/rfc9989), secciones 5.1.4 a 5.1.7. Reemplaza a la [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489).

---
title: "Cómo saber si mi IP está en lista negra"
slug: como-saber-si-mi-ip-esta-en-lista-negra
description: "Cómo encontrar la IP pública desde la que sale tu correo, consultarla en listas negras y qué hacer si aparece listada, sin adivinar."
excerpt: "Qué IP revisar, cómo encontrarla en el rebote o en la cabecera de un correo, cómo consultarla y qué hacer según quién la administre."
category: Entregabilidad
date: 2026-11-03
updated: 2026-11-03
tags: [listas-negras, blacklist, ip, dnsbl, entregabilidad, empresas]
keyword_objetivo: cómo saber si mi IP está en lista negra
featured: false
resumen: "Para saber si tu IP está en lista negra, primero identifica la IP pública del servidor que entrega tus correos: aparece en el mensaje de rebote o en la línea Received que agregó el servidor del destinatario. Luego consúltala en las listas negras. Si la IP es de tu proveedor, pídele a él que gestione la salida; si es tuya, corrige la causa antes de pedirla, porque si no la IP puede volver a bloquearse."
faq:
  - q: "¿Mi IP de la oficina puede estar en lista negra si uso un proveedor de correo?"
    a: "Puede, pero normalmente no es la que importa para tus correos: los destinatarios ven la IP del servidor de tu proveedor, que es el que entrega el mensaje. La IP de la oficina importa si tienes un servidor de correo propio o si un equipo de tu red está comprometido, porque algunas listas tienen sublistas de equipos comprometidos por malware."
  - q: "¿Cuánto tarda Microsoft en quitar una IP?"
    a: "Si usas el portal sender.office.com, Microsoft indica que los resultados varían y que puede tardar hasta 24 horas o más. Si el error es 5.7.511, debes escribir a delist@microsoft.com y Microsoft indica que te contactará dentro de 48 horas con los siguientes pasos."
  - q: "¿Estar en una lista negra siempre bloquea mis correos?"
    a: "No siempre. Según la RFC 5782, algunos servidores rechazan la conexión si la IP está listada, y otros usan el resultado como un factor más de un puntaje. En ese caso tus correos pueden llegar, pero a la carpeta de spam."
audio_alias:
  "550 5.7.606-649 Access denied, banned sending IP [IP]": "quinientos cincuenta, cinco punto siete punto seiscientos seis a seiscientos cuarenta y nueve: Access denied, banned sending IP"
  "550 5.7.606-649": "quinientos cincuenta, cinco punto siete punto seiscientos seis a seiscientos cuarenta y nueve"
  "550 5.7.1": "quinientos cincuenta, cinco punto siete punto uno"
  "5.7.511": "cinco punto siete punto quinientos once"
  "203.0.113.25": "doscientos tres punto cero punto ciento trece punto veinticinco"
  "192.0.2.44": "ciento noventa y dos punto cero punto dos punto cuarenta y cuatro"
  "192.0.2.99": "ciento noventa y dos punto cero punto dos punto noventa y nueve"
  "99.2.0.192.bad.example.com": "noventa y nueve punto dos punto cero punto ciento noventa y dos punto bad punto example punto com"
  "2001:db8:1:2:3:4:567:89ab": "una dirección IPv6 de ejemplo"
  "delist@microsoft.com": "delist arroba microsoft punto com"
draft: false
---

Un cliente te avisa que no le llegó la factura. En tu bandeja encuentras un rebote, el aviso automático de que un correo no se pudo entregar, con una dirección IP entre corchetes. La duda es inmediata: ¿está mi IP en una [lista negra](/glosario/rbl/)?

La IP que importa es la del servidor que entrega tus correos al destinatario, que no siempre es la de tu oficina. Esta guía te explica cómo encontrarla, cómo consultarla y qué hacer según quién la administre. Si quieres entender qué es una lista negra y por qué una empresa cae en una, lee primero [cómo saber si mi dominio está en lista negra](/blog/como-saber-si-mi-dominio-esta-en-lista-negra/).

> **¿Tienes prisa?** Ingresa tu IP (IPv4) o tu dominio en el [verificador de listas negras](/verificar-lista-negra) y revisa si aparece en 6 listas negras públicas.

## Qué IP tienes que revisar

### La del servidor que se conecta al destinatario

Una **dirección IP** es el número que identifica a un equipo en internet. Para entregar tu correo, un servidor se conecta al servidor del destinatario. Según la RFC 5321, el estándar del correo electrónico, el servidor que recibe registra la IP de origen tomada de esa conexión (sección 4.4). Esa es la IP pública que el destinatario ve y la que puede consultar en una lista negra.

### Si usas un proveedor de correo, la IP es de él

Si tu empresa envía con un proveedor de correo o con una plataforma de envío, la IP que entrega tus mensajes es de ese proveedor y suele ser compartida con otros clientes. Google lo explica en sus directrices para remitentes: la actividad de todos los remitentes que usan una IP compartida afecta la reputación de todos ellos, y una reputación negativa puede afectar la entrega.

### Cuándo importa la IP de tu oficina

La IP pública de tu oficina importa si tienes un servidor de correo propio o si un equipo de tu red está comprometido. La RFC 5782, que describe cómo funcionan las listas negras, menciona como ejemplo listas que tienen sublistas para direcciones incluidas por política de envío y para equipos comprometidos por *malware* (sección 2.3).

## Cómo encontrar la IP desde la que salen tus correos

### En el mensaje de rebote

Muchas veces el propio rebote trae la IP:

- **Microsoft 365.** Si estás en su lista de remitentes bloqueados, el rebote se ve así: `550 5.7.606-649 Access denied, banned sending IP [IP]`. La IP que aparece entre corchetes es la bloqueada.
- **Gmail.** Google documenta el error `550 5.7.1` para mensajes rechazados porque la IP del servidor que envía está en una lista de IP suspendidas. Puede ocurrir si envías desde una IP compartida con mala reputación.

> **Advertencia:** Google también usa `550 5.7.1` para errores de IPv6 relacionados con registros PTR y autenticación. Lee el texto completo del rebote antes de concluir que se trata de una lista negra.

### En la cabecera completa de un correo enviado

La **cabecera** es la parte oculta de un correo que registra por dónde pasó. Para verla, envía un correo desde tu cuenta de trabajo a una cuenta de Gmail y, según la ayuda de Google:

1. Abre el correo en Gmail desde un navegador.
2. Al lado de Responder, haz clic en **Más** y luego en **Mostrar original**.
3. Haz clic en **Copiar en el portapapeles**.

Si prefieres que una herramienta la ordene, Google ofrece **Messageheader**, de la Caja de herramientas de Google Admin: pegas la cabecera y haces clic en "Analizar la cabecera anterior". En Outlook, abre el correo y ve a **Archivo > Propiedades**: la cabecera aparece en el cuadro "Encabezados de Internet".

Dentro de la cabecera, busca las líneas que empiezan con `Received`. Según la RFC 5321 (sección 4.4), cada servidor que recibe el mensaje agrega su línea al inicio y no puede cambiar ni reordenar las anteriores. Además, esa línea debería indicar el nombre del servidor que se conectó y su IP. Por eso, la línea de más arriba la agregó el servidor del destinatario, y la IP que aparece en su parte `from` es la que entregó tu correo.

Un ejemplo ficticio y simplificado:

```
Received: from mail.ejemplo.cl (mail.ejemplo.cl [203.0.113.25])
        by mx.example.com; Mon, 3 Nov 2026 10:15:02 -0300
Received: from [192.0.2.44]
        by mail.ejemplo.cl; Mon, 3 Nov 2026 10:15:01 -0300
```

Aquí, `mx.example.com` es el servidor del destinatario, y anotó que recibió el correo desde `203.0.113.25`. Esa es la IP que debes consultar. La segunda línea muestra el paso anterior: el equipo `192.0.2.44` de la oficina entregó el mensaje al servidor de correo de la empresa.

### Si tienes varias plataformas de envío

Cada plataforma puede enviar desde IP distintas. Si tu empresa usa un CRM, un sistema de facturación y una herramienta de marketing, revisa la cabecera de un correo enviado por cada una. Para ver qué servicios podrían estar autorizados a enviar con tu dominio, usa [quién puede enviar correos](/quien-puede-enviar-correos).

## Cómo consultar si la IP está en lista negra

### Qué pasa por dentro

Las listas negras se publican en el **DNS**, el sistema que guarda la información pública de los dominios. Según la RFC 5782 (sección 2.1), para consultar una IPv4 se invierte el orden de sus números y se agrega el nombre de la lista: si la lista es `bad.example.com` y la IP es `192.0.2.99`, se consulta `99.2.0.192.bad.example.com`. Con **IPv6**, el formato de direcciones más largo, se usan sus 32 dígitos hexadecimales invertidos más el nombre de la lista; la RFC pone como ejemplo la dirección `2001:db8:1:2:3:4:567:89ab` (sección 2.4).

Si hay respuesta, la IP está listada; si no hay ningún registro, no lo está. La lista además debería publicar un texto con el motivo, que muchas veces incluye un enlace con más información (sección 2.1). El detalle está en el [artículo sobre listas negras de dominio](/blog/como-saber-si-mi-dominio-esta-en-lista-negra/).

### Con el verificador de InboxSeguro

En el [verificador de listas negras](/verificar-lista-negra) ingresas una IPv4 o tu dominio, y la herramienta consulta en el momento 6 listas: Spamcop, Barracuda, PSBL, Mailspike, DroneBL y Backscatterer. Si escribes un dominio, revisa las IP de sus servidores MX y de su registro A, hasta 6.

> **Advertencia:** los servidores MX indican dónde recibe correo tu dominio, no necesariamente desde dónde sale. Si envías con un proveedor, consulta también la IP que encontraste en el rebote o en la cabecera. Puedes ver tus MX con el [MX Lookup](/mx-lookup).

### Para Gmail: Postmaster Tools

Si muchos de tus destinatarios usan Gmail, Google recomienda Postmaster Tools, que muestra la reputación de tu dominio y de tu IP, si tus mensajes están autenticados y por qué algunos no se entregan.

## Qué significa el resultado

### Tu IP aparece en una lista

No siempre significa que tus correos se rechacen. La RFC 5782 (sección 6) describe dos usos: algunos servidores rechazan la conexión cuando encuentran la IP en una lista, y otros usan el resultado como un factor más de un puntaje. En ese segundo caso, tus correos pueden llegar, pero a la carpeta de spam.

### Tu IP no aparece, pero los correos rebotan o llegan a spam

Revisa la autenticación de tu dominio y el **registro PTR**, que asocia una IP con un nombre de servidor. Google exige que la IP pública que envía tenga un PTR que apunte a un nombre de servidor, y que ese nombre apunte de vuelta a la misma IP. Revisa tu configuración con el [verificador de dominio](/domain-checker) y lee [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## Qué hacer si tu IP está listada

### 1. Si la IP es compartida de tu proveedor

Avísale a tu proveedor y pídele que gestione la salida, porque la IP es de él y la comparten otros clientes.

### 2. Si la IP es tuya

Corrige la causa antes de pedir la salida. Revisa si hay una cuenta con la contraseña comprometida o un equipo de la red infectado que esté enviando correo.

### 3. Si te bloqueó Microsoft 365

Si recibiste el error `550 5.7.606-649`, Microsoft ofrece un portal en [sender.office.com](https://sender.office.com):

1. Ingresa la dirección que recibió el rebote y la IP que indica el error. Solo puedes poner un correo y una IP por visita.
2. Abre el enlace de confirmación que llega a ese correo.
3. En el portal, selecciona **Delist IP**.

Según Microsoft, los resultados varían y la salida puede tardar hasta 24 horas o más. Si el error es `5.7.511`, el portal no sirve: escribe a delist@microsoft.com con el código completo del rebote y la IP. Microsoft indica que te contactará dentro de 48 horas.

### 4. Si es una lista externa

Cada lista tiene su propio procedimiento: la RFC 5782 no define reglas para entrar o salir de ellas (sección 1). Sigue el enlace que suele venir en el texto del listado.

> **Advertencia:** si pides la salida sin corregir la causa, la IP puede volver a bloquearse. Microsoft lo dice expresamente: verifica que los mensajes no sean abusivos ni maliciosos, porque de lo contrario la IP podría bloquearse otra vez.

## Monitorea tus IP con InboxSeguro

Para una revisión puntual, usa el [verificador de listas negras](/verificar-lista-negra), que muestra el estado de ese momento. El monitoreo de InboxSeguro revisa cada hora 6 listas (Spamcop, Barracuda, PSBL, Mailspike, DroneBL y Backscatterer) y te guía para pedir la remoción. Además, te muestra qué sistemas envían correo con tu dominio y te permite asignar un responsable a cada uno.

## Fuentes

- [RFC 5782: DNS Blacklists and Whitelists](https://www.rfc-editor.org/rfc/rfc5782), secciones 1, 2.1, 2.3, 2.4 y 6.
- [RFC 5321: Simple Mail Transfer Protocol](https://www.rfc-editor.org/rfc/rfc5321#section-4.4), sección 4.4 (pp. 57-58).
- [Google: Rastrear un correo mediante su cabecera completa](https://support.google.com/mail/answer/29436?hl=es).
- [Google: Directrices para remitentes de correos](https://support.google.com/a/answer/81126?hl=es).
- [Microsoft Learn: Use the delist portal to remove yourself from the blocked senders list and address 5.7.511 Access denied errors](https://learn.microsoft.com/en-us/defender-office-365/external-senders-use-the-delist-portal-to-unblock-yourself).
- [InboxSeguro: Verificador de listas negras](https://www.inboxseguro.com/verificar-lista-negra).

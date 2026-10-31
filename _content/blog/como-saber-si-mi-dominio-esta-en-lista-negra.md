---
title: "Cómo saber si mi dominio está en lista negra"
slug: como-saber-si-mi-dominio-esta-en-lista-negra
description: "Cómo saber si tu dominio o tu IP está en una lista negra, qué errores revisar en Gmail y Microsoft 365, y cómo pedir la salida sin volver a caer."
excerpt: "Cómo saber si tu dominio o tu IP está en una lista negra, qué errores revisar en Gmail y Microsoft 365, y cómo pedir la salida."
resumen: "Para saber si tu dominio está en una lista negra, primero averigua desde qué IP pública salen tus correos: según la RFC 5782, la mayoría de las listas negras (DNSBL) registran direcciones IP, y las listas de dominios son mucho menos comunes. Luego consulta esa IP, o tu dominio, en un verificador de listas negras y lee el texto completo de los rebotes. En Gmail, el error 550 5.7.1 puede indicar que la IP de envío está en una lista de IP suspendidas. En Microsoft 365, el error 550 5.1.8 no viene de una lista externa: indica que un usuario de tu organización fue restringido por superar los límites de envío. Para Gmail, Google recomienda revisar la reputación de tu dominio y de tu IP en Postmaster Tools. Antes de pedir la salida de una lista, corrige la causa."
category: Entregabilidad
date: 2026-10-19
updated: 2026-10-19
tags: [listas-negras, blacklist, dnsbl, entregabilidad, reputacion, empresas]
keyword_objetivo: cómo saber si mi dominio está en lista negra
draft: false
audio_alias:
  "550 5.1.8 Access denied, bad outbound sender": "quinientos cincuenta, cinco punto uno punto ocho: Access denied, bad outbound sender"
  "550 5.1.8": "quinientos cincuenta, cinco punto uno punto ocho"
  "550 5.7.1": "quinientos cincuenta, cinco punto siete punto uno"
  "Remove-BlockedSenderAddress": "Remove Blocked Sender Address"
  "192.0.2.99": "ciento noventa y dos punto cero punto dos punto noventa y nueve"
  "99.2.0.192.bad.example.com": "noventa y nueve punto dos punto cero punto ciento noventa y dos punto bad punto example punto com"
  "127.0.0.2": "ciento veintisiete punto cero punto cero punto dos"
  "Email & collaboration > Review > Restricted entities": "Email and collaboration, luego Review, luego Restricted entities"
---

Un día, un cliente te dice que no le llegó la factura. Al rato, alguien de ventas recibe un rebote con un código extraño. Si te preguntas cómo saber si tu dominio está en una lista negra, o si la que está bloqueada es la IP desde la que envías, esta guía te explica en lenguaje simple qué son estas listas, por qué una empresa puede terminar en una sin haber enviado spam y qué hacer para salir.

> **¿Necesitas comprobar tu servidor ahora mismo?** Si tus mensajes están rebotando o quieres saber si tu servidor de correo aparece listado, usa directamente nuestro [verificador de listas negras](/verificar-lista-negra).

## Qué es una lista negra de correo (DNSBL)

Una [lista negra](/glosario/rbl/), o *blacklist*, es una lista de direcciones IP o de dominios que alguien considera fuente de correo no deseado. La RFC 5782, que describe cómo funcionan, cuenta que su origen se remonta a 1997, cuando dos ingenieros empezaron a mantener una lista de direcciones IP que les enviaban spam, y explica que el término convencional hoy es DNSBL: *DNS blacklist* o *blocklist* (sección 1).

Se llaman así porque se publican en el DNS, el mismo sistema que traduce nombres de dominio a direcciones. Existen dos tipos:

- **Listas negras de IP.** Son las más comunes: la RFC 5782 indica que la mayoría de las listas todavía usan direcciones IP (sección 2). Incluyen direcciones desde las que se envió spam u otro tráfico considerado abusivo.
- **Listas de dominios.** Algunas listas incluyen nombres de dominio en lugar de IP. La RFC 5782 indica que son mucho menos comunes que las listas negras de IP (sección 3).

Por eso, cuando alguien sospecha de una blacklist de dominio, conviene revisar también si la lista negra incluye la IP pública del servidor que envía sus correos.

## Cómo consultan las listas los servidores de correo

Cuando tu servidor intenta entregar un correo, el servidor que lo recibe puede consultar una o varias listas negras. Según la RFC 5782 (sección 2.1), la consulta se arma invirtiendo los números de la IP y agregando el nombre de la lista. Si la lista se llama `bad.example.com` y la IP es `192.0.2.99`, el servidor pregunta por `99.2.0.192.bad.example.com`.

- Si la IP está listada, la lista responde con un registro (normalmente con el valor `127.0.0.2`). La RFC indica que cualquier respuesta de ese tipo significa que la dirección está listada (sección 6).
- Si no está listada, no debe haber ningún registro para esa dirección (sección 2.1).
- La lista debería publicar además un texto que explique el motivo, que muchas veces incluye la dirección de una página con más información. Ese texto suele aparecer en el mensaje de error que recibe quien envía (sección 2.1).

La RFC 5782 (sección 6) describe dos usos habituales. En uno, el servidor revisa las listas en cada conexión entrante y, si encuentra la IP en una, rechaza la conexión. En el otro, el resultado de la lista es un factor más dentro de un puntaje que decide si el mensaje es spam. Por eso, estar en una lista negra no siempre produce un rechazo: a veces solo hace que tus correos lleguen a spam.

## Por qué tu empresa puede estar listada sin haber enviado spam

### Una IP compartida en tu proveedor

Muchas empresas envían correo desde servidores de un proveedor que comparten la misma IP con otros clientes. Google lo explica en sus directrices para remitentes: la actividad de cualquier remitente que usa una IP compartida afecta la reputación de todos los que la usan. Por eso recomienda que, si usas una IP compartida, te asegures de que no figure en ninguna lista de IP bloqueadas de internet, porque es más probable que los mensajes enviados desde esas direcciones se marquen como spam.

### Una cuenta o un equipo comprometido

Si alguien obtiene la contraseña de una cuenta de tu empresa, puede usarla para enviar spam en tu nombre. Microsoft indica que cuando un usuario supera los límites de envío de su servicio, eso es un indicio de que la cuenta está comprometida. La RFC 5782 (sección 2.3) también menciona, como ejemplo, listas dedicadas a equipos comprometidos por *malware*.

### Prácticas propias que dañan la reputación

Google advierte que no debes enviar mensajes de prueba de phishing ni campañas de prueba desde tu dominio, porque la reputación del dominio puede verse afectada y el dominio podría terminar en listas de bloqueo de internet.

## Qué errores lo delatan

Revisa el mensaje de rebote completo. Estos son los códigos que documentan Google y Microsoft:

- **Gmail: `550 5.7.1`.** Según las directrices de Google, los mensajes se rechazan porque la IP del servidor que envía está en una lista de IP suspendidas, y es posible recibir este error si envías desde una IP compartida con mala reputación. Atención: Google también usa `550 5.7.1` para errores de IPv6 relacionados con registros PTR y autenticación, así que lee el texto completo del rebote.
- **Microsoft 365: `550 5.1.8 Access denied, bad outbound sender`.** Este error no viene de una lista negra externa. Según Microsoft, aparece cuando un usuario de tu propia organización fue restringido por superar los límites de envío. El usuario puede seguir recibiendo correo, pero no enviarlo, y queda en la página de entidades restringidas del portal de Microsoft Defender.

Si el error viene de una lista negra externa, el texto del rebote muchas veces incluye el motivo del listado y, a menudo, un enlace a una página con más información, como describe la RFC 5782 (sección 2.1).

## Cómo consultar una blacklist

Para consultar una blacklist, primero averigua desde qué IP pública salen tus correos; si usas un proveedor o una plataforma de envío, pregúntale. Puedes consultar en tiempo real 6 listas (Spamcop, Barracuda, PSBL, Mailspike, DroneBL, Backscatterer) ingresando la IP o tu dominio en el [verificador de listas negras](/verificar-lista-negra); si se ingresa un dominio, revisa las IP de sus servidores MX y de su registro A (hasta 6).

Para el correo que llega a Gmail, Google recomienda Postmaster Tools, que muestra la reputación de tu dominio y de tu IP, si tus mensajes están autenticados y por qué algunos no se entregan.

Revisa también tu configuración general con el [verificador de dominio](/domain-checker). Si tus correos están llegando a spam sin rebotes, lee [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## Qué hacer para salir de una lista negra

### 1. Corrige la causa primero

Antes de pedir la salida, encuentra qué provocó el listado: una cuenta comprometida, un servicio mal configurado o un proveedor con una IP compartida de mala reputación.

> **Advertencia:** si pides que retiren tu IP o tu usuario antes de corregir la causa, el problema puede repetirse. Microsoft pide recuperar el control de la cuenta comprometida antes de desbloquearla, y su portal de exclusión recuerda que el remitente es responsable de que el correo desde esa IP no sea abusivo ni malicioso.

### 2. Usuarios restringidos en Microsoft 365

Si recibes `550 5.1.8`, un administrador de tu organización puede quitar al usuario de la página de entidades restringidas del portal de Microsoft Defender, en **Email & collaboration > Review > Restricted entities**, o con el comando `Remove-BlockedSenderAddress` de Exchange Online PowerShell. Antes de hacerlo, Microsoft recomienda seguir los pasos para recuperar la cuenta y, en el mismo proceso, activar la autenticación multifactor y restablecer la contraseña. Según Microsoft, en la mayoría de los casos la restricción se elimina en una hora, y la espera total no debería superar las 24 horas.

> **Advertencia:** si desbloqueas al usuario sin cambiar la contraseña ni cerrar el acceso del atacante, la cuenta puede volver a enviar spam y quedar restringida otra vez, cortando también su correo legítimo.

### 3. IP bloqueada por Microsoft 365 u Outlook.com

Si tus correos a destinatarios de Office 365 se rechazan por la IP desde la que envías, Microsoft ofrece un portal de exclusión en [sender.office.com](https://sender.office.com). El proceso tiene tres pasos: ingresas tu dirección de correo y la IP, confirmas tu dirección y luego solicitas la exclusión. Para Outlook.com, Microsoft mantiene un sitio Postmaster dirigido a los profesionales de TI que administran sistemas que envían correo a Outlook.com, con información sobre correos bloqueados o enviados a correo no deseado y sobre los códigos de error SMTP.

### 4. Gmail

Google no describe en sus directrices un formulario para salir de una lista. Lo que sí recomienda es usar Postmaster Tools para revisar la reputación de tu dominio y de tu IP, y verificar que tu proveedor cumpla sus directrices si envías a través de él.

### 5. Listas negras externas

Cada lista tiene su propio procedimiento. La RFC 5782 no define reglas para entrar o salir de una lista (sección 1), así que debes seguir las instrucciones de cada una. El texto que acompaña al listado suele incluir un enlace a la página de la lista con más información (sección 2.1).

Si envías desde una IP compartida de tu proveedor, pídele a él que gestione la salida.

## Monitorea tus listas negras de IP con InboxSeguro

Puedes revisar ahora una IP, o las IP de los servidores de tu dominio, con la herramienta gratuita para [verificar lista negra](/verificar-lista-negra). El monitoreo de InboxSeguro revisa cada hora 6 listas (Spamcop, Barracuda, PSBL, Mailspike, DroneBL y Backscatterer) y te guía para pedir la salida.

---
title: "Qué es una RBL y cómo funciona una lista negra"
slug: que-es-una-rbl-lista-negra-dns
description: "Qué es una RBL o lista negra DNS (DNSBL), cómo la consultan los servidores de correo, qué significa estar listado y qué hacer para salir."
excerpt: "Una RBL es una lista negra publicada en el DNS. Cómo se arma la consulta, qué responde la lista, por qué tus correos rebotan y cómo pedir la salida."
category: Entregabilidad
date: 2026-11-23
updated: 2026-11-23
tags: [rbl, dnsbl, listas-negras, blacklist, dns, entregabilidad, empresas]
keyword_objetivo: qué es una RBL
featured: false
resumen: "Una RBL, o lista negra DNS (DNSBL), es una lista de direcciones IP o de dominios publicada en el DNS que los servidores de correo consultan para decidir si aceptan un mensaje. Según la RFC 5782, la consulta se arma invirtiendo los números de la IP y agregando el nombre de la lista; si hay un registro A, normalmente 127.0.0.2, la IP está listada, y si no hay registros, no lo está. Algunos servidores rechazan la conexión y otros usan el resultado en un puntaje de spam. Si estás listado, corrige la causa antes de pedir la salida en el sitio de cada lista."
faq:
  - q: "¿RBL y DNSBL son lo mismo?"
    a: "En el uso diario, sí: mucha gente llama RBL a cualquier lista negra publicada en el DNS. La RFC 5782 aclara que el término RBL corresponde, en sentido estricto, a la lista original de MAPS, y que el término convencional hoy es DNSBL (DNS blacklist o blocklist)."
  - q: "¿Estar en una RBL significa que todos mis correos rebotan?"
    a: "No necesariamente. Cada servidor decide qué listas consulta. Según la RFC 5782, algunos rechazan la conexión si encuentran la IP en una lista y otros usan el resultado como un factor más de un puntaje. En ese caso el correo puede llegar, pero a spam. Google indica que los mensajes desde IP incluidas en una lista de bloqueadas tienen más probabilidad de marcarse como spam."
  - q: "¿Cuánto tarda una lista en quitar mi IP?"
    a: "Depende de cada lista: la RFC 5782 no define reglas para entrar o salir. Para la lista de remitentes bloqueados de Microsoft 365, Microsoft indica que los resultados varían y que la salida puede tardar hasta 24 horas o más."
draft: false
---

Un cliente te dice que no le llegó la factura y encuentras un rebote que menciona una "RBL" o una "blacklist". Antes de pedir que te saquen, conviene entender qué es una RBL, cómo la usan los servidores que reciben tu correo y por qué tu IP o tu dominio pudo terminar ahí.

> **¿Tienes prisa?** Revisa si tu IP o tu dominio aparece en listas negras con el [verificador de listas negras](/verificar-lista-negra).

## Qué es una RBL

Una **RBL** es una lista negra publicada en el **DNS**, el sistema que guarda la información pública de internet, que los servidores de correo consultan para decidir si aceptan un mensaje. Normalmente contiene direcciones IP, y a veces dominios, que quien administra la lista considera fuente de correo no deseado.

El nombre tiene historia. Según la RFC 5782 (sección 1), en 1997 Dave Rand y Paul Vixie empezaron a mantener una lista de IP que les enviaban spam, conocida como *Real-time Blackhole List* o **RBL**. Luego la distribuyeron por DNS y otras personas crearon sus propias listas.

La misma RFC aclara que mucha gente llama "RBL" a cualquier lista negra en el DNS, pero que el término convencional es **DNSBL** (*DNS blacklist* o *blocklist*). En la práctica, RBL, DNSBL, lista negra DNS y *blacklist* DNS se usan como sinónimos. Tienes la definición corta en el [glosario: RBL](/glosario/rbl/).

Un detalle importante: la RFC 5782 describe cómo se estructuran y consultan estas listas, pero **no define políticas** para agregar o quitar direcciones (sección 1). Cada lista tiene sus propias reglas.

## Cómo funciona la consulta DNS

Una RBL es una **zona DNS** cuyos nombres representan entradas de la lista (RFC 5782, sección 2).

### La IP se invierte y se agrega el nombre de la lista

Para una dirección IPv4, el nombre se arma invirtiendo el orden de sus cuatro números y agregando el nombre de la lista (sección 2.1). La RFC usa este ejemplo: si la lista se llama `bad.example.com` y la IP es `192.0.2.99`, el servidor consulta:

```
99.2.0.192.bad.example.com
```

Con IPv6 la idea es la misma, pero la dirección se escribe con sus 32 dígitos hexadecimales, uno por uno y en orden inverso, seguidos del nombre de la lista (sección 2.4).

### Qué responde la lista

- **Si la IP está listada**, la lista responde con un registro A. Por convención su valor es `127.0.0.2` (sección 2.1). La RFC indica que cualquier registro A devuelto significa que la dirección está listada (sección 6).
- **Si la IP no está listada**, no debe existir ningún registro para ella (sección 2.1). El servidor DNS responde que el nombre no existe, la respuesta que la RFC 1035 llama *Name Error* (sección 4.1.1) y que la RFC 2308 también denomina **NXDOMAIN**.
- **El motivo va en un registro TXT.** Las listas negras deberían publicar un TXT que explique por qué la IP está listada; muchas veces incluye la dirección de una página con más información, y suele usarse como texto del error SMTP que recibe quien envía (sección 2.1).

### Sublistas: por qué a veces ves 127.0.0.4 o 127.0.0.6

Algunas listas agrupan varios motivos, por ejemplo relays abiertos y equipos comprometidos por malware, y los distinguen con distintos valores del registro A (sección 2.3). En el ejemplo de la RFC, si una sublista usa `127.0.0.2` y otra `127.0.0.4`, una IP que está en ambas responde `127.0.0.6`.

### Las listas cambian rápido

Según la RFC 5782 (sección 4), una lista de IP que enviaron spam puede cambiar cada pocos minutos. Una revisión puntual muestra el estado de ese momento, no el de mañana.

## Listas de IP y listas de dominio

La mayoría de las listas usa direcciones IP (RFC 5782, sección 2). Algunas, en cambio, contienen **nombres de dominio**. Se las llama **RHSBL** (*right-hand-side blacklists*) y la consulta pone el dominio delante del nombre de la lista (sección 3). El ejemplo de la RFC: si la lista es `doms.example.net` y el dominio listado es `invalid.edu`, la entrada es `invalid.edu.doms.example.net`. Responden con registros A y TXT, igual que las de IP.

Son **mucho menos comunes** que las de IP. Según la sección 6, se usan para revisar dominios de direcciones de correo, nombres de servidor en las cabeceras y dominios de los enlaces del mensaje.

Por eso, si sospechas de tu dominio, revisa también la IP del servidor que entrega tus correos. Tienes una guía para cada caso: [cómo saber si mi dominio está en lista negra](/blog/como-saber-si-mi-dominio-esta-en-lista-negra/) y [cómo saber si mi IP está en lista negra](/blog/como-saber-si-mi-ip-esta-en-lista-negra/).

## Qué pasa cuando tu IP o tu dominio aparece

Cada servidor que recibe correo elige qué listas consulta. La RFC 5782 (sección 6) describe dos usos habituales:

- **Rechazo en la conexión.** El servidor revisa sus listas en cada conexión entrante y, si encuentra la IP en una lista negra, rechaza la conexión.
- **Puntaje de spam.** El resultado es un factor más dentro de un puntaje. Un filtro también puede revisar, después de recibir el mensaje, las IP de las cabeceras `Received:` o los enlaces del cuerpo.

En el segundo caso, el correo no rebota, pero puede llegar a spam. Google lo dice en sus directrices para remitentes: los mensajes enviados desde direcciones IP incluidas en una lista de bloqueadas tienen más probabilidad de marcarse como spam. Si usas una IP compartida, Google pide asegurarse de que no figure en ninguna lista de IP bloqueadas de internet.

### Cómo se ve el rechazo

Cuando hay rechazo, recibes un rebote con un código SMTP. Según la RFC 5321 (sección 4.2.1), los códigos que empiezan con 5 son errores permanentes: el servidor no aceptó la acción y el cliente no debería repetirla igual. El `550` incluye, entre otros casos, un comando rechazado por motivos de política (sección 4.2.3).

Muchos rebotes agregan un código extendido de la RFC 3463: la clase `5` es una falla permanente y los códigos `X.7.X` corresponden a seguridad o política. Por ejemplo, `5.7.1` significa *Delivery not authorized, message refused* y puede ser resultado de un filtrado por servidor.

Según la RFC 5782 (sección 2.1), el texto del registro TXT de la lista se usa a menudo como texto de ese error SMTP. Microsoft usa su propia lista de remitentes bloqueados, y su rebote se ve así:

```
550 5.7.606-649 Access denied, banned sending IP [IP de origen]
```

Revisa también la [reputación de tu dominio de correo](/blog/reputacion-de-dominio-de-correo/) y [por qué mis correos llegan a spam](/blog/mis-correos-llegan-a-spam/), porque una lista negra no es la única causa.

## Qué hacer si estás listado

### 1. Encuentra la causa

Lee el texto del rebote: muchas veces es el TXT de la lista, con el motivo y un enlace a más información. Si la IP es compartida de tu proveedor de correo, avísale, porque la administra él. Si es tuya, busca qué envió correo no deseado, por ejemplo un equipo comprometido por malware, uno de los motivos de listado que menciona la RFC 5782 (sección 2.3).

Google advierte otra causa: enviar pruebas de phishing o campañas de prueba desde tu dominio puede dañar su reputación y hacer que lo agreguen a listas de bloqueados de internet.

### 2. Corrige antes de pedir la salida

> **Advertencia:** si pides la salida sin corregir la causa, puedes volver a la lista. Microsoft lo dice expresamente: verifica que los mensajes no sean abusivos ni maliciosos, porque de lo contrario la IP podría bloquearse otra vez.

### 3. Pide la salida en el sitio de cada lista

Cada lista tiene su propio procedimiento, porque la RFC 5782 no lo define. Sigue el enlace del TXT o del rebote.

Para Microsoft 365, si el rebote es `550 5.7.606-649`, usa el portal oficial [sender.office.com](https://sender.office.com): ingresas la dirección que recibió el rebote y la IP del error, confirmas desde el enlace que llega a ese correo y seleccionas **Delist IP**. Según Microsoft, puede tardar hasta 24 horas o más. Si el error es `5.7.511`, escribe a delist@microsoft.com con el código completo y la IP. Para Outlook.com, Microsoft enlaza un formulario aparte desde la misma página.

## Cómo vigilarlo

Como las listas cambian rápido, una sola revisión no basta:

- Revisa tu IP y tu dominio en el [verificador de listas negras](/verificar-lista-negra) ante cualquier rebote raro.
- Si tu IP es compartida con tu proveedor, Google recomienda Postmaster Tools para ver su reputación.
- Usa el [MX Lookup](/mx-lookup) para ver dónde recibe correo tu dominio y el [diagnóstico de dominio](/domain-checker) para revisar su autenticación.

## Para tu equipo técnico

Puedes reproducir la consulta con `dig`. Con la IP de documentación `203.0.113.10` y una lista de ejemplo `bl.example.com`, se consulta el registro A del nombre invertido:

```
dig +short 10.113.0.203.bl.example.com A
```

Si responde un valor como `127.0.0.2`, la IP está listada. Para ver el motivo:

```
dig +short 10.113.0.203.bl.example.com TXT
```

Si no hay respuesta y `dig` sin `+short` muestra `status: NXDOMAIN`, el nombre no existe y la IP no está en esa lista.

Para una lista de dominios, el dominio va delante del nombre de la lista, por ejemplo `ejemplo.cl.doms.example.com`.

Para comprobar que una lista sigue funcionando, la RFC 5782 (sección 5) exige que toda lista IPv4 tenga una entrada para `127.0.0.2` y ninguna para `127.0.0.1`. La sección 7 explica por qué importa: hubo una lista abandonada cuyo dominio se volvió a registrar y empezó a responder a todo.

## Cómo ayuda InboxSeguro

InboxSeguro no te saca de una lista negra: te avisa y te guía. El monitoreo revisa cada hora 6 listas (Spamcop, Barracuda, PSBL, Mailspike, DroneBL y Backscatterer) y, si apareces, te guía para pedir la salida. Además:

- Te muestra qué sistemas envían correo con tu dominio y te permite asignar un responsable a cada uno, para encontrar el que causó el problema.
- Detecta posibles suplantaciones de tu dominio.
- Te guía para avanzar con DMARC de `p=none` a `quarantine` y `reject` sin cortar correos legítimos.
- Muestra el estado DNS de SPF, DKIM, DMARC, BIMI, MTA-STS y RUA.

Para una revisión inmediata y gratis, usa el [verificador de listas negras](/verificar-lista-negra).

## Fuentes

- [RFC 5782: DNS Blacklists and Whitelists](https://www.rfc-editor.org/rfc/rfc5782), secciones 1, 2, 2.1, 2.3, 2.4, 3, 4, 5, 6 y 7.
- [RFC 5321: Simple Mail Transfer Protocol](https://www.rfc-editor.org/rfc/rfc5321), secciones 4.2.1 y 4.2.3.
- [RFC 3463: Enhanced Mail System Status Codes](https://www.rfc-editor.org/rfc/rfc3463), secciones 2 y 3.8.
- [RFC 1035: Domain Names - Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035), sección 4.1.1.
- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308), sección 1.
- [Microsoft Learn: Use the delist portal to remove yourself from the blocked senders list and address 5.7.511 Access denied errors](https://learn.microsoft.com/en-us/defender-office-365/external-senders-use-the-delist-portal-to-unblock-yourself).
- [Google: Directrices para remitentes de correo electrónico](https://support.google.com/a/answer/81126?hl=es).

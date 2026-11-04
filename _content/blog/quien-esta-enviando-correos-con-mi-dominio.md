---
title: "Quién está enviando correos con mi dominio: cómo saberlo"
slug: quien-esta-enviando-correos-con-mi-dominio
description: "Cómo saber quién envía correos con tu dominio: qué muestra el SPF, qué revelan los reportes DMARC y qué hacer con cada sistema, legítimo o desconocido."
excerpt: "El SPF solo dice quién declaraste; los reportes agregados DMARC muestran quién envía en realidad. Cómo leerlos y qué hacer con cada sistema."
category: DMARC
date: 2026-11-04
updated: 2026-11-04
tags: [dmarc, spf, dkim, reportes-dmarc, suplantacion, gobernanza, empresas]
keyword_objetivo: quién está enviando correos con mi dominio
featured: false
resumen: "Para saber quién envía correos con tu dominio, no basta con leer el SPF: solo lista los servicios que declaraste. Lo que muestra quién envía en realidad son los reportes agregados DMARC (rua), que los receptores envían con las IP de origen y el resultado de SPF y DKIM. Con esa lista, identifica cada sistema, alinea los legítimos, investiga los desconocidos y avanza DMARC de forma gradual."
faq:
  - q: "¿El SPF me dice quién envía correos con mi dominio?"
    a: "No del todo. El SPF es una lista que tú publicas con los servidores autorizados. Muestra lo que declaraste, no quién envía en realidad. Un servicio que envía con tu dominio y no está en el SPF no aparece ahí; sí aparece en los reportes agregados DMARC."
  - q: "¿Necesito tener DMARC en p=reject para recibir reportes?"
    a: "No. La RFC 7489 define la etiqueta rua de forma independiente de la política. Con p=none recibes reportes sin pedir a los receptores que cambien el trato de tus correos, por eso es el punto de partida recomendado."
  - q: "¿Un correo que falla SPF es siempre una suplantación?"
    a: "No. El reenvío de correos rompe SPF con frecuencia, como documenta Microsoft. También puede tratarse de un servicio legítimo mal configurado. Antes de concluir que es suplantación, revisa si DKIM pasó y quién administra la IP de origen."
draft: false
---

Tu empresa envía correos desde muchos lugares: la casilla de cada persona, el CRM, el sistema de facturación, la tienda en línea, la herramienta de boletines. Un día alguien pregunta: ¿quién está enviando correos con nuestro dominio? ¿Son solo nuestros sistemas o también alguien que nos suplanta?

Esta guía explica cómo responder esa pregunta con datos y no con suposiciones. Si sospechas un caso concreto de suplantación, lee también [cómo saber si suplantan tu dominio](/blog/como-saber-si-suplantan-tu-dominio/).

> **¿Tienes prisa?** Revisa en segundos qué servidores declara tu dominio con el [diagnosticador de quién puede enviar correos](/quien-puede-enviar-correos).

## ¿Por qué es difícil saber quién envía con mi dominio?

Cualquier servidor puede escribir tu dominio en el remitente de un correo; el protocolo no lo impide. Por eso existen SPF, DKIM y DMARC: permiten que el receptor compruebe si el correo viene de una fuente autorizada. Saber quién envía exige mirar lo que reciben los demás, no solo tu configuración.

El estándar del correo, la [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321), no exige que el servidor que envía demuestre que es dueño del dominio del remitente. En una empresa típica, además, cada área contrata sus herramientas y no siempre avisa a quien administra el DNS. El resultado es un inventario incompleto: TI conoce algunos sistemas, pero no todos.

## ¿Qué muestra el SPF publicado y qué no?

El SPF muestra los servidores que tú declaraste como autorizados para enviar con tu dominio. No muestra quién envía en realidad: un servicio que no incluiste no aparece, y un suplantador tampoco. Es el punto de partida del inventario, no el inventario completo.

Según la [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208), el SPF es un registro TXT en el DNS que lista las IP y los mecanismos (`include`, `a`, `mx`, entre otros) autorizados para el dominio usado en el remitente del sobre, el `MAIL FROM`. Un ejemplo:

```
ejemplo.cl. TXT "v=spf1 include:_spf.google.com include:servicio.example.com -all"
```

Al leerlo, puedes deducir qué proveedores declaraste. Tres cosas a revisar:

- **Si existe.** Sin SPF, el receptor no tiene lista de autorizados.
- **El final.** `-all` pide fallar a lo no listado; `+all` autoriza a cualquier servidor, lo que anula el registro.
- **Las consultas DNS.** La RFC 7208 limita a 10 los mecanismos y modificadores que generan consultas DNS (sección 4.6.4). Si se superan, el resultado es `permerror`. Más detalle en [el límite de 10 consultas DNS del SPF](/blog/spf-limite-10-consultas-dns/).

El SPF además se evalúa sobre el dominio del `MAIL FROM`, que muchas plataformas reemplazan por uno propio. Por eso un servicio puede enviar con tu dominio en el `From` visible sin aparecer en tu SPF.

## ¿Cómo muestran los reportes DMARC quién envía realmente?

Los reportes agregados DMARC los envían los receptores que aplican DMARC a la dirección que indicas en la etiqueta `rua`. Resumen, por IP de origen, cuántos correos con tu dominio en el `From` recibieron y si pasaron SPF y DKIM. Así aparecen todos los que envían, declarados o no.

La [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) define DMARC. Para recibir reportes basta con publicar un registro como este:

```
_dmarc.ejemplo.cl. TXT "v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl"
```

- `p=none` pide no cambiar el trato de los correos que fallen; solo informar (sección 6.3).
- `rua` indica dónde enviar los reportes agregados (sección 6.3).

Según la sección 7.2 de la RFC, el reporte agregado es un archivo XML que, para un período, agrupa los mensajes por IP de origen e informa la política aplicada, el resultado DMARC y los resultados y dominios de SPF y DKIM. Si la dirección de `rua` está en otro dominio, ese dominio debe autorizarlo con un registro DNS (sección 7.1).

Un correo pasa DMARC si SPF o DKIM pasan **y** el dominio autenticado está alineado con el dominio del `From` (sección 3.1). Microsoft lo resume así: un mensaje pasa DMARC si pasa una o ambas comprobaciones, y falla si fallan las dos ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dmarc-configure)).

## ¿Cómo distinguir servicios legítimos de desconocidos?

Agrupa las IP del reporte por la organización que las administra y por el dominio DKIM que firmó. Lo que reconoces y pasa alineado es legítimo y está bien configurado; lo que reconoces pero falla es legítimo y está mal configurado; lo que no reconoces hay que investigarlo antes de bloquearlo.

Una forma práctica de clasificar cada fila:

| Lo que ves en el reporte | Lo más probable | Qué revisar |
|---|---|---|
| SPF o DKIM pasan alineados | Sistema legítimo bien configurado | Nada urgente; asignar responsable |
| Pasa SPF o DKIM, pero con otro dominio | Plataforma que envía con su propio dominio | Configurar DKIM o `MAIL FROM` con tu dominio |
| Fallan ambos, IP de un proveedor que usas | Sistema legítimo sin configurar | Preguntar al área que lo contrató |
| Fallan ambos, IP de un reenviador | Reenvío | Revisar DKIM; el reenvío rompe SPF |
| Fallan ambos, IP desconocida | Posible suplantación | Investigar antes de endurecer la política |

Sobre el reenvío, Microsoft documenta que los mensajes reenviados suelen fallar DMARC porque el reenvío rompe SPF, y que si además el cuerpo se modifica, DKIM también falla ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot)). No confundas ese caso con una suplantación.

## ¿Qué hago con cada sistema que aparece?

Cada sistema necesita una decisión y un responsable: si es legítimo, alinéalo con DKIM o SPF; si es legítimo pero nadie lo usa, dalo de baja; si no lo reconoce nadie, pregunta internamente y, descartado el reenvío, trátalo como posible suplantación que DMARC bloqueará.

### Si es legítimo: alinéalo

- **DKIM con tu dominio.** Pide al proveedor que firme con tu dominio (`d=ejemplo.cl`). La [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376) define la etiqueta `d=` como el dominio que firma (sección 3.5). Microsoft lo indica como la opción preferida para servicios externos ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot)).
- **SPF.** Agrega el `include` o la IP que indique el proveedor, cuidando el límite de 10 consultas.
- **Subdominio.** Si ninguna opción es posible, Microsoft sugiere usar un subdominio para ese servicio con su propio registro DMARC.

### Si nadie lo reconoce: pregunta

Antes de bloquear, consulta a las áreas (ventas, finanzas, marketing, soporte). Muchas veces el "desconocido" es una herramienta contratada sin avisar a TI.

### Si es suplantación: deja que DMARC actúe

Tú no puedes impedir que un tercero escriba tu dominio, pero con `p=quarantine` o `p=reject` pides a los receptores que traten esos correos como sospechosos o los rechacen. Para reconocer las señales, revisa [cómo saber si suplantan tu dominio](/blog/como-saber-si-suplantan-tu-dominio/).

## ¿Cómo paso a una política DMARC más estricta sin cortar correo legítimo?

Avanza por etapas: empieza con `p=none` para recibir reportes, alinea todos los sistemas legítimos, pasa a `p=quarantine` y solo al final a `p=reject`. En cada etapa revisa los reportes; endurecer antes de tiempo puede hacer que tus propios correos lleguen a spam o sean rechazados.

La RFC 7489 contempla este avance con la etiqueta `pct`, que aplica la política solo a un porcentaje de los mensajes (sección 6.3). Google también recomienda introducir DMARC de forma gradual y revisar los reportes antes de endurecer la política ([Google: Implementación recomendada de DMARC](https://support.google.com/a/answer/10032473?hl=es)).

> **Advertencia:** `p=reject` pide rechazar todo lo que falle DMARC. Si un sistema legítimo aún no está alineado, sus correos se pueden perder. Si tus correos ya llegan a spam, revisa primero [por qué mis correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

Para el paso a paso completo, lee [qué es DMARC y cómo activarlo](/blog/que-es-dmarc-como-activarlo/).

## ¿Cómo ayuda InboxSeguro?

Los reportes agregados son archivos XML difíciles de leer a mano. Cuando apuntas tu `rua` a InboxSeguro, los reportes llegan a su panel y la plataforma:

- **Muestra qué sistemas envían correo con tu dominio**, como un inventario construido desde los reportes DMARC.
- **Permite asignar un responsable** a cada sistema.
- **Detecta posibles intentos de suplantación** cuando SPF y DKIM fallan, tras descartar reenvío.
- **Entrega analítica semanal** de envíos por sistema.
- **Guía un DMARC gradual** (`none` → `quarantine` → `reject`) sin cortar correo legítimo.

Como primer paso, el [diagnosticador gratuito de quién puede enviar correos](/quien-puede-enviar-correos) lee el SPF publicado de tu dominio, te avisa si falta o si usa `+all` y cuenta las consultas DNS contra el límite de 10.

## Fuentes

- [RFC 7489: Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc7489), secciones 3.1, 6.3, 7.1 y 7.2.
- [RFC 7208: Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208), sección 4.6.4.
- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376), sección 3.5.
- [RFC 5321: Simple Mail Transfer Protocol](https://www.rfc-editor.org/rfc/rfc5321).
- [Microsoft Learn: Set up DMARC to validate the From address domain](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dmarc-configure).
- [Microsoft Learn: Troubleshoot email authentication in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot).
- [Google: Implementación recomendada de DMARC](https://support.google.com/a/answer/10032473?hl=es).

---
title: "Cómo saber si alguien suplanta tu dominio"
slug: como-saber-si-suplantan-tu-dominio
description: "¿Alguien envía correos falsos con el dominio de tu empresa? Aprende a detectarlo con reportes DMARC y a separar tus servicios legítimos de los falsos."
date: 2026-10-13
updated: 2026-10-13
tags: [suplantacion, spoofing, dmarc, spf, dkim, empresas]
keyword_objetivo: cómo saber si alguien suplanta tu dominio
resumen: "Para saber si alguien suplanta tu dominio, activa DMARC en modo observación (p=none) con una dirección rua y lee los reportes que envían Gmail, Outlook y otros receptores. Si en ellos aparecen fuentes que nadie en tu empresa reconoce y que fallan SPF y DKIM, es una señal de posible suplantación. Antes de concluir que es un ataque, descarta tus propias herramientas mal configuradas."
faq:
  - q: "¿Cómo sé si alguien está enviando correos falsos con mi dominio?"
    a: "Revisa los reportes DMARC. Las fuentes que nadie en tu empresa reconoce y que fallan las pruebas son una señal de posible suplantación."
  - q: "¿Activar DMARC en modo observación afecta la entrega de mis correos?"
    a: "No. En modo observación (p=none) no cambia la entrega de ningún correo; solo empiezas a recibir reportes."
  - q: "¿Cada cuánto llegan los reportes DMARC?"
    a: "Normalmente una vez al día. Incluyen tanto los correos que pasaron las pruebas como los que fallaron."
  - q: "Si una herramienta mía falla SPF o DKIM, ¿es un ataque?"
    a: "No. Es un servicio legítimo mal configurado y sus correos corren riesgo de no llegar. Hay que corregirlo antes de bloquear nada."
  - q: "¿Cuándo debo pasar a cuarentena o rechazo?"
    a: "Solo cuando todas tus herramientas legítimas pasen las pruebas. Se puede aplicar primero a una parte de los correos y subir de forma gradual."
draft: false
---

Un cliente te reenvía una factura que tu empresa nunca emitió. Un proveedor pregunta por un cambio de cuenta bancaria que nadie pidió. Los dos correos dicen venir de `@ejemplo.cl`. Puede que alguien esté enviando correos falsos a tu nombre. Hay una forma de confirmarlo sin adivinar.

## Por qué alguien puede enviar correos a tu nombre

El correo permite escribir cualquier dirección en el campo "De". Por eso existen tres controles que ayudan a Gmail, Outlook y otros a distinguir un correo real de uno falso:

- **SPF:** la lista de servidores que tienen permiso para enviar con tu dominio.
- **DKIM:** una firma digital que prueba que el correo viene de tu dominio.
- **DMARC:** la regla que dice qué hacer con los correos que fallan esas pruebas, y que además te manda reportes.

Un detalle importante: un atacante puede firmar sus correos con su propio dominio. Esa firma es válida, pero no prueba que el correo sea tuyo. DMARC exige que la firma o el permiso correspondan a tu dominio, el mismo que ve el destinatario.

## Paso 1: revisa qué tienes hoy

Revisa tu dominio con el [verificador de dominio](/domain-checker). También puedes usar el [verificador SPF](/spf-checker), el [verificador DKIM](/dkim-checker) y el [verificador DMARC](/dmarc-checker).

Si no tienes DMARC, no recibes reportes. Sin reportes, solo te enteras de una suplantación cuando alguien te avisa.

## Paso 2: pide los reportes

Pídele a quien administra tu dominio que publique un registro DMARC en "modo observación". En ese modo no cambia la entrega de ningún correo. Solo empiezas a recibir reportes de Gmail, Outlook y otros.

> **Advertencia:** no intentes bloquear la suplantación de inmediato. Si alguna de tus herramientas legítimas (facturación, CRM, newsletter) todavía no está bien configurada, sus correos también se bloquearían o irían a spam.

## Paso 3: lee los reportes

Los reportes llegan normalmente una vez al día. Incluyen tanto los correos que pasaron las pruebas como los que fallaron. Google lo dice en su guía para remitentes: los reportes DMARC ayudan a identificar a quien podría estar suplantando tu dominio.

Separa lo que ves en tres grupos:

1. **Herramientas tuyas que pasan.** Todo bien.
2. **Herramientas tuyas que fallan.** No es un ataque. Es un servicio legítimo mal configurado, y sus correos corren riesgo de no llegar. Hay que corregirlo antes de bloquear nada.
3. **Fuentes que nadie reconoce y que fallan.** Es una señal de posible suplantación.

El grupo 2 es el más difícil. Antes de hablar de ataque, pregunta en ventas, marketing, soporte y finanzas qué herramientas usan para enviar correos.

## Paso 4: cruza los avisos con los reportes

Cuando alguien te reenvía un correo dudoso, anota la fecha. Busca en los reportes de ese día una fuente desconocida que falle. Si envías a cuentas de Gmail, Google Postmaster Tools también te muestra si tus correos están autenticados.

## Paso 5: bloquea los correos falsos, de a poco

La protección real llega cuando pides a los receptores que manden a spam o rechacen los correos que fallan. Se puede aplicar primero a una parte de los correos y subir de forma gradual.

> **Advertencia:** da este paso solo cuando todas tus herramientas legítimas pasen las pruebas. Si no, bloquearás tus propios correos junto con los falsos.

Si tus correos legítimos ya llegan a spam, revisa [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## Para tu equipo técnico

- SPF: RFC 7208. DKIM: RFC 6376, clave pública bajo `_domainkey`. DMARC: RFC 7489, alineación del `From:` con SPF o DKIM (sección 3.1; firma válida no basta, 3.1.1).
- Registro TXT en `_dmarc.ejemplo.cl` (6.1). Modo observación: `v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl`. Sin `rua` no hay reportes agregados (6.3).
- Reportes a otro dominio (por ejemplo `example.com`) requieren que ese dominio lo autorice (7.1).
- Reportes agregados: diarios o más frecuentes, con mensajes que pasan y fallan (7.2).
- Bloqueo: `p=quarantine` y luego `p=reject`, con `pct` para avanzar gradualmente (6.3).

## Cómo ayuda InboxSeguro

InboxSeguro te muestra qué sistemas envían correo con tu dominio, te permite asignar un responsable a cada uno y te guía para activar la protección contra suplantación sin cortar correos legítimos.

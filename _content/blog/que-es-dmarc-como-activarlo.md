---
title: "Qué es DMARC y cómo activarlo sin riesgos"
slug: que-es-dmarc-como-activarlo
description: "Qué es DMARC, qué significan p, rua, ruf, pct, sp, adkim y aspf, y cómo pasar de p=none a p=reject sin bloquear los correos legítimos de tu empresa."
date: 2026-10-13
updated: 2026-10-13
tags: [dmarc, spf, dkim, suplantacion, entregabilidad, empresas]
keyword_objetivo: qué es DMARC
draft: false
---

Cualquiera puede enviar un correo que diga venir de tu empresa. DMARC es lo que le dice a Gmail, Outlook y otros qué hacer con esos correos falsos. Bien activado, protege a tus clientes y tu marca. Activado de golpe, puede mandar a spam tus propias facturas. Aquí te explicamos cómo funciona y cómo activarlo por etapas.

## Qué es DMARC, en una frase

**DMARC** es una regla publicada en tu dominio que dice qué hacer con los correos que no pueden probar que son tuyos, y que además te envía reportes.

Se apoya en otros dos controles:

- **SPF:** la lista de servidores que tienen permiso para enviar con tu dominio.
- **DKIM:** una firma digital que prueba que el correo viene de tu dominio.

Un correo pasa DMARC cuando pasa SPF o DKIM, y además ese resultado corresponde al mismo dominio que ve el destinatario en el campo "De". Google lo explica así en su guía para remitentes.

Revisa si ya tienes DMARC con el [verificador DMARC](/dmarc-checker).

## Por qué le importa a tu negocio

- **Sin DMARC**, es más fácil que alguien envíe facturas o avisos falsos a tu nombre, y no te enteras.
- **Con DMARC mal activado**, tus correos legítimos pueden ir a spam o no llegar.
- **Gmail lo exige** a quienes envían más de 5.000 correos al día a cuentas de Gmail, aunque sea en modo observación.

## Las tres políticas

DMARC tiene tres niveles:

- **Observar (`none`):** no cambia nada en la entrega. Solo recibes reportes.
- **Cuarentena (`quarantine`):** pide tratar como sospechosos los correos que fallan, por ejemplo mandarlos a spam.
- **Rechazo (`reject`):** pide rechazar los correos que fallan.

## Cómo activarlo sin cortar correos

### 1. Haz la lista de lo que envía correo con tu dominio

Correo de la empresa, CRM, newsletter, facturación, tienda en línea, mesa de ayuda. Cada uno debe estar autorizado en SPF o firmar con DKIM usando tu dominio. Revisa con el [verificador SPF](/spf-checker), el [verificador DKIM](/dkim-checker) o todo junto con el [verificador de dominio](/domain-checker).

### 2. Empieza observando

Publica DMARC en modo observación. No cambia nada para tus correos, pero empiezas a recibir reportes.

> **Advertencia:** si tu dominio ya tiene un registro DMARC, hay que editarlo, no crear otro. Si hay dos, DMARC deja de aplicarse.

### 3. Lee los reportes y corrige

Los reportes muestran qué correos pasaron y cuáles fallaron. Busca tus propias herramientas entre las que fallan y corrígelas. Una opción es activar en esa herramienta la firma DKIM con tu dominio.

### 4. Pasa a cuarentena, de a poco

Puedes aplicar la cuarentena solo a una parte de tus correos y subir el porcentaje cuando los reportes salgan limpios.

> **Advertencia:** si una herramienta legítima todavía falla, la cuarentena puede mandar sus correos a spam. No subas el porcentaje mientras tus propias herramientas aparezcan con fallas.

### 5. Llega a rechazo

Cuando la cuarentena esté al 100 % y los reportes estén limpios, pasa a rechazo.

> **Advertencia:** en rechazo, los correos que fallan pueden no llegar nunca. Revisa también los subdominios que envían correo: si no se dice otra cosa, heredan la misma política.

Si tus correos ya llegan a spam, revisa primero [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## Para tu equipo técnico

- DMARC: RFC 7489. Registro TXT en `_dmarc.ejemplo.cl` (6.1). `v=DMARC1` primero, seguido de `p` (6.3).
- Observación: `v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl`. Gradual: `p=quarantine; pct=25`. `pct` va de 0 a 100, por defecto 100 (6.3).
- `rua` (agregados) y `ruf` (fallas): si faltan, no se generan reportes (6.3). Reportes a otro dominio, como `example.com`, requieren autorización de ese dominio (7.1). Agregados incluyen pases y fallas (7.2).
- `sp`: política de subdominios; si falta, se aplica `p` (6.3).
- Alineación (3.1, 3.1.1): relajada por defecto con `adkim`/`aspf=r`; `d=example.com` alinea con `news.example.com` en relajado, no en estricto (`s`). Evita `s` sin necesidad.
- Varios registros DMARC: el descubrimiento de la política termina (6.6.3, paso 5).

## Cómo ayuda InboxSeguro

InboxSeguro te muestra qué sistemas envían correo con tu dominio, te permite asignar un responsable a cada uno y te guía para activar la protección contra suplantación sin cortar correos legítimos.

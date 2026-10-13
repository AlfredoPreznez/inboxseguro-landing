---
title: "SPF: cómo no pasar el límite de 10 consultas"
slug: spf-limite-10-consultas-dns
description: "Cómo autorizar tus servicios de correo en SPF sin superar el límite de 10 consultas DNS de la RFC 7208, y qué pasa si lo superas. Guía práctica para pymes."
date: 2026-10-13
updated: 2026-10-13
tags: [spf, dns, entregabilidad, autenticacion, pymes]
keyword_objetivo: límite de 10 consultas DNS SPF
draft: false
---

Cada vez que tu empresa contrata una herramienta que envía correos (un CRM, una newsletter, la facturación), alguien la agrega a tu registro SPF. Funciona hasta que un día deja de funcionar. Si el registro se llena demasiado, falla para todos tus correos, no solo para el último servicio. El resultado: correos que no llegan o que terminan en spam.

## Qué es SPF, en una frase

**SPF** es la lista, publicada en tu dominio, de los servidores que tienen permiso para enviar correos con tu nombre.

Revisa la tuya con el [verificador SPF](/spf-checker).

## El límite que pocos conocen

SPF tiene un límite: cuando Gmail u Outlook revisan tu lista, solo pueden hacer **10 consultas** para comprobarla. Cada herramienta que se agrega con la instrucción "include" gasta una. Si la lista de esa herramienta incluye a su vez otras, esas también cuentan.

Si pasas de 10, SPF da error. Google advierte que los correos que no se autentican pueden ir a spam o ser rechazados.

## Un solo registro por dominio

Tu dominio debe tener una sola lista SPF. Si hay dos, SPF da error.

> **Advertencia:** para autorizar una herramienta nueva, hay que editar la lista existente. Si alguien crea una segunda, todos tus correos pueden fallar.

## Cómo autorizar herramientas sin pasarte

### 1. Cuenta lo que tienes

Revisa tu dominio con el [verificador de dominio](/domain-checker) o el [verificador SPF](/spf-checker) para ver la lista completa y cuánto ocupa.

### 2. Saca las herramientas que ya no usan

Un CRM que se probó y se abandonó, o el sistema de un proveedor anterior, siguen ocupando espacio.

> **Advertencia:** antes de sacar una herramienta, confirma con el área que la usaba que ya no envía correos con tu dominio. Si todavía envía, sus correos empezarán a fallar.

### 3. Usa direcciones fijas para tus propios servidores

Si un servidor tuyo envía desde una dirección IP fija que tú controlas, autorizarla directamente no gasta consultas.

> **Advertencia:** no hagas esto con herramientas externas copiando las IP que ves hoy. Si el proveedor cambia sus IP, tus correos fallarán sin que nadie lo note.

### 4. Usa un subdominio para envíos masivos

Si una plataforma te permite enviar desde un subdominio como `news.ejemplo.cl`, ese subdominio puede tener su propia lista SPF, con su propio límite.

### 5. Apóyate en DKIM

**DKIM** es una firma digital que prueba que el correo viene de tu dominio. Para pasar DMARC (la regla que dice qué hacer con los correos que no prueban ser tuyos), basta con SPF **o** DKIM. Si una herramienta firma con DKIM usando tu dominio, depende menos de tu lista SPF. Revisa con el [verificador DKIM](/dkim-checker) y el [verificador DMARC](/dmarc-checker).

Si tus correos ya llegan a spam, revisa [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## Para tu equipo técnico

- SPF: RFC 7208. Solo como registro TXT (3.1). Un único registro; si hay varios, `permerror` (3.2, 4.5).
- Límite de 10 (4.6.4): cuentan `include`, `a`, `mx`, `ptr`, `exists` y `redirect`; exceso = `permerror`. `ip4`, `ip6` y `all` no cuentan. Cada MX no puede resolver a más de 10 A/AAAA.
- `include` evalúa recursivamente el registro del proveedor, así que los anidados suman (5.2).
- Void lookups (respuestas vacías o NXDOMAIN): deberían limitarse a dos (4.6.4). Un `include` a un dominio que ya no existe consume una.
- No publicar `ptr` (5.5).
- Ejemplo: `v=spf1 include:_spf.example.com ip4:192.0.2.10 -all`.
- Subdominios: con alineación relajada, la opción por defecto de DMARC (RFC 7489, 3.1 y 6.3), `news.ejemplo.cl` sigue alineado con `ejemplo.cl`.

## Cómo ayuda InboxSeguro

InboxSeguro te muestra qué sistemas envían correo con tu dominio, te permite asignar un responsable a cada uno y te guía para activar la protección contra suplantación sin cortar correos legítimos.

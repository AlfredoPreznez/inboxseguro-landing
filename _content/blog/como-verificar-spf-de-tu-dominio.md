---
title: "Cómo verificar el registro SPF de tu dominio"
slug: como-verificar-spf-de-tu-dominio
description: "Aprende a verificar el SPF de tu dominio: dónde ver el registro, cómo leer ~all y -all, qué significa cada resultado y cómo corregir errores comunes."
excerpt: "Cómo comprobar tu registro SPF, leer su resultado y corregir los errores más comunes cuidando de no cortar correos legítimos."
category: Autenticación
date: 2026-10-26
updated: 2026-10-26
tags: [spf, autenticacion, entregabilidad, dns, dmarc]
keyword_objetivo: verificar spf
featured: false
resumen: "Para verificar SPF revisa que tu dominio tenga un solo registro TXT que empiece con v=spf1, que incluya todos los servicios que envían correo con tu dominio y que termine con un all. Luego confirma en un correo real que el resultado sea pass. Google recomienda terminar en ~all y Microsoft recomienda -all para dominios de Microsoft 365."
faq:
  - q: "¿Qué diferencia hay entre ~all y -all?"
    a: "Con ~all (softfail) le dices al receptor que un servidor no listado probablemente no está autorizado; con -all (fail), que no lo está. Google recomienda ~all. Microsoft recomienda -all para dominios de Microsoft 365, junto con DKIM y DMARC."
  - q: "¿Puedo tener dos registros SPF en el mismo dominio?"
    a: "No. El RFC 7208 indica que un dominio no debe tener más de un registro SPF; si hay más de uno, el resultado es permerror. Para agregar un servicio, edita el registro existente."
  - q: "¿Cuánto tarda en funcionar un cambio en el registro SPF?"
    a: "Google indica que la autenticación SPF puede tardar hasta 48 horas en comenzar a funcionar después de agregar el registro."
  - q: "¿Basta con que SPF dé pass para cumplir con DMARC?"
    a: "No necesariamente. SPF revisa el dominio de la dirección técnica de envío, que puede ser distinto del que ve el destinatario en el campo \"De\". Para que SPF cuente en DMARC, ambos dominios deben estar alineados."
audio_alias:
  "v=spf1 include:_spf.google.com ~all": "ve igual ese pe efe uno, include guion bajo ese pe efe punto google punto com, virgulilla all"
  "v=spf1 -all": "ve igual ese pe efe uno, menos all"
  "include:_spf.example.com.": "include guion bajo ese pe efe punto example punto com, con un punto al final"
  "varios `v=spf1` = `permerror`": "varios registros ve igual ese pe efe uno dan permerror"
  "v=spf1": "ve igual ese pe efe uno"
  "include:": "include"
  "include=": "include igual"
  "ip4:": "ip cuatro"
  "ip6:": "ip seis"
  "~all": "virgulilla all"
  "-all": "menos all"
  "?all": "interrogación all"
  "`+`, `-`, `~`, `?`": "más, menos, virgulilla e interrogación"
draft: false
---

Contratas una nueva herramienta para enviar facturas, alguien agrega una línea en el DNS y todo parece funcionar. Semanas después, un cliente dice que tus correos le llegan a spam. Una causa posible es el registro SPF de tu dominio. Aquí verás cómo verificar SPF paso a paso y cómo corregir los errores más comunes cuidando de no cortar correos legítimos.

## Qué es SPF y qué revisa el receptor

**SPF** (Sender Policy Framework) es la lista, publicada en tu dominio, de los servidores que tienen permiso para enviar correos en su nombre. Se publica en el **DNS**, el sistema que guarda la información pública de tu dominio, como un registro de tipo **TXT** (un registro de texto). Así lo define el [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208).

Cuando un servidor recibe un correo, consulta esa lista y comprueba si el servidor que lo envió está autorizado. Según Microsoft, SPF revisa el dominio de la dirección técnica de envío, llamada **MAIL FROM** o remitente de sobre, que no siempre es la misma que ve el destinatario en el campo "De".

## Paso 1: busca tu registro SPF

Para comprobar el registro SPF (en inglés, "check SPF") puedes usar el [verificador SPF](/spf-checker), que lee el registro publicado en tu dominio y te señala si falta. Si prefieres la línea de comandos, consulta los registros TXT de tu dominio:

```
dig TXT ejemplo.cl +short
```

Un registro SPF correcto se ve así:

```
v=spf1 include:_spf.example.com ip4:192.0.2.10 ~all
```

Tiene tres partes:

- **`v=spf1`**: indica que es un registro SPF. Google recuerda que siempre debe ir al comienzo.
- **Los servicios autorizados**: `include:` agrega la lista de otro proveedor y `ip4:` o `ip6:` autorizan direcciones IP concretas.
- **El final con `all`**: dice qué hacer con los servidores que no aparecen en la lista.

Si no aparece ninguna línea que empiece con `v=spf1`, tu dominio no tiene SPF. Google indica que, después de agregarlo, la autenticación puede tardar hasta 48 horas en comenzar a funcionar.

## Paso 2: confirma que hay un solo registro

Tu dominio debe tener un solo registro SPF. El RFC 7208 lo exige: si el receptor encuentra más de uno, el resultado es permerror, un error permanente. Microsoft explica que, en ese caso, el receptor no puede saber cuál evaluar.

> **Advertencia:** para autorizar un servicio nuevo, edita el registro existente y agrega su `include:`. No crees un segundo registro: todos tus correos pueden empezar a fallar SPF.

Revisa también los **subdominios** que envían correo, como `news.ejemplo.cl`. Google y Microsoft coinciden en que cada subdominio necesita su propio registro SPF: el del dominio principal no lo cubre.

## Paso 3: revisa que estén todos los que envían correo

Google pide que el registro incluya a todos los servidores que envían correo para tu dominio. Su lista de ejemplos incluye servidores web, servidores de correo propios, formularios de contacto y cualquier proveedor externo que envíe en tu nombre. Si agregas un remitente nuevo y no actualizas el registro, Google advierte que sus mensajes podrían marcarse como spam.

Como punto de partida, el [verificador de remitentes](/quien-puede-enviar-correos) muestra qué servicios podrían estar autorizados según el DNS público de tu dominio. Luego completa la lista con cada área: correo corporativo, CRM, newsletters, facturación y mesa de ayuda.

Cada `include:` consume consultas al DNS, y el RFC 7208 pone un límite de 10 por evaluación. Si tu registro tiene muchos servicios, revisa [cómo no pasar el límite de 10 consultas](/blog/spf-limite-10-consultas-dns/).

## Paso 4: revisa cómo termina: ~all o -all

El final del registro es donde Google y Microsoft dan recomendaciones distintas.

- **`~all` (softfail):** según el RFC 7208, es una declaración débil de que el servidor probablemente no está autorizado. Google dice que esta etiqueta indica a los receptores que marquen como spam los mensajes de servidores que no figuran en el registro, y **recomienda usar `~all`**. Su ejemplo es `v=spf1 include:_spf.google.com ~all`.
- **`-all` (fail):** es una declaración explícita de que el servidor no está autorizado. Para dominios de Microsoft 365, **Microsoft recomienda `-all`**, porque también recomienda configurar DKIM y DMARC. Microsoft agrega que, con `~all`, la política DMARC en la práctica no actúa sobre los mensajes que fallan SPF y tampoco traen firma DKIM.
- **`?all` (neutral):** no sugiere ninguna acción. Microsoft no lo recomienda en producción.

En todos los casos, lo que pasa con el mensaje lo decide el receptor. El RFC 7208 no fija cómo tratar cada resultado, y Microsoft aclara que depende del sistema de destino.

Si tu registro no termina en `all` (ni usa `redirect`) y el servidor no coincide con ningún mecanismo, el RFC indica que el resultado es neutral, como si terminara en `?all`.

> **Advertencia:** pasar de `~all` a `-all` puede hacer que se rechacen correos de un servicio legítimo que olvidaste incluir. Hazlo solo cuando tengas el inventario completo, DKIM activo y reportes DMARC que confirmen que tus servicios pasan.

## Paso 5: comprueba el resultado en un correo real

Que el registro exista no garantiza que funcione. Envía un correo desde cada servicio y revisa las cabeceras del mensaje (en Gmail, la opción **Mostrar original**, como explicamos en la [guía para verificar DKIM](/blog/como-verificar-dkim-de-tu-dominio/)). El RFC 7208 define estos resultados:

- **pass:** el servidor está autorizado.
- **fail:** el servidor no está autorizado.
- **softfail:** probablemente no está autorizado.
- **neutral:** el dominio no se pronuncia.
- **none:** no se encontró registro SPF.
- **temperror:** error temporal, normalmente del DNS; puede resolverse al reintentar.
- **permerror:** el registro no se pudo interpretar y hay que corregirlo en el DNS.

Luego compara el dominio de la dirección técnica de envío con el de tu remitente visible. Para que SPF cuente en DMARC, ambos deben estar **alineados**, según el [RFC 9989](https://www.rfc-editor.org/rfc/rfc9989), el estándar actual de DMARC (mayo de 2026). Google lo resume así para los correos directos: el dominio del encabezado "De:" debe estar alineado con el dominio de SPF o con el de DKIM. Si quieres entender este paso, revisa [qué es DMARC y cómo activarlo](/blog/que-es-dmarc-como-activarlo/).

## Errores comunes y cómo corregirlos

- **Dos registros SPF.** Únelos en uno solo con todos los servicios.
- **Errores de escritura.** Microsoft muestra tres casos típicos: un punto al final del dominio (`include:_spf.example.com.`), un signo igual en vez de dos puntos (`include=`) y un espacio después de los dos puntos.
- **Un `include:` que apunta a un dominio sin SPF.** Si el dominio incluido no se resuelve o no tiene registro SPF, Microsoft indica que la validación devuelve permerror y los mensajes pueden rechazarse.
- **Más de 10 consultas.** El resultado también es permerror. Recuerda que los `include:` anidados también cuentan.
- **Usar `ptr`.** El RFC 7208 dice que este mecanismo no debería publicarse: es lento y menos confiable que otras opciones.
- **Servicios que ya no se usan.** Google recomienda quitar los dominios o IP que ya no envían correo.

> **Advertencia:** antes de quitar un `include:`, confirma con el área que usaba ese servicio que ya no envía correos con tu dominio. Si todavía envía, sus mensajes empezarán a fallar.

Si tus correos ya están llegando a spam, revisa también [por qué tus correos llegan a spam](/blog/mis-correos-llegan-a-spam/) y usa el [chequeo de seguridad del correo](/domain-checker) para ver SPF, DKIM, DMARC y MX de una vez.

## Para tu equipo técnico

- Solo registro TXT; el tipo SPF quedó descontinuado (RFC 7208, 3.1).
- Un único registro; varios `v=spf1` = `permerror` (3.2, 4.5).
- Resultados: none, neutral, pass, fail, softfail, temperror, permerror (2.6). Calificadores `+`, `-`, `~`, `?` (4.6.2). Sin `all` ni `redirect`, resultado neutral (4.7).
- Límite de 10 términos con consulta DNS (`include`, `a`, `mx`, `ptr`, `exists`, `redirect`), contando los anidados; superarlo da `permerror`. Los void lookups deberían limitarse a dos (4.6.4).
- `ptr`: no debería publicarse (5.5).
- Alineación SPF: DMARC solo usa la identidad MAIL FROM; relajada exige el mismo dominio organizacional entre MAIL FROM y From; estricta, coincidencia exacta (RFC 9989, 3.2.10 y 4.4.2; reemplaza al RFC 7489).
- Microsoft recomienda un TTL mínimo de 3600 segundos y `v=spf1 -all` en dominios que no envían correo.

## Cómo ayuda InboxSeguro

InboxSeguro arma un inventario de los sistemas que envían correo con tu dominio a partir de los reportes DMARC, te permite asignar un responsable a cada uno y te avisa cuando aparece un servicio nuevo. Así sabes qué debe estar en tu registro SPF antes de endurecerlo. La configuración DNS guiada te muestra los valores de cada registro para que los copies y pegues en el proveedor de tu dominio.

## Fuentes

- [RFC 7208: Sender Policy Framework (SPF)](https://www.rfc-editor.org/rfc/rfc7208), secciones 2.6, 3.1, 3.2, 4.5, 4.6.2, 4.6.4, 4.7 y 5.5.
- [RFC 9989: DMARC](https://www.rfc-editor.org/rfc/rfc9989) (mayo de 2026, reemplaza al RFC 7489), secciones 3.2.10 y 4.4.2.
- [Google: Configura SPF](https://support.google.com/a/answer/33786?hl=es-419).
- [Google: Directrices para remitentes de correos](https://support.google.com/a/answer/81126?hl=es-419).
- [Microsoft: Configuración de SPF para Microsoft 365](https://learn.microsoft.com/es-es/defender-office-365/email-authentication-spf-configure).
- [Microsoft: Configuración de DMARC](https://learn.microsoft.com/es-es/defender-office-365/email-authentication-dmarc-configure).

---
title: "Cómo verificar DKIM de tu dominio paso a paso"
slug: como-verificar-dkim-de-tu-dominio
description: "Aprende a comprobar si DKIM está bien configurado en tu dominio: cómo encontrar el selector, revisar el registro DNS y detectar los errores más comunes."
excerpt: "Aprende a comprobar si DKIM está bien configurado en tu dominio: selector, registro DNS y errores comunes."
category: Autenticación
date: 2026-10-14
updated: 2026-10-14
tags: [dkim, autenticacion, entregabilidad, dns, dmarc]
keyword_objetivo: verificar dkim
featured: false
resumen: "Para verificar DKIM necesitas el selector que usa cada servicio que envía correo con tu dominio y revisar que exista un registro TXT en selector._domainkey.tudominio con una clave pública válida. Luego confirma en un correo real que la firma da DKIM=pass y que el dominio de la firma (d=) coincide con el de tu remitente, que es lo que exige DMARC."
faq:
  - q: "¿Qué es el selector DKIM y dónde lo encuentro?"
    a: "Es el nombre que identifica la clave con que se firmó un correo. Aparece en la cabecera DKIM-Signature de cualquier mensaje enviado, en la etiqueta s=. Con él se busca la clave pública en selector._domainkey.tudominio."
  - q: "¿Por qué una herramienta dice que no tengo DKIM si mis correos sí se firman?"
    a: "DKIM no se puede listar desde el DNS sin conocer el selector. Si la herramienta prueba un selector distinto al que usa tu proveedor, no encontrará el registro aunque exista."
  - q: "¿Qué tamaño de clave DKIM debo usar?"
    a: "El RFC 8301 exige claves RSA de al menos 1024 bits y recomienda 2048. Google también recomienda claves de 2048 bits cuando el proveedor lo permite."
  - q: "¿Basta con que DKIM dé pass para cumplir con DMARC?"
    a: "No necesariamente. DMARC exige alineación: el dominio de la firma (d=) debe coincidir con el dominio del remitente visible. Un servicio que firma con su propio dominio da pass en DKIM, pero no alinea con el tuyo."
  - q: "¿Gmail, Yahoo y Outlook exigen DKIM?"
    a: "Google pide SPF o DKIM a todos los remitentes y ambos, más DMARC, a quienes envían más de 5.000 mensajes diarios a cuentas Gmail. Yahoo y Microsoft (Outlook.com) tienen requisitos similares para remitentes de alto volumen."
draft: false
---

DKIM es la firma digital que acompaña a cada correo y le permite al receptor comprobar que el mensaje viene de tu dominio y que no fue alterado en el camino. Es fácil suponer que "ya está configurado", pero cada servicio que envía con tu dominio necesita su propia firma. Aquí verás cómo comprobarlo sin depender de suposiciones.

## Cómo funciona DKIM en dos líneas

El servicio que envía el correo lo firma con una clave privada y agrega una cabecera `DKIM-Signature`. El receptor lee esa cabecera, busca la clave pública en el DNS de tu dominio y valida la firma. Así lo define el [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376).

Dos etiquetas de la cabecera son clave:

- **`d=`**: el dominio que firma, por ejemplo `ejemplo.cl`.
- **`s=`**: el [selector](/glosario/selector-dkim/), el nombre de la clave usada, por ejemplo `google` o `selector1`.

Con ambos datos, la clave pública se publica como registro TXT en `selector._domainkey.dominio`.

## Paso 1: encuentra el selector de cada servicio

A diferencia de SPF o DMARC, DKIM no tiene una dirección fija en el DNS: no se puede revisar sin saber el selector. La forma más confiable de obtenerlo es mirar un correo real.

1. Envía un correo desde el servicio que quieres revisar a una cuenta de Gmail.
2. Abre el mensaje, entra al menú de tres puntos y elige **Mostrar original**.
3. Busca la línea `DKIM-Signature` y anota los valores de `d=` y `s=`.

Repite esto para cada herramienta que envía correo con tu dominio: correo corporativo, CRM, newsletters, facturación, tienda en línea y mesa de ayuda. Cada una puede usar un selector distinto. Como referencia, Google Workspace usa por defecto el selector `google` y Microsoft 365 usa `selector1` y `selector2`.

## Paso 2: revisa el registro en el DNS

Con el selector, consulta el registro. Puedes usar el [verificador DKIM](/dkim-checker) o la línea de comandos:

```
dig TXT google._domainkey.ejemplo.cl +short
```

Un registro válido se ve así (la clave aparece abreviada):

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqh...
```

Revisa tres cosas:

- **Que el registro exista** en el nombre exacto `selector._domainkey.tudominio`.
- **Que `p=` no esté vacío.** Según el RFC 6376, una clave vacía significa que fue revocada.
- **Que la clave tenga un tamaño adecuado.** El [RFC 8301](https://www.rfc-editor.org/rfc/rfc8301) exige al menos 1024 bits y recomienda 2048. Google también [recomienda 2048 bits](https://support.google.com/a/answer/174124).

> **Advertencia:** algunos paneles DNS agregan el dominio automáticamente al final del nombre. Si escribes el nombre completo, puede quedar duplicado (`google._domainkey.ejemplo.cl.ejemplo.cl`) y la firma fallará.

## Paso 3: confirma que la firma pasa y está alineada

Que el registro exista no garantiza que la firma funcione. En el mismo **Mostrar original** de Gmail verás un resumen con el resultado de DKIM. Debe decir `PASS`.

Luego compara el dominio de `d=` con el dominio de tu remitente. DMARC ([RFC 7489](https://www.rfc-editor.org/rfc/rfc7489)) exige que estén alineados. Muchos servicios firman por defecto con su propio dominio: DKIM da pass, pero no cuenta para tu DMARC. Para corregirlo, configura en ese servicio la firma con tu dominio, normalmente agregando los registros CNAME o TXT que te indica.

Revisa también el resto de la autenticación con el [verificador de dominio](/domain-checker).

## Errores comunes al verificar DKIM

- **Probar un selector equivocado** y concluir que no hay DKIM.
- **Revisar solo el correo corporativo** y olvidar CRM, facturación o newsletters.
- **Dejar claves antiguas de 1024 bits** cuando el proveedor ya permite 2048.
- **Firmar con el dominio del proveedor** en vez del tuyo, sin alineación para DMARC.
- **Borrar un registro DKIM** de un servicio que todavía envía correos.

> **Advertencia:** antes de eliminar o rotar una clave DKIM, confirma que ningún servicio la sigue usando. Si la borras antes de tiempo, esos correos dejarán de pasar la verificación.

## Por qué importa ahora

Google [pide a todos los remitentes](https://support.google.com/a/answer/81126) configurar SPF o DKIM, y a quienes envían más de 5.000 mensajes diarios a cuentas Gmail les exige SPF, DKIM y DMARC. [Yahoo](https://senders.yahooinc.com/best-practices/) y [Microsoft para Outlook.com](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730) tienen requisitos similares para remitentes de alto volumen.

## Cómo ayuda InboxSeguro

InboxSeguro arma un inventario de los sistemas que envían correo con tu dominio a partir de los reportes DMARC, identificándolos por PTR, ASN y firma DKIM, y te permite asignar un responsable y un estado a cada uno. También muestra el estado de SPF, DKIM, DMARC, BIMI, MTA-STS y RUA, y te avisa cuando aparece un remitente nuevo. Si necesitas corregir un registro, la configuración DNS guiada con asistente de IA te acompaña paso a paso. Puedes ver los planes en [precios](/precios).

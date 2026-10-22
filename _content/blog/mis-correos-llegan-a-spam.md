---
title: "Mis correos llegan a spam: la causa oculta"
slug: mis-correos-llegan-a-spam
description: "¿Los correos de tu empresa llegan a spam? A veces la causa son servicios que envían con tu dominio sin que nadie los administre. Aprende a encontrarlos."
excerpt: "¿Los correos de tu empresa llegan a spam? A veces la causa son servicios que envían con tu dominio sin que nadie los administre."
category: Entregabilidad
date: 2026-10-13
updated: 2026-10-13
tags: [entregabilidad, spam, spf, dkim, dmarc]
keyword_objetivo: mis correos llegan a spam
featured: false
resumen: "Si los correos de tu empresa llegan a spam, la causa no siempre es el contenido: a menudo hay servicios que envían con tu dominio sin estar autorizados en SPF ni firmar con DKIM, y que nadie administra. Para corregirlo, hagan una lista de todas las herramientas que envían correo, asignen un responsable a cada una, revisen su autorización en SPF y DKIM y activen DMARC primero en modo monitoreo."
faq:
  - q: "¿Por qué mis correos llegan a spam si el contenido está bien?"
    a: "Cuando un servicio no está incluido en SPF o no firma con DKIM usando tu dominio, sus correos pueden fallar aunque el texto sea impecable."
  - q: "¿Qué revisan Gmail y Outlook antes de entregar un correo?"
    a: "Revisan SPF (servidores autorizados), DKIM (firma digital) y DMARC (la regla sobre qué hacer si un correo falla esas pruebas)."
  - q: "¿Puedo tener más de un registro SPF?"
    a: "No. Un dominio solo puede tener un registro SPF. Crear un segundo registro en vez de editar el existente puede cortar correos legítimos."
  - q: "¿Cuándo conviene pasar DMARC a quarantine o reject?"
    a: "Solo después de autorizar todos los servicios legítimos. Antes de eso, puede mandar a spam o bloquear sus propias facturas, avisos o newsletters."
draft: false
---

Si los correos de tu empresa terminan en spam, lo primero que se suele revisar es el contenido: palabras "sospechosas", demasiados enlaces o imágenes pesadas. Eso influye, pero muchas veces la causa está en otra parte: hay servicios que envían correo con el dominio de la empresa y que nadie configuró ni administra.

## Tu dominio envía correo desde más lugares de los que crees

Una empresa puede usar Google Workspace o Microsoft 365 para el correo diario, un CRM para ventas, una herramienta de marketing para newsletters, un sistema de facturación, la plataforma de su tienda en línea y una mesa de ayuda. Cada uno manda correos que dicen venir de `@ejemplo.cl`. Si alguno no está autorizado correctamente, Gmail u Outlook no pueden confirmar que esos mensajes son legítimos, y pueden mandarlos a spam o rechazarlos.

## Qué revisan Gmail y Outlook antes de entregar un correo

- **SPF:** la lista de servidores autorizados a enviar con tu dominio. Puedes revisarla con el [verificador SPF](/spf-checker).
- **DKIM:** una firma digital que prueba que el mensaje no fue alterado y que viene de quien dice. Revísala con el [verificador DKIM](/dkim-checker).
- **DMARC:** la regla que le dice al receptor qué hacer si un correo falla esas pruebas, y que además te envía reportes. Revísala con el [verificador DMARC](/dmarc-checker).

Cuando un servicio no está incluido en SPF o no firma con DKIM usando tu dominio, sus correos pueden fallar aunque el texto sea impecable.

## Por qué pasa: servicios sin dueño

Alguien de marketing contrató una herramienta hace tiempo, un proveedor configuró la facturación y ya no trabaja con ustedes, o se probó un CRM que nunca se dio de baja. Nadie sabe que esos servicios siguen enviando correo y nadie se hace cargo de su configuración. El resultado son correos legítimos que no llegan y un dominio más fácil de suplantar, porque sin una lista clara de quién puede enviar no es posible activar con confianza una política DMARC que bloquee los correos falsos.

## Cómo encontrarlos en 4 pasos

1. **Hagan una lista** de todas las herramientas que mandan correos a clientes o proveedores: facturas, avisos, newsletters, recuperación de contraseña y tickets de soporte. Un buen punto de partida es revisar el dominio con el [verificador de dominio](/domain-checker).
2. **Asignen un responsable** a cada servicio.
3. **Revisen que cada servicio esté autorizado** en SPF y firme con DKIM usando su dominio.

   > **Advertencia:** un dominio solo puede tener un registro SPF. Si crean un segundo registro en vez de editar el existente, o si borran un `include` que todavía se usa, pueden cortar correos legítimos.

4. **Activen DMARC primero en modo monitoreo** (`p=none`) y lean los reportes para descubrir los servicios que faltaban. Solo después avancen a `p=quarantine` y luego a `p=reject`.

   > **Advertencia:** pasar a cuarentena o rechazo antes de autorizar todos los servicios legítimos puede mandar a spam o bloquear sus propias facturas, avisos o newsletters.

## Cómo ayuda InboxSeguro

InboxSeguro muestra qué sistemas envían correo con el dominio de tu empresa, te permite asignar un responsable a cada uno y guía paso a paso para activar la protección contra la suplantación sin cortar los correos legítimos. Puedes ver los planes en [precios](/precios).

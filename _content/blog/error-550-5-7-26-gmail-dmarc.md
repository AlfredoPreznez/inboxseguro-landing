---
title: "Error 550 5.7.26 de Gmail: qué significa y cómo resolverlo"
slug: error-550-5-7-26-gmail-dmarc
description: "Error 550 5.7.26 de Gmail: qué significa el rechazo por política DMARC, cómo leer las cabeceras para diagnosticarlo y qué pasos seguir para resolverlo."
excerpt: "Gmail rechaza tu correo porque no pasó DMARC. Qué dice cada variante del 5.7.26, cómo diagnosticarla en las cabeceras y cómo resolverla."
category: DMARC
date: 2026-11-04
updated: 2026-11-04
tags: [dmarc, gmail, error-smtp, 5-7-26, spf, dkim, entregabilidad, empresas]
keyword_objetivo: error 550 5.7.26 gmail
featured: false
resumen: "El error 550 5.7.26 de Gmail significa que tu correo fue rechazado por falta de autenticación. En la variante de DMARC, el dominio del From tiene una política DMARC y el mensaje no pasó SPF ni DKIM alineados con ese dominio. Para resolverlo, identifica qué sistema envió el correo, configura DKIM con tu dominio o alinea SPF, y revisa la política DMARC antes de endurecerla."
faq:
  - q: "¿El error 550 5.7.26 es culpa de Gmail?"
    a: "No. Gmail aplica la política que el dueño del dominio publicó en su registro DMARC. Según la RFC 7489, el receptor puede aplicar esa política a los mensajes que fallan. La solución está en la autenticación del dominio que aparece en el From."
  - q: "¿Qué diferencia hay entre 550 5.7.26 y 451 4.7.26?"
    a: "Según Google, 550 es un rechazo definitivo. El 451 4.7.26 indica que el correo no se aceptó por la política DMARC, pero que fallas temporales de DNS impidieron la autenticación. Y el 421 4.7.26 es una limitación temporal de envío por correo no autenticado."
  - q: "¿Bajar mi DMARC a p=none soluciona el error?"
    a: "Puede detener el rechazo de la variante DMARC, pero no corrige la causa y deja tu dominio expuesto a suplantación. Además, Google documenta otras variantes del 5.7.26 que no dependen de DMARC. Lo correcto es autenticar el sistema que envía y mantener una política gradual."
draft: false
---

Un cliente no recibió la cotización. En tu bandeja aparece un rebote de Gmail con un texto como este:

```
550 5.7.26 Unauthenticated email from ejemplo.cl is not accepted due to domain's DMARC policy.
```

Este error no es un bloqueo arbitrario de Gmail. Es Gmail aplicando la política DMARC que tu propio dominio publicó. Esta guía explica qué significa, cómo diagnosticarlo y cómo resolverlo sin dejar tu dominio expuesto. Si DMARC es nuevo para ti, empieza por [qué es DMARC y cómo activarlo](/blog/que-es-dmarc-como-activarlo/).

> **¿Tienes prisa?** Revisa el registro DMARC de tu dominio con el [verificador de DMARC](/dmarc-checker).

## ¿Qué significa el error 550 5.7.26 de Gmail?

Significa que Gmail rechazó tu correo de forma definitiva porque no estaba autenticado. En su variante más común, el dominio del remitente publica una política DMARC y el mensaje no pasó esa comprobación. Google indica contactar al administrador del dominio si el correo era legítimo.

La [referencia de errores SMTP de Gmail](https://support.google.com/a/answer/3726730?hl=es) documenta tres textos para `550 5.7.26`:

| Variante | Qué dice Google |
|---|---|
| DMARC | *Unauthenticated email from domain-name is not accepted due to domain's DMARC policy.* El correo no autenticado no se acepta por la política DMARC del dominio. |
| Sin autenticación | *This email has been blocked because the sender is unauthenticated.* Gmail exige que todos los remitentes se autentiquen con SPF o DKIM, y ninguno pasó. |
| SPF con `-all` | El dominio del `MAIL FROM` tiene un SPF con fallo estricto (`-all`) y la IP que envió no pasa la comprobación. |

Google también documenta dos códigos relacionados con el mismo número:

- `451 4.7.26`: no aceptado por la política DMARC, pero fallas temporales de DNS impidieron la autenticación.
- `421 4.7.26`: envío limitado temporalmente porque el correo no está autenticado.

Esta guía se centra en la variante DMARC, aunque los pasos de diagnóstico sirven para las tres.

## ¿Por qué ocurre el rechazo por política DMARC?

Ocurre cuando ni SPF ni DKIM pasan alineados con el dominio que aparece en el `From` y ese dominio publica una política DMARC que pide rechazar o poner en cuarentena lo que falla. Gmail aplica esa política. Un SPF o DKIM que pasa con otro dominio no basta.

La [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) define dos condiciones. La primera es la **autenticación**: SPF ([RFC 7208](https://www.rfc-editor.org/rfc/rfc7208)) valida la IP contra el dominio del `MAIL FROM`, y DKIM ([RFC 6376](https://www.rfc-editor.org/rfc/rfc6376)) valida una firma hecha por el dominio de la etiqueta `d=`.

La segunda es la **alineación** (sección 3.1): el dominio que pasó SPF o DKIM debe coincidir con el dominio del `From`. En modo relajado, el predeterminado, basta con que compartan el dominio organizacional; en modo estricto deben ser idénticos (etiquetas `aspf` y `adkim`, sección 6.3).

Si ninguno de los dos pasa alineado, el mensaje falla DMARC. La etiqueta `p` indica qué pide el dueño del dominio: `none`, `quarantine` o `reject` (sección 6.3). La RFC deja la decisión final al receptor (secciones 6 y 6.7), y en este caso Gmail rechaza el mensaje.

## ¿Cómo diagnosticar el error con las cabeceras?

Envía un correo de prueba desde el mismo sistema a una cuenta de Gmail, abre "Mostrar original" y busca la cabecera Authentication-Results. Ahí verás el resultado de SPF, DKIM y DMARC y qué dominio autenticó cada uno. Si ningún dominio coincide con el del From, encontraste la causa.

Para ver la cabecera completa, Google indica en [su ayuda](https://support.google.com/mail/answer/29436?hl=es): abre el correo en Gmail desde un navegador, haz clic en **Más** junto a Responder y elige **Mostrar original**.

La cabecera `Authentication-Results`, definida en la [RFC 8601](https://www.rfc-editor.org/rfc/rfc8601), se ve parecida a esto:

```
Authentication-Results: mx.google.com;
  dkim=pass header.i=@plataforma.example.com;
  spf=pass smtp.mailfrom=rebotes@plataforma.example.com;
  dmarc=fail (p=REJECT) header.from=ejemplo.cl
```

Qué mirar:

1. **`header.from`**: el dominio que DMARC evalúa.
2. **`smtp.mailfrom`**: el dominio que evaluó SPF. ¿Coincide con el del `From`?
3. **`header.i` o `header.d`**: el dominio que firmó con DKIM. ¿Coincide con el del `From`?
4. **`dmarc=`**: el resultado final y la política publicada.

En el ejemplo, SPF y DKIM **pasan**, pero con `plataforma.example.com`, no con `ejemplo.cl`. Por eso DMARC falla. Microsoft describe este caso: el dominio del `MAIL FROM` difiere del dominio del `From` y ni SPF ni DKIM se alinean con él ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot)).

## ¿Cuáles son las causas frecuentes?

Las causas documentadas son tres: un servicio externo que envía con tu dominio sin firmar DKIM con él ni estar en tu SPF, la falta de alineación entre el dominio del sobre y el del From, y el reenvío de correos, que rompe SPF y a veces DKIM.

Microsoft enumera estas causas en su [guía para resolver problemas de autenticación](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot):

- **Servicios externos sin configurar.** Herramientas que envían en nombre de tu dominio y no están en tu SPF o no firman DKIM con tu dominio.
- **Falta de alineación.** El dominio del `MAIL FROM` es distinto del dominio del `From` y ninguno de los dos mecanismos queda alineado.
- **Reenvío.** El reenvío rompe SPF y, si se modifica el cuerpo, DKIM también falla.

La propia RFC 7489 advierte que los flujos de correo pueden ser complicados, por ejemplo por el reenvío, y que por eso el receptor puede apartarse de la política publicada (sección 6).

## ¿Cómo resolver el error 550 5.7.26?

Identifica el sistema que envió el correo rechazado, configúralo para que firme DKIM con tu dominio o para que use un MAIL FROM de tu dominio incluido en tu SPF, y verifica con una prueba que DMARC pase. Si tu política es estricta y faltan sistemas, ajústala de forma gradual mientras corriges.

1. **Identifica el sistema.** Mira el rebote y la cabecera: ¿salió de tu casilla, del CRM, del facturador, de la tienda?
2. **Configura DKIM con tu dominio.** Es la opción que Microsoft señala como preferida para servicios externos. El proveedor te dará registros DNS para publicar; la firma debe llevar `d=ejemplo.cl` o un subdominio alineado.
3. **O alinea SPF.** Configura un `MAIL FROM` personalizado con tu dominio y agrega el `include` del proveedor a tu SPF, sin superar el límite de 10 consultas DNS de la RFC 7208 (sección 4.6.4).
4. **Considera un subdominio.** Si el servicio no permite ninguna de las dos opciones, Microsoft sugiere usar un subdominio para ese servicio, con su propio registro DMARC.
5. **Prueba de nuevo.** Envía a Gmail y confirma `dmarc=pass` en "Mostrar original".

> **Advertencia:** bajar la política a `p=none` puede detener el rechazo de la variante DMARC, pero deja tu dominio expuesto a suplantación. Si lo haces, que sea temporal mientras corriges. Google recomienda implementar DMARC de forma gradual y revisar los reportes ([Google](https://support.google.com/a/answer/10032473?hl=es)).

Si tus correos no rebotan pero llegan a spam, revisa [por qué mis correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## ¿Qué códigos equivalentes usa Microsoft?

Microsoft usa 5.7.509 cuando el dominio del From falla DMARC y su política es reject, 5.7.515 en Outlook.com cuando un remitente de alto volumen no cumple los requisitos de autenticación, y 5.7.23 cuando el rechazo se debe a una violación de SPF. Las causas y soluciones se parecen a las del 5.7.26.

Según la [lista de NDR de Exchange Online](https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/non-delivery-reports-in-exchange-online/non-delivery-reports-in-exchange-online):

- **`5.7.509`**: *Access denied, sending domain [dominio] does not pass DMARC verification and has a DMARC policy of reject.* El dominio del `5322.From` no pasa DMARC.
- **`5.7.23`**: el mensaje se rechazó por una violación de SPF; el sistema de destino valida con SPF y hay un problema en tu configuración.

Según el [soporte de Microsoft para Outlook.com](https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com):

- **`5.7.515`**: *Access denied, sending domain [dominio] does not meet the required authentication level.* Aplica a remitentes de alto volumen hacia los servicios de correo de consumo de Microsoft. Exige que SPF y DKIM pasen, un registro DMARC publicado y que al menos uno esté alineado con el `From`.

## ¿Cómo ayuda InboxSeguro?

El 5.7.26 suele aparecer cuando un sistema envía con tu dominio sin que nadie lo haya configurado. Cuando apuntas el `rua` de tu DMARC a InboxSeguro, los reportes llegan a su panel y la plataforma:

- **Muestra qué sistemas envían correo con tu dominio**, a partir de los reportes DMARC, para encontrar el que no está alineado.
- **Permite asignar un responsable** a cada sistema.
- **Guía un DMARC gradual** (`none` → `quarantine` → `reject`) sin cortar correo legítimo.
- **Detecta posibles intentos de suplantación** cuando SPF y DKIM fallan, tras descartar reenvío.

Para empezar, revisa tu registro con el [verificador de DMARC](/dmarc-checker) y descubre qué servidores declara tu dominio con el [diagnosticador de quién puede enviar correos](/quien-puede-enviar-correos).

## Fuentes

- [Google: Errores y códigos SMTP de Gmail](https://support.google.com/a/answer/3726730?hl=es).
- [Google: Implementación recomendada de DMARC](https://support.google.com/a/answer/10032473?hl=es).
- [Google: Rastrear un correo mediante su cabecera completa](https://support.google.com/mail/answer/29436?hl=es).
- [RFC 7489: DMARC](https://www.rfc-editor.org/rfc/rfc7489), secciones 3.1, 6, 6.3 y 6.7.
- [RFC 7208: SPF](https://www.rfc-editor.org/rfc/rfc7208), sección 4.6.4.
- [RFC 6376: DKIM Signatures](https://www.rfc-editor.org/rfc/rfc6376), sección 3.5.
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601).
- [Microsoft Learn: Troubleshoot email authentication in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-troubleshoot).
- [Microsoft Learn: Non-delivery reports in Exchange Online](https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/non-delivery-reports-in-exchange-online/non-delivery-reports-in-exchange-online).
- [Microsoft Support: Fix NDR error 550 5.7.515 in Outlook.com](https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com).

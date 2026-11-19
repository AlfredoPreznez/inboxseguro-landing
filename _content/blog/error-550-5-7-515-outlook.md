---
title: "Error 550 5.7.515 de Outlook: causa y solución"
slug: error-550-5-7-515-outlook
description: "Qué significa el error 550 5.7.515 de Outlook.com, qué exige Microsoft (SPF, DKIM y DMARC alineado) y cómo corregir el rechazo."
excerpt: "Outlook.com rechaza tu correo con 550 5.7.515. Qué pide Microsoft a quienes envían más de 5.000 correos, cómo revisar las cabeceras y qué corregir."
category: DMARC
date: 2026-11-19
updated: 2026-11-19
tags: [outlook, microsoft, error-smtp, 5-7-515, dmarc, spf, dkim, entregabilidad, empresas]
keyword_objetivo: error 550 5.7.515
featured: false
resumen: "El error 550 5.7.515 significa que Outlook.com rechazó tu correo porque el dominio del From no cumple los requisitos de autenticación que Microsoft exige a los remitentes de alto volumen: más de 5.000 correos al día hacia sus cuentas de consumo (Outlook.com, Hotmail, Live.com, MSN). Microsoft pide que SPF y DKIM pasen, que el dominio publique un registro DMARC (al menos p=none) y que SPF o DKIM estén alineados con el From. Para resolverlo, revisa las cabeceras, identifica qué sistema envió el correo y configúralo para autenticar con tu dominio."
faq:
  - q: "¿El error 550 5.7.515 afecta a correos enviados a empresas que usan Microsoft 365?"
    a: "El anuncio de Microsoft indica que estos requisitos aplican a Outlook.com, su servicio de consumo, que incluye direcciones de outlook.com, hotmail.com y live.com. Los rechazos en buzones de Microsoft 365 usan otros códigos, como 5.7.509 cuando el dominio falla DMARC con política reject."
  - q: "¿Necesito tener DMARC en p=reject para cumplir?"
    a: "No. Microsoft exige un registro DMARC con al menos p=none, y recomienda p=reject. Lo que sí exige es que el mensaje pase DMARC, es decir, que SPF o DKIM estén alineados con el dominio del From."
  - q: "¿Basta con que SPF pase para evitar el 5.7.515?"
    a: "No. La página de soporte de Microsoft pide que pasen tanto SPF como DKIM, además de publicar DMARC y que al menos uno de los dos esté alineado con el dominio del From."
draft: false
---

Enviaste una cotización a un cliente con dirección @hotmail.com y volvió un rebote con este texto:

```
550 5.7.515 Access denied, sending domain ejemplo.cl does not meet the required authentication level.
```

No es un bloqueo al azar. Es Outlook.com aplicando los requisitos de autenticación que Microsoft exige a los dominios que envían mucho correo a sus cuentas personales. Esta guía explica qué significa el error, qué pide Microsoft y cómo corregirlo.

> **¿Tienes prisa?** Revisa si tu dominio tiene DMARC publicado con el [verificador DMARC](/dmarc-checker).

## ¿Qué significa el error 550 5.7.515?

El 550 5.7.515 significa que Outlook.com rechazó el mensaje porque el dominio que aparece en el From no alcanzó el nivel de autenticación que Microsoft exige a los remitentes de alto volumen. El 550 indica un rechazo definitivo: el correo no se entregó.

Según la [página de soporte de Microsoft](https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com), el error aparece al enviar a Outlook.com y a los servicios de correo de consumo relacionados, como Hotmail, Live.com y MSN. El texto completo agrega: *The sender's domain in the 5322.From address doesn't meet the authentication requirements defined for the sender.*

El `5322.From` es la dirección que ve el destinatario en el campo "De". Microsoft también la llama remitente P2.

## ¿A quién aplican los requisitos de Microsoft?

Aplican a los dominios que envían más de 5.000 correos al día a cuentas de Outlook.com. Microsoft anunció estos requisitos en abril de 2025 y los empezó a aplicar el 5 de mayo de 2025.

Las fuentes oficiales describen el umbral así:

- El [anuncio de Microsoft](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730) habla de dominios que envían **más de 5.000 correos al día**, y aclara que aplica a Outlook.com, el servicio de consumo que atiende direcciones de hotmail.com, live.com y outlook.com.
- La página de soporte define al remitente de alto volumen como quien envía **5.000 o más mensajes** a esos servicios usando el mismo dominio en el `5322.From`.

Un dato importante para empresas B2B: aunque tus clientes usen Microsoft 365 en su trabajo, muchas personas reciben facturas, avisos o boletines en cuentas personales de Hotmail u Outlook. Si sumas todos los sistemas que envían con tu dominio, el volumen puede crecer más de lo que parece.

## ¿Qué exige Microsoft para no recibir el 5.7.515?

Microsoft exige tres cosas: que SPF y DKIM pasen, que tu dominio publique un registro DMARC, y que el mensaje pase DMARC, es decir, que SPF o DKIM estén alineados con el dominio del From.

Según la página de soporte de Microsoft:

1. **SPF y DKIM publicados, y ambos deben pasar.** El SPF debe listar con precisión las IP o servidores autorizados a enviar.
2. **Un registro DMARC publicado.** Microsoft da este ejemplo: nombre `_dmarc`, valor TXT `v=DMARC1; p=none`. Su página de políticas indica al menos `p=none` y recomienda `p=reject`.
3. **El mensaje debe pasar DMARC.** Al menos uno de los dos, SPF o DKIM, debe estar alineado con el dominio del `5322.From`. Microsoft prefiere que estén alineados ambos.

La alineación está definida en la [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) (sección 3.1): el dominio que autenticó SPF o el dominio que firmó DKIM debe coincidir con el dominio del From. Si DMARC es nuevo para ti, empieza por [qué es DMARC y cómo activarlo](/blog/que-es-dmarc-como-activarlo/).

El anuncio de Microsoft suma recomendaciones de buenas prácticas para remitentes grandes: un From o Reply-To válido que pueda recibir respuestas, un enlace para darse de baja visible y funcional, limpieza de listas y manejo de rebotes, y asuntos claros enviados a personas que dieron su consentimiento.

## ¿Cómo diagnosticar el error con las cabeceras?

Envía un correo de prueba desde el mismo sistema a una cuenta de Outlook.com y revisa la cabecera Authentication-Results: ahí verás si SPF, DKIM y DMARC pasaron y con qué dominio. Microsoft explica cómo abrirla en [ver encabezados de mensajes de Internet en Outlook](https://support.microsoft.com/es-es/office/ver-encabezados-de-mensajes-de-internet-en-outlook-cd039382-dc6e-4264-ac74-c048563d212c).

La cabecera, definida en la [RFC 8601](https://www.rfc-editor.org/rfc/rfc8601), puede verse parecida a esto:

```
Authentication-Results: spf=pass smtp.mailfrom=rebotes.plataforma.example.com;
  dkim=fail header.d=ejemplo.cl;
  dmarc=pass action=none header.from=ejemplo.cl
```

Qué mirar, según la [guía de Microsoft sobre cabeceras](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo):

- **`header.from`**: el dominio que DMARC evalúa.
- **`smtp.mailfrom`**: el dominio del `5321.MailFrom` (también llamado Return-Path o remitente P1), que es el que evalúa SPF.
- **`header.d`**: el dominio que firmó con DKIM.
- **`spf=`, `dkim=` y `dmarc=`**: el resultado de cada uno.

En el ejemplo, DMARC pasa gracias a SPF, pero DKIM falla. Para un remitente de alto volumen eso basta para recibir el 5.7.515, porque Microsoft pide que pasen SPF y DKIM.

Microsoft también pide revisar que el dominio del Return-Path esté alineado con el del From.

## ¿Cómo resolver el error 550 5.7.515?

Identifica qué sistema envió el correo rechazado, haz que firme DKIM con tu dominio, confirma que esté autorizado en tu SPF y publica un registro DMARC. Después envía una prueba a Outlook.com y confirma que SPF, DKIM y DMARC pasen.

1. **Identifica el sistema.** El rebote te dice desde qué dirección salió: tu casilla, el CRM, el facturador, la tienda o la herramienta de boletines. Si no sabes cuáles envían con tu dominio, revisa [cómo saber quién está enviando correos con tu dominio](/blog/quien-esta-enviando-correos-con-mi-dominio/).
2. **Configura DKIM con tu dominio.** El servicio te dará los registros DNS para publicar. La firma debe llevar tu dominio, por ejemplo `d=ejemplo.cl`. Puedes revisar el resultado con el [verificador DKIM](/dkim-checker) o la guía para [verificar DKIM de tu dominio](/blog/como-verificar-dkim-de-tu-dominio/).
3. **Revisa tu SPF.** Microsoft pide que tu SPF incluya las IP o los `include` que exige cada servicio. Puedes leer tu registro con el [verificador SPF](/spf-checker), que además cuenta las consultas DNS frente al límite de 10 de la [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208) (sección 4.6.4).
4. **Publica DMARC.** Si no tienes, empieza con `p=none` y un `rua` para recibir reportes. Microsoft pide al menos esa política.
5. **Revisa los servicios externos.** Para cada servicio que envía en tu nombre, Microsoft pide confirmar que el MAIL FROM use tu dominio, que DKIM firme con tu dominio, que tu SPF lo incluya y que DMARC se evalúe con tu dominio.
6. **Prueba de nuevo.** Envía a una cuenta de Outlook.com y confirma `spf=pass`, `dkim=pass` y `dmarc=pass` en la cabecera.

Si el rechazo viene de Gmail con otro código, revisa la guía del [error 550 5.7.26 de Gmail](/blog/error-550-5-7-26-gmail-dmarc/). Si tus correos no rebotan pero llegan a spam, revisa [por qué mis correos llegan a spam](/blog/mis-correos-llegan-a-spam/).

## ¿En qué se diferencia del 5.7.509 y del 5.7.26?

El 5.7.515 es un rechazo de Outlook.com por no cumplir los requisitos de remitente de alto volumen. El 5.7.509 aparece en Exchange Online cuando el dominio del From falla DMARC y su política es reject. El 5.7.26 es el código que usa Gmail.

- **`5.7.509`**: según la [lista de NDR de Exchange Online](https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/non-delivery-reports-in-exchange-online/non-delivery-reports-in-exchange-online), *Access denied, sending domain [dominio] does not pass DMARC verification and has a DMARC policy of reject.* Lo provoca la política que tu propio dominio publicó.
- **`5.7.515`**: lo provoca la regla de Microsoft para remitentes de alto volumen. Puede aparecer aunque tu política DMARC sea `p=none`, si SPF o DKIM no pasan.
- **`5.7.26`**: es el rechazo de Gmail por falta de autenticación. Google también tiene requisitos para quienes envían más de 5.000 mensajes al día a cuentas personales de Gmail.

## ¿Cómo ayuda InboxSeguro?

El 5.7.515 suele aparecer porque un sistema envía con tu dominio sin DKIM o sin alineación, y nadie lo tenía identificado. Cuando apuntas el `rua` de tu DMARC a InboxSeguro, los reportes llegan a su panel y la plataforma:

- **Muestra qué sistemas envían correo con tu dominio**, a partir de los reportes DMARC, para encontrar el que no autentica.
- **Permite asignar un responsable** a cada sistema.
- **Guía un DMARC gradual** (`none` → `quarantine` → `reject`) sin cortar correo legítimo.
- **Muestra el estado DNS** de SPF, DKIM, DMARC, BIMI, MTA-STS y RUA.

Para empezar, revisa tu dominio con el [diagnóstico de dominio](/domain-checker) y descubre qué servidores declara tu SPF con el [diagnosticador de quién puede enviar correos](/quien-puede-enviar-correos).

## Fuentes

- [Microsoft Support: Fix NDR error 550 5.7.515 in Outlook.com](https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com).
- [Microsoft Tech Community: Strengthening Email Ecosystem: Outlook's New Requirements for High-Volume Senders](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730) (2 de abril de 2025, actualizado el 29 de abril de 2025).
- [Outlook.com Postmaster: Policies](https://postmaster.outlook.com/policies.aspx).
- [Microsoft Support: Ver encabezados de mensajes de Internet en Outlook](https://support.microsoft.com/es-es/office/ver-encabezados-de-mensajes-de-internet-en-outlook-cd039382-dc6e-4264-ac74-c048563d212c).
- [Microsoft Learn: Anti-spam message headers in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo).
- [Microsoft Learn: Non-delivery reports in Exchange Online](https://learn.microsoft.com/en-us/exchange/mail-flow-best-practices/non-delivery-reports-in-exchange-online/non-delivery-reports-in-exchange-online).
- [Google: Directrices para remitentes de correo electrónico](https://support.google.com/a/answer/81126?hl=es).
- [RFC 7489: DMARC](https://www.rfc-editor.org/rfc/rfc7489), sección 3.1.
- [RFC 7208: SPF](https://www.rfc-editor.org/rfc/rfc7208), sección 4.6.4.
- [RFC 8601: Message Header Field for Indicating Message Authentication Status](https://www.rfc-editor.org/rfc/rfc8601).

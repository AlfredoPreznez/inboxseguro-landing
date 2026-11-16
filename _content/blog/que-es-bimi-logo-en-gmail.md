---
title: "Qué es BIMI y cómo mostrar tu logo en Gmail"
slug: que-es-bimi-logo-en-gmail
description: "Qué es BIMI y qué necesita tu empresa para mostrar su logo en Gmail: certificado VMC o CMC, DMARC en quarantine o reject, logo SVG y registro TXT."
excerpt: "BIMI permite mostrar el logo de tu empresa junto a tus correos. Qué pide Google: certificado VMC o CMC, DMARC estricto, un logo SVG y un registro DNS."
category: Entregabilidad
date: 2026-11-16
updated: 2026-11-16
tags: [bimi, dmarc, gmail, vmc, cmc, autenticacion, empresas]
keyword_objetivo: qué es BIMI
featured: false
resumen: "BIMI (Brand Indicators for Message Identification) permite que los clientes de correo compatibles muestren el logo de tu organización junto a tus mensajes. Para verlo en Gmail, Google pide un certificado VMC o CMC emitido por una autoridad certificadora, DMARC con p=quarantine o p=reject y pct=100, un logo en formato SVG Tiny PS y un registro TXT de BIMI que apunte al archivo PEM. Antes de BIMI conviene ordenar la autenticación y avanzar con DMARC de forma gradual."
faq:
  - q: "¿BIMI mejora la entregabilidad de mis correos?"
    a: "Las fuentes consultadas no lo prometen. El borrador de BIMI indica que BIMI se apoya en SPF, DKIM y DMARC, pero no es un protocolo de autenticación nuevo, y que cada cliente de correo decide si muestra el logo. Yahoo, por ejemplo, exige además suficiente reputación e interacción del remitente."
  - q: "¿Necesito tener mi logo registrado como marca?"
    a: "Para un VMC, sí: Google indica que el logo debe estar registrado como marca comercial y que el registro puede demorar entre 6 y 12 meses. Si tu logo no está registrado, Google permite configurar BIMI con un CMC."
  - q: "¿BIMI funciona con DMARC en p=none?"
    a: "No. Google indica que BIMI no admite políticas DMARC con p=none: la política debe ser quarantine o reject, con pct en 100. El borrador de BIMI dice lo mismo."
draft: false
---

Abres Gmail y ves que los correos de algunas marcas aparecen con su logo. Los de tu empresa, en cambio, se ven con un círculo y una inicial. Lo que permite mostrar ese logo se llama **BIMI**, y requiere varios pasos previos.

En esta guía verás qué es BIMI, qué pide Google para mostrar tu logo en Gmail y en qué orden conviene configurarlo.

> **¿Tienes prisa?** BIMI exige que tu política DMARC esté en `quarantine` o `reject`. Revisa cómo está la tuya con el [verificador DMARC](/dmarc-checker).

## Qué es BIMI

**BIMI** son las siglas de *Brand Indicators for Message Identification* (en español, indicadores de marca para la identificación de mensajes). Según la ayuda de Google Workspace, permite agregar el logo de tu organización a los correos que envías desde tu dominio. Los clientes de correo compatibles con BIMI muestran ese logo junto a tus mensajes en la bandeja del destinatario.

Google agrega un punto clave: **un tercero verifica los logos** que se usan con BIMI. Así, quien recibe el correo puede confiar en que el logo que ve es legítimo.

BIMI está descrito en un documento del IETF, el organismo que publica los estándares técnicos de internet. Ojo: hoy ese documento es un **borrador** (Internet-Draft), no una RFC aprobada. Su versión 15 es del 31 de octubre de 2026.

Ese borrador aclara dos cosas importantes:

- BIMI se apoya en SPF, DKIM y DMARC, pero **no es un nuevo protocolo de autenticación**.
- Cada cliente de correo define sus propias reglas para mostrar el logo. Puede mostrar otro indicador o ninguno.

Si quieres una definición corta, revisa la entrada [BIMI del glosario](/glosario/bimi/).

## Qué necesitas según Google

La página "Configura BIMI" de Google Workspace enumera estos requisitos.

### 1. Un certificado VMC o CMC

Un **certificado** es un archivo digital que emite una **autoridad certificadora** (AC), una empresa que verifica tu identidad y tu derecho a usar el logo. Para BIMI hay dos tipos:

- **VMC** (certificado de marca verificada). Google lo recomienda. Para obtenerlo, tu logo debe estar registrado como marca comercial en una oficina de propiedad intelectual reconocida por los emisores de VMC. Google indica que ese registro puede demorar entre 6 y 12 meses y sugiere hacerlo con tu equipo legal o un abogado.
- **CMC** (certificado de marca común). Si tu logo no está registrado, Google permite usar BIMI con un CMC.

En Gmail, según Google, aparece una **marca de verificación** junto a los remitentes verificados con un VMC.

Google remite a la lista de emisores que mantiene el grupo de trabajo de BIMI (AuthIndicators Working Group). A noviembre de 2026, esa lista incluye a DigiCert, GlobalSign y SSL.com. El mismo grupo aclara que cada proveedor de correo decide qué emisores acepta.

### 2. DMARC con una política estricta

**DMARC** es un registro en el DNS que le dice al receptor qué hacer con los correos que usan tu dominio sin pasar la autenticación. El **DNS** es el sistema que guarda la información pública de tu dominio. Si no lo tienes configurado, empieza por [qué es DMARC y cómo activarlo](/blog/que-es-dmarc-como-activarlo/).

Para BIMI, Google pide:

- **Política** (`p`) en `quarantine` (enviar a spam) o `reject` (rechazar). BIMI no admite `p=none`. Si no conoces estos valores, revisa qué es la [política DMARC](/glosario/politica-dmarc/).
- **Porcentaje** (`pct`) en 100, para que la política se aplique a todo tu correo.
- Antes de configurar DMARC, debes tener **SPF o DKIM**. SPF indica qué servidores pueden enviar con tu dominio; DKIM agrega una firma digital al mensaje. Puedes revisar tu firma con la guía para [verificar DKIM](/blog/como-verificar-dkim-de-tu-dominio/).

Una nota sobre `pct`: la RFC 9989, que reemplazó a la RFC 7489 como estándar de DMARC, eliminó esa etiqueta y creó la etiqueta `t` para pruebas. En la RFC 7489, si `pct` no aparece, su valor por defecto es 100. El borrador de BIMI pide que, si el registro incluye `pct` con `quarantine`, sea `pct=100`.

El borrador también pide que la política estricta exista en el dominio principal y en el dominio que aparece en el remitente, y que la subpolítica (`sp`) no sea `none`. Además, los correos deben estar alineados: el dominio del remitente visible debe coincidir con el que validan SPF o DKIM. Lo explicamos en [alineación DMARC](/glosario/alineacion-dmarc/).

### 3. Un servidor web con HTTPS

Tus archivos de BIMI deben alojarse en un servidor web público que use **HTTPS**, la versión cifrada de la web. Google recomienda usar TLS 1.2 o posterior. **TLS** es el protocolo que cifra esa conexión.

## El logo: formato SVG Tiny PS

BIMI usa logos en **SVG**, un formato de imagen vectorial que se ve nítido en cualquier tamaño. Al pedir el VMC o el CMC, envías tu logo en ese formato.

Según Google, el archivo debe usar la variante **SVG Tiny PS** (Portable/Secure), con estos atributos:

- `baseProfile` con el valor `tiny-ps`.
- `version` con el valor `1.2`.

El archivo **no puede incluir**:

- Enlaces o referencias externas.
- Scripts (secuencias de comandos).
- Animaciones u otros elementos interactivos.
- Los atributos `x=` o `y=` en el elemento raíz `<svg>`.

Gmail suma requisitos propios:

- El logo debe medir al menos **96 píxeles** de alto y de ancho.
- El tamaño se indica en píxeles absolutos, por ejemplo `width="96" height="96"`. No se aceptan medidas relativas como `width="100%"`.

Y algunas recomendaciones de Google:

- Logo centrado en un cuadrado.
- Fondo de color liso, porque los fondos transparentes pueden no verse como esperas.
- Archivo de **32 KB o menos**.
- Un elemento `<desc>` (descripción) para accesibilidad.

## El registro TXT de BIMI

Cuando la autoridad certificadora emite tu VMC o CMC, recibes un **archivo PEM**. Google explica que ese archivo incorpora tu logo y el certificado. A ese archivo debes agregar los certificados intermedios y raíz de la autoridad, en el orden en que se emitieron.

Según Google, **Gmail solo muestra logos BIMI con archivo PEM**. Un registro que apunte solo a un SVG no sirve para Gmail.

Luego subes el PEM a tu servidor web y publicas un **registro TXT** en el DNS. Para el dominio ejemplo.cl, se vería así:

- **Tipo:** TXT
- **Host:** `default._bimi.ejemplo.cl`
- **Valor:** `v=BIMI1;l=;a=https://imagenes.ejemplo.cl/marca/certificado.pem`
- **TTL:** 1 hora (3.600 segundos), como sugiere Google.

Qué significa cada parte:

- `default` es el **selector**, el nombre del registro. El borrador de BIMI define `default` como el registro predeterminado.
- `v=BIMI1` indica la versión de BIMI.
- `l=` es la ubicación del logo SVG. Con un archivo PEM, Google lo deja vacío.
- `a=` es la URL del archivo PEM con tu certificado.

Google advierte que el número 1, la I mayúscula y la l minúscula se parecen. Revisa bien lo que escribes. Después de publicar el registro, **tu logo puede tardar hasta 48 horas** en aparecer en los buzones de los destinatarios.

## Qué pasa en otros proveedores

Yahoo explica en su página para remitentes que muestra logos BIMI en sus apps de Yahoo y AOL si se cumplen estas condiciones:

- Existe un registro BIMI que apunta a un logo SVG válido.
- La política DMARC está en `quarantine` o `reject`.
- El envío es masivo; Yahoo no muestra logos en correos personales.
- El remitente tiene suficiente reputación e interacción.

Yahoo indica que hoy no exige VMC, aunque si el registro incluye uno, lo considera.

## En qué orden hacerlo en tu empresa

El paso más delicado no es el logo, sino DMARC. BIMI exige `quarantine` o `reject`, y llegar ahí sin preparación puede afectar correos legítimos.

### 1. Identifica quién envía con tu dominio

Además de tu correo corporativo, pueden enviar con tu dominio el CRM, el sistema de facturación o la herramienta de marketing. Cada uno necesita autenticarse con SPF o DKIM. Si usas Google Workspace, sigue la guía para [configurar DKIM y DMARC en Google Workspace](/como-configurar-dkim-dmarc-google-workspace).

### 2. Avanza con DMARC de forma gradual

La RFC 9989 recomienda empezar con `p=none`, que solo monitorea, y usar los informes para encontrar servidores o servicios olvidados (secciones 5.1.4 y 5.1.5). Los flujos legítimos que no pasen deben corregirse antes de aplicar una política estricta (sección 5.1.6). La sección 5.1.7 advierte que esto puede tomar muchos meses.

> **Advertencia:** si pasas a `p=quarantine` o `p=reject` antes de autenticar todos tus sistemas, puedes cortar correos legítimos, como facturas o avisos a clientes. No apures DMARC solo para tener el logo. Avanza paso a paso.

Una política estricta también ayuda a frenar a quien intenta enviar con tu nombre. Si te preocupa eso, lee [cómo saber si suplantan tu dominio](/blog/como-saber-si-suplantan-tu-dominio/).

### 3. Después, BIMI

Con DMARC en `quarantine` o `reject` y `pct=100`, ya puedes preparar el logo, pedir el certificado y publicar el registro.

## Cómo ayuda InboxSeguro

InboxSeguro no crea tu logo, no emite el VMC ni el CMC y no publica el registro BIMI. Te ayuda con lo que BIMI necesita antes:

- Te muestra qué sistemas envían correo con tu dominio.
- Te guía para avanzar con DMARC de `p=none` a `quarantine` y `reject` sin cortar correos legítimos.
- Muestra el estado DNS de SPF, DKIM, DMARC, BIMI, MTA-STS y RUA.

Conoce más en [DMARC para empresas](/dmarc-para-empresas).

## Fuentes

- [Google Workspace: Configura BIMI](https://support.google.com/a/answer/10911320?hl=es) (también en [inglés](https://support.google.com/a/answer/10911320?hl=en)).
- [Google Workspace: Agrega un registro TXT de BIMI a tu dominio (pasos detallados)](https://knowledge.workspace.google.com/admin/security/add-a-bimi-txt-record-to-your-domain-detailed-steps?hl=es).
- [Google Workspace: Soluciona problemas de BIMI](https://knowledge.workspace.google.com/admin/security/troubleshoot-bimi-issues?hl=es).
- [BIMI Group: Mark Certificate Issuer Information](https://bimigroup.org/vmc-issuers/).
- [IETF: draft-brand-indicators-for-message-identification-15](https://datatracker.ietf.org/doc/draft-brand-indicators-for-message-identification/) (borrador, no RFC), secciones 1, 2, 4.1, 4.4 y 7.1.
- [Yahoo Sender Hub: BIMI](https://senders.yahooinc.com/bimi/).
- [RFC 9989: DMARC](https://www.rfc-editor.org/rfc/rfc9989), secciones 5.1.4 a 5.1.7 y apéndice A.6. Reemplaza a la [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489), sección 6.3 (etiqueta `pct`).

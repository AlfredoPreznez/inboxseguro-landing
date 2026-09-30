# Panel contrib: tool lead summary

Código listo para integrar en `panel.inboxseguro.com`.

## Endpoint

`POST /api/public/tool-lead-summary`

Body:
```json
{
  "email": "ops@empresa.com",
  "domain": "empresa.com",
  "tool_name": "sending_systems",
  "consent_summary": true,
  "consent_marketing": false
}
```

El backend **recalcula** señales con la misma lógica de `sending-systems`. Ignora cualquier snapshot del frontend.

## Integración

1. Copia `tool_lead_summary/` al codebase del panel (o instálalo como paquete local).
2. Inyecta:
   - `analyze_sending_systems(domain)` → misma función que usa `/api/public/sending-systems`
   - `send_email(payload)` → SES/transaccional existente (`to`, `from`, `reply_to`, `subject`, `text`, `html`)
3. Registra el blueprint de `flask_route.py`.
4. Persistencia: sustituye `InMemoryLeadStore` por tu modelo DB cuando despliegues.

## Tests

```bash
python panel-contrib/tool_lead_summary/test_tool_lead_summary.py
```

## Consentimiento

- `consent_summary` (obligatorio, version `summary_email_v1`): solo el resumen.
- `consent_marketing` (opcional, version `marketing_opt_in_v1`): comunicaciones comerciales futuras.

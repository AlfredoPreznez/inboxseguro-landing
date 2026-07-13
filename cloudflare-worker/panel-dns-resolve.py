# Snippet Flask para panel.inboxseguro.com
# Añadir a las rutas públicas existentes (junto a diagnosis-notify)

import re
import requests
from flask import jsonify, request

DNS_NAME_RE = re.compile(r'^[a-zA-Z0-9.*_@-]+$')
ALLOWED_TYPES = {'TXT', 'A', 'AAAA', 'MX', 'CNAME', 'NS', 'SOA'}


@public_bp.get('/dns-resolve')
def public_dns_resolve():
    name = (request.args.get('name') or '').strip().lower()
    rtype = (request.args.get('type') or 'TXT').upper()

    if not name or len(name) > 253 or not DNS_NAME_RE.match(name):
        return jsonify({'error': 'Invalid DNS name'}), 400
    if rtype not in ALLOWED_TYPES:
        return jsonify({'error': 'Invalid DNS type'}), 400

    try:
        upstream = requests.get(
            'https://cloudflare-dns.com/dns-query',
            params={'name': name, 'type': rtype},
            headers={'Accept': 'application/dns-json'},
            timeout=5,
        )
        upstream.raise_for_status()
        data = upstream.json()
        if not isinstance(data.get('Status'), int):
            return jsonify({'error': 'Invalid upstream response'}), 502
        return jsonify(data), 200
    except Exception as exc:
        return jsonify({'error': 'DNS lookup failed', 'detail': str(exc)}), 502

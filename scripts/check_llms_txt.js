#!/usr/bin/env node
'use strict';

/**
 * Comprueba que cada URL de llms.txt:
 * - no esté repetida, y
 * - aparezca en sitemap.xml O responda HTTP 200 (tras redirects).
 *
 * Uso: node scripts/check_llms_txt.js
 * Sin red (solo sitemap): CHECK_LLMS_HTTP=0 node scripts/check_llms_txt.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const root = path.resolve(__dirname, '..');
const llmsPath = path.join(root, 'llms.txt');
const sitemapPath = path.join(root, 'sitemap.xml');
const checkHttp = process.env.CHECK_LLMS_HTTP !== '0';

function urlsFromLlms(text) {
  const found = [];
  const re = /https?:\/\/[^\s\)\]\>\"'<]+/g;
  let m;
  while ((m = re.exec(text))) {
    found.push(m[0].replace(/[.,;:!?]+$/, ''));
  }
  return found;
}

function urlsFromSitemap(xml) {
  const found = [];
  const re = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) found.push(m[1].trim());
  return found;
}

function httpStatus(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      { method: 'GET', timeout: 15000, headers: { 'User-Agent': 'inboxseguro-llms-check/1.0' } },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          httpStatus(next).then(resolve);
          return;
        }
        res.resume();
        resolve(code);
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

async function main() {
  const llms = fs.readFileSync(llmsPath, 'utf8');
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const sitemapUrls = new Set(urlsFromSitemap(sitemap));

  const urls = urlsFromLlms(llms);
  const seen = new Map();
  for (const u of urls) {
    seen.set(u, (seen.get(u) || 0) + 1);
  }

  const dupes = [];
  for (const [u, n] of seen) {
    if (n > 1) dupes.push(`${u} (x${n})`);
  }

  const unique = [...seen.keys()];
  const missing = [];
  const viaHttp = [];
  for (const u of unique) {
    if (sitemapUrls.has(u)) continue;
    if (!checkHttp) {
      missing.push(`${u} (no está en sitemap; omite CHECK_LLMS_HTTP=0 o deja HTTP activo)`);
      continue;
    }
    const code = await httpStatus(u);
    if (code !== 200) {
      missing.push(`${u} (HTTP ${code || 'error'}; tampoco en sitemap)`);
    } else {
      viaHttp.push(u);
    }
  }

  if (dupes.length || missing.length) {
    if (dupes.length) {
      console.error('URLs repetidas en llms.txt:');
      dupes.forEach((d) => console.error(' -', d));
    }
    if (missing.length) {
      console.error('URLs fuera de sitemap / sin HTTP 200:');
      missing.forEach((m) => console.error(' -', m));
    }
    process.exit(1);
  }

  const viaSitemap = unique.filter((u) => sitemapUrls.has(u)).length;
  console.log(
    `OK: ${unique.length} URLs únicas en llms.txt (${viaSitemap} en sitemap` +
      (viaHttp.length ? `, ${viaHttp.length} por HTTP 200` : '') +
      `).`
  );
  if (viaHttp.length) {
    viaHttp.forEach((u) => console.log(' HTTP-only:', u));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

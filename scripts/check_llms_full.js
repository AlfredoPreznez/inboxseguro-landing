#!/usr/bin/env node
'use strict';

/**
 * Comprueba la integridad de llms-full.txt:
 * - Existe y tiene tamaño suficiente.
 * - Incluye las secciones obligatorias (Glosario, Guías, Blog, FAQ).
 * - Todas las URLs de inboxseguro.com mencionadas aparecen en sitemap.xml o responden HTTP 200.
 *
 * Uso: node scripts/check_llms_full.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const llmsFullPath = path.join(root, 'llms-full.txt');
const sitemapPath = path.join(root, 'sitemap.xml');

function urlsFromText(text) {
  const found = [];
  const re = /https:\/\/www\.inboxseguro\.com[^\s\)\]\>\"'<]+/g;
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

function main() {
  if (!fs.existsSync(llmsFullPath)) {
    console.error('ERROR: llms-full.txt no existe. Ejecuta python3 scripts/build_llms_full.py primero.');
    process.exit(1);
  }

  const stat = fs.statSync(llmsFullPath);
  if (stat.size < 10000) {
    console.error(`ERROR: llms-full.txt es demasiado pequeño (${stat.size} bytes).`);
    process.exit(1);
  }

  const content = fs.readFileSync(llmsFullPath, 'utf8');
  const requiredSections = [
    '## Glosario Técnico Completo',
    '## Guías de Configuración Paso a Paso',
    '## Artículos Técnicos de Soporte',
    '## Preguntas Frecuentes',
    '## Límites y precisión'
  ];

  const missingSections = requiredSections.filter((s) => !content.includes(s));
  if (missingSections.length > 0) {
    console.error('ERROR: llms-full.txt no contiene las secciones requeridas:');
    missingSections.forEach((s) => console.error(' -', s));
    process.exit(1);
  }

  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const sitemapUrls = new Set(urlsFromSitemap(sitemap));
  const urls = urlsFromText(content);
  const uniqueUrls = [...new Set(urls)];

  const missingFromSitemap = uniqueUrls.filter((u) => {
    // Permitir archivo llms-full.txt y contacto
    if (u === 'https://www.inboxseguro.com/llms-full.txt') return false;
    if (u === 'https://www.inboxseguro.com/contacto') return false;
    return !sitemapUrls.has(u);
  });

  if (missingFromSitemap.length > 0) {
    console.error('ERROR: URLs en llms-full.txt que no están en el sitemap:');
    missingFromSitemap.forEach((u) => console.error(' -', u));
    process.exit(1);
  }

  console.log(`OK: llms-full.txt validado (${stat.size} bytes, ${uniqueUrls.length} URLs verificadas, todas las secciones presentes).`);
}

main();

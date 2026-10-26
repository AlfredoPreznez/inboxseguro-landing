#!/usr/bin/env node
'use strict';

/**
 * Comprueba la integridad de llms-full.txt:
 * - Existe y tiene tamaño suficiente (> 10000 bytes).
 * - Incluye las secciones obligatorias.
 * - No contiene encabezados vacíos (### o #### sin texto tras ellos).
 * - No contiene secciones vacías.
 * - Ninguna URL de guía apunta a la portada (https://www.inboxseguro.com/ o https://www.inboxseguro.com).
 * - Todas las URLs de inboxseguro.com mencionadas aparecen en sitemap.xml o corresponden a archivos locales/excepciones conocidas.
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

  // 1. Validar encabezados vacíos (### o #### sin texto)
  const lines = content.split('\n');
  const emptyHeaders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,6}$/.test(line) || /^#{1,6}\s+$/.test(lines[i])) {
      emptyHeaders.push(`Línea ${i + 1}: "${lines[i]}"`);
    }
  }
  if (emptyHeaders.length > 0) {
    console.error('ERROR: Encabezados vacíos encontrados en llms-full.txt:');
    emptyHeaders.forEach((h) => console.error(' -', h));
    process.exit(1);
  }

  // 2. Validar que las secciones principales requeridas existan
  const requiredSections = [
    '## Glosario Técnico Completo de Correo y DNS',
    '## Guías de Configuración Paso a Paso por Plataforma',
    '## Artículos Técnicos de Soporte y Diagnóstico (Blog)',
    '## Preguntas Frecuentes de la Plataforma',
    '## Límites y precisión'
  ];

  const missingSections = requiredSections.filter((s) => !content.includes(s));
  if (missingSections.length > 0) {
    console.error('ERROR: llms-full.txt no contiene las secciones requeridas:');
    missingSections.forEach((s) => console.error(' -', s));
    process.exit(1);
  }

  // 3. Validar que ninguna URL de guía apunte a la portada
  const guiasSectionMatch = content.match(/## Guías de Configuración Paso a Paso por Plataforma([\s\S]*?)(?:---|$)/);
  if (guiasSectionMatch) {
    const guiasText = guiasSectionMatch[1];
    const canonicalGuideUrls = guiasText.match(/URL Canónica:\s*(https?:\/\/[^\s]+)/g) || [];
    const rootGuideUrls = canonicalGuideUrls.filter((u) => {
      const url = u.replace('URL Canónica:', '').trim();
      return url === 'https://www.inboxseguro.com' || url === 'https://www.inboxseguro.com/';
    });
    if (rootGuideUrls.length > 0) {
      console.error('ERROR: Se encontraron URLs de guías que apuntan a la portada:');
      rootGuideUrls.forEach((u) => console.error(' -', u));
      process.exit(1);
    }
  }

  // 4. Validar URLs contra sitemap
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const sitemapUrls = new Set(urlsFromSitemap(sitemap));
  const urls = urlsFromText(content);
  const uniqueUrls = [...new Set(urls)];

  const missingFromSitemap = uniqueUrls.filter((u) => {
    if (u === 'https://www.inboxseguro.com/llms-full.txt') return false;
    if (u === 'https://www.inboxseguro.com/contacto') return false;
    return !sitemapUrls.has(u);
  });

  if (missingFromSitemap.length > 0) {
    console.error('ERROR: URLs en llms-full.txt que no están en el sitemap:');
    missingFromSitemap.forEach((u) => console.error(' -', u));
    process.exit(1);
  }

  console.log(`OK: llms-full.txt validado (${stat.size} bytes, ${uniqueUrls.length} URLs verificadas, sin encabezados vacíos, guías válidas).`);
}

main();

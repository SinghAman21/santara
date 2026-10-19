import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir(new URL('../build/', import.meta.url), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const svg = await readFile(new URL('../public/santara.svg', import.meta.url), 'utf8');
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`);
  await page.screenshot({ path: new URL('../build/icon.png', import.meta.url).pathname, omitBackground: true });
  await page.setViewportSize({ width: 256, height: 256 });
  await page.locator('svg').evaluate(element => { element.setAttribute('width', '256'); element.setAttribute('height', '256'); });
  const png = await page.screenshot({ omitBackground: true });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(new URL('../build/icon.ico', import.meta.url), Buffer.concat([header, png]));
  console.log('Generated original Santara PNG and Windows ICO assets.');
} finally { await browser.close(); }

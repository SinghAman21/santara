import { chromium } from '@playwright/test';

const browser = await chromium.launch(process.env.SANTARA_BROWSER_CHANNEL ? { channel: process.env.SANTARA_BROWSER_CHANNEL } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  await page.goto(process.env.SANTARA_PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.getByRole('heading', { name: 'Good things come in new formats.' }).waitFor();
  await page.screenshot({ path: '/tmp/santara-home.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'General', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/santara-settings.png' });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.screenshot({ path: '/tmp/santara-settings-dark.png' });
  await page.getByRole('button', { name: 'Converter', exact: true }).click();
  await page.screenshot({ path: '/tmp/santara-dark.png' });
  console.log('Saved /tmp/santara-{home,settings,settings-dark,dark}.png at 1440x1000');
} finally {
  await browser.close();
}

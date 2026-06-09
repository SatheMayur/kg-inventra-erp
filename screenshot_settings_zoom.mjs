import puppeteer from 'puppeteer';
import path from 'path';

const OUT = 'C:\\Users\\it.support\\Desktop\\inventra-screenshots';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1400, height: 1200 },
});
const page = await browser.newPage();

await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForSelector('input', { timeout: 10000 });
const inputs = await page.$$('input');
await inputs[0].type('software');
await inputs[1].type('pass123');
await page.keyboard.press('Enter');
await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2500));

// Go Settings
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')];
  const btn = btns.find(b => b.textContent.includes('Settings'));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: path.join(OUT, 'zoom-settings.png'), fullPage: true });
console.log('✓ zoom-settings.png');

// Go Dashboard - full page
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')];
  const btn = btns.find(b => b.textContent.trim() === 'Dashboard');
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: path.join(OUT, 'zoom-dashboard.png'), fullPage: true });
console.log('✓ zoom-dashboard.png');

// Users view
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role="button"]')];
  const btn = btns.find(b => b.textContent.includes('User Management'));
  if (btn) btn.click();
});
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: path.join(OUT, 'zoom-users.png'), fullPage: true });
console.log('✓ zoom-users.png');

await browser.close();

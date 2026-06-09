import puppeteer from 'puppeteer';
import path from 'path';

const OUT = 'C:\\Users\\it.support\\Desktop\\inventra-screenshots';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();

// Login
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForSelector('input', { timeout: 10000 });
const inputs = await page.$$('input');
await inputs[0].type('software');
await inputs[1].type('pass123');
await page.keyboard.press('Enter');
await page.waitForNetworkIdle({ timeout: 12000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2500));

async function nav(label) {
  await page.evaluate((lbl) => {
    const btns = [...document.querySelectorAll('button, [role="button"], a')];
    const btn = btns.find(b => b.textContent.trim() === lbl || b.textContent.includes(lbl));
    if (btn) btn.click();
  }, label);
  await new Promise(r => setTimeout(r, 2000));
}

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `audit-${name}.png`) });
  console.log(`✓ audit-${name}.png`);
}

// Dashboard
await shot('01-dashboard');

// Inventory
await nav('Inventory'); await shot('02-inventory');

// Requests
await nav('All Requests'); await shot('03-requests');

// Procurement
await nav('Procurement'); await shot('04-procurement');

// Logistics
await nav('Logistics'); await shot('05-logistics');

// Stock Transfers
await nav('Stock Transfers'); await shot('06-transfers');

// Issuance
await nav('Issuance'); await shot('07-issuance');

// Reporting
await nav('Reporting'); await shot('08-reporting');

// Transactions
await nav('Transactions'); await shot('09-transactions');

// Settings
await nav('Settings'); await shot('10-settings');

await browser.close();
console.log('All done.');

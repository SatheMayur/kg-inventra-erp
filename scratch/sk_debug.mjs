import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.type('input[type=email]', 'admin@fg.local');
await page.type('input[type=password]', 'Admin@1234');
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
]);

page.on('response', r => {
  if (r.url().includes('/api/normalize')) console.log('API:', r.status(), r.url());
});

await page.goto('http://localhost:5173/normalize', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 800));
await page.click('textarea');
await page.keyboard.type('aloo 2kg\nbhindi\nkashmiri lal mirch', { delay: 5 });
await new Promise(r => setTimeout(r, 200));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Normalize');
  if (b) b.click(); else console.error('button not found');
});
await new Promise(r => setTimeout(r, 4000));
const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log('AFTER CLICK:', text);
await page.screenshot({ path: 'scratch/sk_debug.png', fullPage: true });
await browser.close();

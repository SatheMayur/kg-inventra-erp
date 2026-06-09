import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.type('input[type=email]', 'admin@fg.local');
await page.type('input[type=password]', 'Admin@1234');
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
]);

await page.goto('http://localhost:5173/opening-stock', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: 'scratch/sk_opening_stock.png', fullPage: false });
console.log('saved sk_opening_stock.png');

await browser.close();

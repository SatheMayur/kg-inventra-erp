import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 800 });

// Login as sales (non-admin)
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.type('input[type=email]', 'sales@fg.local');
await page.type('input[type=password]', 'Test@1234');
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
]);
console.log('post-login url:', page.url());

// Try direct /users URL
await page.goto('http://localhost:5173/users', { waitUntil: 'networkidle2' });
console.log('after /users:', page.url());
await page.screenshot({ path: 'scratch/sk_sales_users.png', fullPage: false });

await browser.close();

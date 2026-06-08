import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

// Login first
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await page.type('input[type=email]', 'admin@fg.local');
await page.type('input[type=password]', 'Admin@1234');
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
]);

// Navigate to catalog
await page.goto('http://localhost:5173/catalog', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

console.log('URL:', page.url());
console.log('Title:', await page.title());

await page.screenshot({ path: 'scratch/sk_catalog.png', fullPage: false });

// Try clicking + Add Item button
const addBtn = await page.evaluateHandle(() => {
  const btns = [...document.querySelectorAll('button')];
  return btns.find(b => /Add Item/i.test(b.textContent || ''));
});
if (addBtn) {
  await addBtn.asElement().click();
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'scratch/sk_catalog_modal.png', fullPage: false });
  console.log('Modal screenshot saved');
}

await browser.close();

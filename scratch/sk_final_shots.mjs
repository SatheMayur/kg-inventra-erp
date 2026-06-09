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

// 1. Bulk Normalize — paste mode
await page.goto('http://localhost:5173/normalize', { waitUntil: 'networkidle2' });
await page.waitForSelector('textarea', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
await page.click('textarea');
await page.keyboard.type('2kg aloo premium\nkashmiri lal mirch 500g\nsabut urad 1kg\n1 dozen anda\nindia gate basmati 1121 5kg\namul butter 500g\nroasted salted cashew w320 250g\njaitun', { delay: 5 });
// Click the form submit button (not the nav link with same label). Find it inside the card.
await page.evaluate(() => {
  // Form button is the one preceded by a textarea in the same card.
  const tas = document.querySelectorAll('textarea');
  if (tas.length) {
    const card = tas[0].closest('div');
    // Hunt for Normalize button within the same section (sibling of textarea)
    const root = card?.parentElement || document.body;
    const cands = [...root.querySelectorAll('button')].filter(b => /^(Normalize|Working\.\.\.)$/.test(b.textContent.trim()));
    if (cands.length) cands[cands.length - 1].click();
  }
});
console.log('clicked normalize, waiting for results...');
await page.waitForFunction(() => /Results \(/.test(document.body.innerText), { timeout: 45000 });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'scratch/sk_bulk_normalize.png', fullPage: true });
console.log('saved sk_bulk_normalize.png');

// 2. Profile
await page.goto('http://localhost:5173/profile', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'scratch/sk_profile.png', fullPage: false });
console.log('saved sk_profile.png');

await browser.close();

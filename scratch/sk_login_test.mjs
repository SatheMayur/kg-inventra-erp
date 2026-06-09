import puppeteer from 'puppeteer';
const cases = [
  ['admin@fg.local',     'Admin@1234'],
  ['purchase@fg.local',  'Test@1234'],
  ['warehouse@fg.local', 'Test@1234'],
  ['sales@fg.local',     'Test@1234'],
  ['view@fg.local',      'Test@1234'],
];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const [email, pw] of cases) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.url().includes('/auth/login')) errors.push('login resp ' + r.status()); });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.type('input[type=email]', email);
  await page.type('input[type=password]', pw);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null),
  ]);
  const url = page.url();
  const errBox = await page.$eval('div', el => null).catch(() => null);
  const errText = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')];
    const e = els.find(d => d.style.color === 'rgb(207, 19, 34)' || /fail|invalid|error/i.test(d.innerText || ''));
    return e ? e.innerText.slice(0, 200) : null;
  });
  const userLS = await page.evaluate(() => localStorage.getItem('fg_user'));
  console.log(`${email.padEnd(22)} -> url=${url}  user=${userLS ? 'set' : 'null'}  err=${errText || '-'}  evt=${errors.join('|')}`);
  await page.close();
}
await browser.close();

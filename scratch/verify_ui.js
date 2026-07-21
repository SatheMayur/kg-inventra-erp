import puppeteer from 'puppeteer'
import fs from 'fs'

const possiblePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const executablePath = possiblePaths.find((p) => fs.existsSync(p))

async function run() {
  const browser = await puppeteer.launch({ executablePath, headless: true })

  const viewports = [
    { width: 1920, height: 1080, filename: 'verify_1920x1080.png' },
    { width: 1600, height: 900, filename: 'verify_1600x900.png' },
    { width: 1440, height: 900, filename: 'verify_1440x900.png' },
    { width: 1366, height: 768, filename: 'verify_1366x768.png' },
    { width: 1280, height: 720, filename: 'verify_1280x720.png' },
  ]

  for (const vp of viewports) {
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height })
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' })

    const empInput = await page.$('input[name="empId"], input[placeholder*="Employee"], input[type="text"]')
    if (empInput) {
      await empInput.type('software')
      const passInput = await page.$('input[type="password"]')
      if (passInput) await passInput.type('pass123')
      const submitBtn = await page.$('button[type="submit"]')
      if (submitBtn) {
        await submitBtn.click()
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    const navElements = await page.$$('button, a, span, div')
    for (const el of navElements) {
      const text = await page.evaluate((e) => e.textContent, el)
      if (text && text.trim() === 'WhatsApp Inbox') {
        await el.click()
        await new Promise((r) => setTimeout(r, 2000))
        break
      }
    }

    await page.screenshot({ path: `scratch/${vp.filename}` })
    await page.close()
    console.log(`Saved ${vp.filename}`)
  }

  await browser.close()
  console.log('All 5 resolution screenshots captured successfully.')
}

run().catch(console.error)

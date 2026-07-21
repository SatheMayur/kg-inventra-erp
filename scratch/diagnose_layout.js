import puppeteer from 'puppeteer'
import fs from 'fs'

const possiblePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
]

const executablePath = possiblePaths.find((p) => fs.existsSync(p))

async function diagnose() {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1600, height: 900 },
  })

  const page = await browser.newPage()

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

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
    const waBtn = buttons.find((b) => b.textContent && b.textContent.toLowerCase().includes('whatsapp'))
    if (waBtn) waBtn.click()
  })

  await new Promise((r) => setTimeout(r, 2000))

  const leftChildrenReport = await page.evaluate(() => {
    const mainContainer = Array.from(document.querySelectorAll('div')).find((d) => d.style && d.style.gridTemplateColumns && d.style.gridTemplateColumns.includes('300px')) ||
                          Array.from(document.querySelectorAll('div')).find((d) => d.textContent && d.textContent.includes('WhatsApp Console') && d.children && d.children.length === 3)
    
    if (!mainContainer) return { error: 'MainContainer not found' }
    const leftPanel = mainContainer.children[0]
    const centerPanel = mainContainer.children[1]
    const rightPanel = mainContainer.children[2]

    function inspectTree(node, depth = 0) {
      if (!node || depth > 5) return []
      const cs = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const item = {
        depth,
        tagName: node.tagName,
        className: node.className,
        text: (node.textContent || '').slice(0, 30),
        display: cs.display,
        width: cs.width,
        minWidth: cs.minWidth,
        maxWidth: cs.maxWidth,
        flex: cs.flex,
        computedWidth: Math.round(rect.width * 10) / 10,
        scrollWidth: node.scrollWidth,
      }
      const children = Array.from(node.children).flatMap((c) => inspectTree(c, depth + 1))
      return [item, ...children]
    }

    return {
      leftPanelMetrics: {
        className: leftPanel.className,
        computedWidth: leftPanel.getBoundingClientRect().width,
        styleWidth: window.getComputedStyle(leftPanel).width,
        flex: window.getComputedStyle(leftPanel).flex,
      },
      centerPanelMetrics: {
        className: centerPanel.className,
        computedWidth: centerPanel.getBoundingClientRect().width,
        styleWidth: window.getComputedStyle(centerPanel).width,
        flex: window.getComputedStyle(centerPanel).flex,
        minWidth: window.getComputedStyle(centerPanel).minWidth,
      },
      rightPanelMetrics: {
        className: rightPanel.className,
        computedWidth: rightPanel.getBoundingClientRect().width,
        styleWidth: window.getComputedStyle(rightPanel).width,
        flex: window.getComputedStyle(rightPanel).flex,
      },
      leftPanelChildren: inspectTree(leftPanel),
    }
  })

  console.log('\n=== LEFT PANEL TREE DIAGNOSTICS ===')
  console.log(JSON.stringify(leftChildrenReport, null, 2))

  await browser.close()
}

diagnose().catch((err) => {
  console.error('Diagnosis error:', err)
  process.exit(1)
})

import puppeteer from 'puppeteer'
import fs from 'fs'

const possiblePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const executablePath = possiblePaths.find((p) => fs.existsSync(p))

async function run() {
  const browser = await puppeteer.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
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

  const detailedMetrics = await page.evaluate(() => {
    function getStyle(el) {
      if (!el) return { error: 'Not Found' }
      const cs = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        actualWidth: `${Math.round(rect.width)}px`,
        actualHeight: `${Math.round(rect.height)}px`,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        flex: cs.flex,
        minWidth: cs.minWidth,
        maxWidth: cs.maxWidth,
        overflow: cs.overflow,
        padding: cs.padding,
        position: cs.position,
      }
    }

    const allDivs = Array.from(document.querySelectorAll('div'))

    // 1. InboxShell: Outer container of the Inbox page
    const shell = allDivs.find(d => d.style && d.style.gridTemplateColumns)
    
    // Direct children of shell
    const shellChildren = shell ? Array.from(shell.children) : []
    const convPanel = shellChildren[0] || null
    const chatPanel = shellChildren[1] || null
    const contextPanel = shellChildren[2] || null

    // 5. Message viewport inside ChatPanel
    const msgViewport = chatPanel ? chatPanel.querySelector('div[class*="overflow-y-auto"]') : null

    // 6. Outgoing bubble
    const bubble = chatPanel ? chatPanel.querySelector('div[class*="self-end"]') : null

    // 7. Context metadata row
    const contextMetaRow = contextPanel ? contextPanel.querySelector('div[class*="border border-emerald"], div[class*="border border-primary"]') : null

    // 8. Context tab header
    const contextTabHeader = contextPanel ? contextPanel.querySelector('div[class*="h-[30px]"]') : null

    // 9. Top status bar
    const statusBar = document.querySelector('div[class*="h-[32px]"]') || document.querySelector('div[class*="border-b"]')

    return {
      InboxShell: getStyle(shell),
      ConversationPanel: getStyle(convPanel),
      ChatPanel: getStyle(chatPanel),
      ContextPanel: getStyle(contextPanel),
      MessageViewport: getStyle(msgViewport),
      OutgoingBubble: getStyle(bubble),
      ContextMetadataRow: getStyle(contextMetaRow),
      ContextTabHeader: getStyle(contextTabHeader),
      TopStatusBar: getStyle(statusBar),
    }
  })

  console.log('DETAILED_COMPUTED_STYLES:\n' + JSON.stringify(detailedMetrics, null, 2))
  await browser.close()
}

run().catch(console.error)

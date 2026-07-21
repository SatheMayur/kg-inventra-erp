const fs = require('fs');
// Use the main entry point of pdfjs-dist
const pdfjsLib = require('pdfjs-dist');

async function extractText() {
  const data = new Uint8Array(fs.readFileSync('D:/Store_KG/Store_KG/store inventory-.pdf'));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  console.log(`PDF loaded. Total pages: ${pdf.numPages}`);
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str).join(' ');
    console.log(`\n================ PAGE ${i} ================`);
    console.log(textItems);
  }
}

extractText().catch(console.error);

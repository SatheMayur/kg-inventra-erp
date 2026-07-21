import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractText() {
  const data = new Uint8Array(fs.readFileSync('D:/Store_KG/Store_KG/store inventory-.pdf'));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  console.log(`PDF loaded. Total pages: ${pdf.numPages}`);
  
  let allText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str).join(' ');
    allText += `\n================ PAGE ${i} ================\n`;
    allText += textItems + '\n';
  }
  
  fs.writeFileSync('D:/Store_KG/Store_KG/source/scratch/extracted_pdf_text.txt', allText);
  console.log('✅ Successfully wrote all extracted PDF text to scratch/extracted_pdf_text.txt');
}

extractText().catch(console.error);

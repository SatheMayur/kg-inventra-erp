const fs = require('fs');
try {
  const buf = fs.readFileSync('D:/Store_KG/Store_KG/store inventory-.pdf');
  const content = buf.toString('binary');
  
  // Method 1: Count /Type /Page references
  const pageMatches = content.match(/\/Type\s*\/Page\b/g);
  console.log('Page Count via /Type /Page:', pageMatches ? pageMatches.length : 'none');

  // Method 2: Look for /Count entries in the page tree
  const countMatches = content.match(/\/Count\s+(\d+)/g);
  console.log('Matches for /Count:', countMatches);
} catch (err) {
  console.error('Error reading PDF:', err);
}

/**
 * EAN-13 generation using India GS1 country code prefix "890"
 * Format: prefix(3) + item_id padded to 9 digits + checksum(1) = 13 digits total
 */
function generateEAN13(itemId) {
  const prefix = '890';
  const itemPart = String(itemId).padStart(9, '0');
  const digits12 = prefix + itemPart;

  // EAN-13 checksum: alternating weights 1 and 3
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;

  return digits12 + check;
}

module.exports = { generateEAN13 };

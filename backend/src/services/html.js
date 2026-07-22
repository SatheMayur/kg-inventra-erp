// Escape a value for safe interpolation into server-rendered HTML.
//
// The challan (outward.js) and label sheet (items.js) endpoints build HTML by
// string interpolation from item/customer fields that originate in user input
// (Excel import, master data). Without escaping, a name like
// `<img src=x onerror=...>` executes when the page is opened — stored XSS,
// same-origin with the SPA. Escape every interpolated user value.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };

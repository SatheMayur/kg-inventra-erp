const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { processAndValidateInvoice } = require('../services/invoice-validation');
const db = require('../config/db');
const { logAudit } = require('../services/audit');
const crypto = require('crypto');

const router = express.Router();

function toOcrLines(payload) {
  if (Array.isArray(payload.rawOcrLines)) {
    return payload.rawOcrLines.map((line) => String(line ?? '').trim()).filter(Boolean);
  }

  if (typeof payload.rawOcrText === 'string') {
    return payload.rawOcrText
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return null;
}

// POST /api/invoice-validation/process
// Validate OCR invoice content before any persistence.
router.post('/process', authenticate, authorize('admin', 'purchase', 'warehouse'), async (req, res, next) => {
  try {
    const lines = toOcrLines(req.body || {});
    if (!lines || lines.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Provide rawOcrLines (array) or rawOcrText (newline-delimited string).',
      });
    }

    const result = processAndValidateInvoice(lines, req.body?.claimedGrandTotal);

    // If invoice is acceptable for stock (READY_FOR_STOCK or WARNING_RETAINED), store in invoice_bank
    if (['READY_FOR_STOCK', 'WARNING_RETAINED'].includes(result.globalInvoiceStatus)) {
      // Ensure table exists (lightweight, safe to run each time)
      const exists = await db.schema.hasTable('invoice_bank');
      if (!exists) {
        await db.schema.createTable('invoice_bank', (t) => {
          t.increments('id');
          t.integer('user_id').nullable();
          t.string('status', 40);
          t.string('ocr_hash', 128).unique().nullable();
          t.text('raw_text');
          t.decimal('calculated_subtotal', 14, 2).nullable();
          t.json('payload');
          t.timestamp('created_at').defaultTo(db.fn.now());
        });
      }

        // Deduplicate by OCR text hash to avoid duplicate inserts for same scan
        const rawText = lines.join('\n');
        const ocrHash = crypto.createHash('sha256').update(rawText).digest('hex');

        // Also accept optional invoice metadata for fuzzy dedupe
        const invoiceNo = (req.body?.invoiceNo || req.body?.invoice_no || '').trim() || null;
        const invoiceDate = req.body?.invoiceDate || req.body?.invoice_date || null;
        const vendorId = req.body?.vendorId || req.body?.vendor_id || null;

        // Try exact matches: OCR hash first
        let existing = await db('invoice_bank').where({ ocr_hash: ocrHash }).first();
        if (!existing && invoiceNo) {
          // Try exact invoice number + date + vendor if provided
          const q = db('invoice_bank').where('invoice_no', invoiceNo);
          if (invoiceDate) q.andWhere('invoice_date', invoiceDate);
          if (vendorId) q.andWhere('vendor_id', vendorId);
          existing = await q.first();
        }

        if (!existing && invoiceNo && invoiceDate) {
          // Fuzzy: allow small date differences (±1 day) when vendor matches (if provided)
          const from = new Date(invoiceDate);
          const to = new Date(invoiceDate);
          from.setDate(from.getDate() - 1);
          to.setDate(to.getDate() + 1);
          const q2 = db('invoice_bank').where('invoice_no', invoiceNo).andWhereBetween('invoice_date', [from.toISOString().slice(0,10), to.toISOString().slice(0,10)]);
          if (vendorId) q2.andWhere('vendor_id', vendorId);
          existing = await q2.first();
        }

        if (existing) {
          result.invoiceBankId = existing.id;
        } else {
        const payload = {
          ocrLines: lines,
          result,
          claimedGrandTotal: req.body?.claimedGrandTotal ?? null,
        };

        const insertObj = { user_id: req.user?.id || null, status: result.globalInvoiceStatus, ocr_hash: ocrHash, raw_text: rawText, calculated_subtotal: result.calculatedSubtotal || 0, payload: JSON.stringify(payload) };
        if (invoiceNo) insertObj.invoice_no = invoiceNo;
        if (invoiceDate) insertObj.invoice_date = invoiceDate;
        if (vendorId) insertObj.vendor_id = vendorId;

        const [inserted] = await db('invoice_bank')
          .insert(insertObj)
          .returning('*');

        try {
          await logAudit({ table_name: 'invoice_bank', record_id: inserted.id, action: 'INSERT', user_id: req.user?.id || null, new_value: inserted });
        } catch (auditErr) {
          // Audit failure should not block main response
          console.error('Audit log failed for invoice_bank insert:', auditErr);
        }

        // Return invoice bank id for client convenience
        result.invoiceBankId = inserted.id;
      }
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

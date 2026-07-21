const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:d:/Store_KG/Store_KG/source/prisma/dev.db' } }
});

const wb = xlsx.readFile('D:/Store_KG/Store_KG/Grocery_Price_Tracker_v3.xlsx');

async function main() {
  const logSheet = wb.Sheets['Purchase Log'];
  const rawData = xlsx.utils.sheet_to_json(logSheet, { header: 1 });

  let headerIdx = -1;
  for (let i = 0; i < 15; i++) {
    if (rawData[i] && rawData[i].some(cell => typeof cell === 'string' && cell.includes('Item Name'))) {
      headerIdx = i;
      break;
    }
  }

  const logRows = rawData.slice(headerIdx + 1);
  console.log(`Processing ${logRows.length} rows from Purchase Log...`);

  // Clear existing price transactions to ensure clean seed
  await prisma.priceTransaction.deleteMany();
  await prisma.priceImportBatch.deleteMany();

  const importBatch = await prisma.priceImportBatch.create({
    data: {
      fileName: 'Grocery_Price_Tracker_v3.xlsx',
      totalRows: logRows.length,
      importedRows: 0,
      unmappedRows: 0,
      status: 'COMPLETED',
      uploadedBy: 'System Seed'
    }
  });

  const dbItems = await prisma.item.findMany({ include: { aliases: true } });
  const dbSuppliers = await prisma.supplier.findMany();

  let importedCount = 0;

  for (let idx = 0; idx < logRows.length; idx++) {
    const row = logRows[idx];
    if (!row || !row[0] || !row[1]) continue;

    // Date
    let dateVal = new Date();
    const rawDate = row[0];
    if (typeof rawDate === 'string') {
      const parts = rawDate.split('-');
      if (parts.length === 3) dateVal = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      else dateVal = new Date(rawDate);
    }

    const itemText = String(row[1]).trim();
    const unitText = String(row[2] || 'pcs').trim();
    const categoryText = String(row[3] || 'General').trim();
    const rateNum = Number(row[4]) || 0;
    const qtyNum = Number(row[5]) || 0;
    const supplierText = String(row[7] || '').trim();
    const invoiceNo = String(row[8] || '').trim();
    const notesText = String(row[9] || '').trim();

    if (!itemText || rateNum <= 0 || qtyNum <= 0) continue;

    // Resolve Item
    const cleanItemText = itemText.toLowerCase();
    let matchedItem = dbItems.find(i => i.name.trim().toLowerCase() === cleanItemText) ||
                      dbItems.find(i => (i.shortName || '').trim().toLowerCase() === cleanItemText) ||
                      dbItems.find(i => i.aliases.some(a => a.aliasText.trim().toLowerCase() === cleanItemText));

    if (!matchedItem) {
      // Auto-create missing daily procurement consumable item
      matchedItem = await prisma.item.create({
        data: {
          name: itemText,
          category: categoryText,
          unit: unitText,
          procurementType: 'DAILY',
          dailyProcurementEligible: true,
          itemNature: categoryText === 'Vegetable' ? 'PERISHABLE' : 'NON_PERISHABLE',
          stock: 0,
          minStock: 5,
          aliases: {
            create: [{ aliasText: itemText }]
          }
        },
        include: { aliases: true }
      });
      dbItems.push(matchedItem);
      console.log(`Created new Item Master record for "${itemText}" (${categoryText})`);
    }

    // Resolve Supplier
    let matchedSupplierId = null;
    if (supplierText) {
      const cleanSup = supplierText.toLowerCase();
      let sup = dbSuppliers.find(s => s.name.trim().toLowerCase() === cleanSup);
      if (!sup) {
        sup = await prisma.supplier.create({
          data: {
            name: supplierText,
            active: true
          }
        });
        dbSuppliers.push(sup);
        console.log(`Created Supplier Master record for "${supplierText}"`);
      }
      matchedSupplierId = sup.id;
    }

    // Calculate GST & Amounts
    const isGroceryOrSpice = categoryText.toLowerCase().includes('grocery') || categoryText.toLowerCase().includes('dry') || categoryText.toLowerCase().includes('spice');
    const gstRate = isGroceryOrSpice ? 5 : 0;
    const lineAmount = Number((rateNum * qtyNum).toFixed(2));
    const taxAmount = Number(((lineAmount * gstRate) / 100).toFixed(2));
    const grossAmount = Number((lineAmount + taxAmount).toFixed(2));
    const grossRate = Number((grossAmount / qtyNum).toFixed(2));

    await prisma.priceTransaction.create({
      data: {
        itemId: matchedItem.id,
        categoryId: categoryText,
        unitId: unitText,
        supplierId: matchedSupplierId,
        transactionDate: dateVal,
        rate: rateNum,
        quantity: qtyNum,
        lineAmount,
        gstRate,
        taxAmount,
        grossAmount,
        grossRate,
        invoiceNumber: invoiceNo || null,
        notes: notesText || null,
        sourceType: 'EXCEL_IMPORT',
        originalItemText: itemText,
        originalSupplierText: supplierText || null,
        importBatchId: importBatch.id,
        createdBy: 'Excel Historical Seed'
      }
    });

    importedCount++;
  }

  await prisma.priceImportBatch.update({
    where: { id: importBatch.id },
    data: { importedRows: importedCount }
  });

  console.log(`\n✅ SEED COMPLETE! Successfully imported ${importedCount} historical transactions into PriceTransaction database table.`);

  await prisma.$disconnect();
}

main().catch(console.error);

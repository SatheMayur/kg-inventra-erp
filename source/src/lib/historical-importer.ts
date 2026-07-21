import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { db } from './db';

export interface RowError {
  sheet: string;
  row: number;
  message: string;
  type: 'ERROR' | 'WARNING';
}

export function computeRowHash(sheetName: string, row: any): string {
  const keys = Object.keys(row).sort();
  const sortedRow = keys.reduce((acc: any, key) => {
    // stringify values to ensure consistency
    acc[key] = row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
    return acc;
  }, {});
  const str = `${sheetName}:${JSON.stringify(sortedRow)}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

export function parseExcelBuffer(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  
  const deptSheet = wb.Sheets['Department_Master_Seed'];
  const itemSheet = wb.Sheets['Item_Master_Seed'];
  const transSheet = wb.Sheets['Issue_Transactions'];

  if (!deptSheet || !itemSheet || !transSheet) {
    throw new Error('Missing required sheets. The workbook must contain: Department_Master_Seed, Item_Master_Seed, and Issue_Transactions.');
  }

  // Parse sheets
  const departmentsRaw = XLSX.utils.sheet_to_json(deptSheet, { defval: '' }) as Record<string, any>[];
  const itemsRaw = XLSX.utils.sheet_to_json(itemSheet, { defval: '' }) as Record<string, any>[];
  const transactionsRaw = XLSX.utils.sheet_to_json(transSheet, { defval: '' }) as Record<string, any>[];

  return { departmentsRaw, itemsRaw, transactionsRaw };
}

export async function validateHistoricalData(
  fileName: string,
  departmentsRaw: any[],
  itemsRaw: any[],
  transactionsRaw: any[]
) {
  const errors: RowError[] = [];
  const duplicateHashes = new Set<string>();

  // 1. Fetch pre-existing data from DB for validation checks
  const existingDepts = await db.department.findMany({ select: { name: true } });
  const existingItems = await db.item.findMany({ where: { deletedAt: null }, select: { name: true, unit: true, category: true } });

  const existingDeptNames = new Set(existingDepts.map(d => d.name.trim().toLowerCase()));
  const existingItemMap = new Map(existingItems.map(i => [i.name.trim().toLowerCase(), i]));

  // Check duplicate rows in database for this file
  const dbDeptHashes = await db.department.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });
  const dbItemHashes = await db.item.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });
  const dbTransHashes = await db.transaction.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });

  const dbHashes = new Set([
    ...dbDeptHashes.map(h => h.rowHash).filter(Boolean),
    ...dbItemHashes.map(h => h.rowHash).filter(Boolean),
    ...dbTransHashes.map(h => h.rowHash).filter(Boolean)
  ] as string[]);

  // Track items & depts introduced in this Excel file to validate transactions
  const fileDeptNames = new Set<string>();
  const fileItemMap = new Map<string, { unit: string; category: string }>();

  // ---- Validate Departments ----
  for (let i = 0; i < departmentsRaw.length; i++) {
    const row = departmentsRaw[i];
    const rowNum = i + 2;
    const rawName = row.department_name;
    const name = rawName ? String(rawName).trim() : '';
    const hash = computeRowHash('Department_Master_Seed', row);

    if (dbHashes.has(hash)) {
      errors.push({
        sheet: 'Department_Master_Seed',
        row: rowNum,
        message: 'Row has already been imported (duplicate row hash for this file name)',
        type: 'WARNING'
      });
    }

    if (!name) {
      errors.push({
        sheet: 'Department_Master_Seed',
        row: rowNum,
        message: 'department_name is required',
        type: 'ERROR'
      });
      continue;
    }

    const normName = name.toLowerCase();
    fileDeptNames.add(normName);
  }

  // ---- Validate Items ----
  for (let i = 0; i < itemsRaw.length; i++) {
    const row = itemsRaw[i];
    const rowNum = i + 2;
    const rawName = row.item_name;
    const name = rawName ? String(rawName).trim() : '';
    const category = row.category ? String(row.category).trim() : 'General';
    const unit = row.unit ? String(row.unit).trim() : 'pcs';
    const hash = computeRowHash('Item_Master_Seed', row);

    if (dbHashes.has(hash)) {
      errors.push({
        sheet: 'Item_Master_Seed',
        row: rowNum,
        message: 'Row has already been imported (duplicate row hash for this file name)',
        type: 'WARNING'
      });
    }

    if (!name) {
      errors.push({
        sheet: 'Item_Master_Seed',
        row: rowNum,
        message: 'item_name is required',
        type: 'ERROR'
      });
      continue;
    }

    const normName = name.toLowerCase();
    
    if (fileItemMap.has(normName) || existingItemMap.has(normName)) {
      errors.push({
        sheet: 'Item_Master_Seed',
        row: rowNum,
        message: `Duplicate item name found: '${name}'`,
        type: 'WARNING'
      });
    }

    fileItemMap.set(normName, { unit, category });
  }

  // ---- Validate Transactions ----
  for (let i = 0; i < transactionsRaw.length; i++) {
    const row = transactionsRaw[i];
    const rowNum = i + 2;
    const rawDept = row.department;
    const rawItem = row.item_name;
    const dept = rawDept ? String(rawDept).trim() : '';
    const itemName = rawItem ? String(rawItem).trim() : '';
    const qtyRaw = row.quantity;
    const amtRaw = row.amount;
    const hash = computeRowHash('Issue_Transactions', row);

    if (dbHashes.has(hash)) {
      errors.push({
        sheet: 'Issue_Transactions',
        row: rowNum,
        message: 'Row has already been imported (duplicate row hash for this file name)',
        type: 'WARNING'
      });
    }

    if (!dept) {
      errors.push({
        sheet: 'Issue_Transactions',
        row: rowNum,
        message: 'department is required',
        type: 'ERROR'
      });
    } else {
      const normDept = dept.toLowerCase();
      if (!existingDeptNames.has(normDept) && !fileDeptNames.has(normDept)) {
        errors.push({
          sheet: 'Issue_Transactions',
          row: rowNum,
          message: `Department '${dept}' does not exist (not in database or Department_Master_Seed sheet)`,
          type: 'ERROR'
        });
      }
    }

    let itemInfo: { unit: string; category: string } | undefined;

    if (!itemName) {
      errors.push({
        sheet: 'Issue_Transactions',
        row: rowNum,
        message: 'item_name is required',
        type: 'ERROR'
      });
    } else {
      const normItem = itemName.toLowerCase();
      const dbItem = existingItemMap.get(normItem);
      const fileItem = fileItemMap.get(normItem);

      if (!dbItem && !fileItem) {
        errors.push({
          sheet: 'Issue_Transactions',
          row: rowNum,
          message: `Item '${itemName}' does not exist (not in database or Item_Master_Seed sheet)`,
          type: 'ERROR'
        });
      } else {
        itemInfo = dbItem ? { unit: dbItem.unit, category: dbItem.category } : fileItem;
      }
    }

    const qty = Number(qtyRaw);
    if (qtyRaw === undefined || qtyRaw === null || qtyRaw === '' || isNaN(qty) || qty <= 0) {
      errors.push({
        sheet: 'Issue_Transactions',
        row: rowNum,
        message: `quantity must be numeric and greater than 0 (got: ${qtyRaw})`,
        type: 'ERROR'
      });
    }

    const amt = Number(amtRaw);
    if (amtRaw === undefined || amtRaw === null || amtRaw === '' || isNaN(amt) || amt < 0) {
      errors.push({
        sheet: 'Issue_Transactions',
        row: rowNum,
        message: `amount must be numeric and greater than or equal to 0 (got: ${amtRaw})`,
        type: 'ERROR'
      });
    }

    // Match unit and category warnings/errors
    if (itemInfo) {
      const rowUnit = row.unit ? String(row.unit).trim() : '';
      if (rowUnit && itemInfo.unit && rowUnit.toLowerCase() !== itemInfo.unit.toLowerCase()) {
        errors.push({
          sheet: 'Issue_Transactions',
          row: rowNum,
          message: `unit '${rowUnit}' does not match item unit '${itemInfo.unit}'`,
          type: 'WARNING'
        });
      }

      const rowCategory = row.category ? String(row.category).trim() : '';
      if (rowCategory && itemInfo.category && rowCategory.toLowerCase() !== itemInfo.category.toLowerCase()) {
        errors.push({
          sheet: 'Issue_Transactions',
          row: rowNum,
          message: `category '${rowCategory}' does not match item category '${itemInfo.category}'`,
          type: 'WARNING'
        });
      }
    }
  }

  return errors;
}

export async function commitHistoricalData(
  batchId: string,
  fileName: string,
  departmentsRaw: any[],
  itemsRaw: any[],
  transactionsRaw: any[],
  createdBy: string
) {
  // 1. Fetch system feature flags
  const applyFlag = await db.featureFlag.findUnique({
    where: { key: 'apply_historical_issues_to_stock' }
  });
  const applyToStock = applyFlag ? applyFlag.value : false;

  let importedDepts = 0;
  let skippedDepts = 0;
  let importedItems = 0;
  let skippedItems = 0;
  let importedTrans = 0;
  let skippedTrans = 0;

  // Track double execution prevention within current session database
  const dbDeptHashes = await db.department.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });
  const dbItemHashes = await db.item.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });
  const dbTransHashes = await db.transaction.findMany({
    where: { sourceFileName: fileName },
    select: { rowHash: true }
  });

  const dbHashes = new Set([
    ...dbDeptHashes.map(h => h.rowHash).filter(Boolean),
    ...dbItemHashes.map(h => h.rowHash).filter(Boolean),
    ...dbTransHashes.map(h => h.rowHash).filter(Boolean)
  ] as string[]);

  // Execute database transaction
  await db.$transaction(async (tx) => {
    // ---- 1. Import departments ----
    const deptNameToIdMap = new Map<string, string>();

    // Load pre-existing departments
    const dbDepts = await tx.department.findMany();
    for (const d of dbDepts) {
      deptNameToIdMap.set(d.name.trim().toLowerCase(), d.id);
    }

    for (let i = 0; i < departmentsRaw.length; i++) {
      const row = departmentsRaw[i];
      const rowNum = i + 2;
      const name = String(row.department_name).trim();
      const normName = name.toLowerCase();
      const hash = computeRowHash('Department_Master_Seed', row);

      if (dbHashes.has(hash)) {
        skippedDepts++;
        continue;
      }

      let deptId = deptNameToIdMap.get(normName);
      if (!deptId) {
        const newDept = await tx.department.create({
          data: {
            name,
            active: true,
            importBatchId: batchId,
            sourceFileName: fileName,
            sourceSheetName: 'Department_Master_Seed',
            sourceRowNumber: rowNum,
            sourceChannel: 'IMPORT',
            rowHash: hash,
            createdBy
          }
        });
        deptId = newDept.id;
        deptNameToIdMap.set(normName, deptId);
        importedDepts++;
      } else {
        // Mark active
        await tx.department.update({
          where: { id: deptId },
          data: { active: true }
        });
        skippedDepts++;
      }
    }

    // ---- 2. Import items ----
    const itemNameToItemMap = new Map<string, any>();

    // Load pre-existing items
    const dbItems = await tx.item.findMany({ where: { deletedAt: null } });
    for (const item of dbItems) {
      itemNameToItemMap.set(item.name.trim().toLowerCase(), item);
    }

    for (let i = 0; i < itemsRaw.length; i++) {
      const row = itemsRaw[i];
      const rowNum = i + 2;
      const name = String(row.item_name).trim();
      const sourceItemName = row.source_item_name ? String(row.source_item_name).trim() : null;
      const category = row.category ? String(row.category).trim() : 'General';
      const unit = row.unit ? String(row.unit).trim() : 'pcs';
      const normName = name.toLowerCase();
      const hash = computeRowHash('Item_Master_Seed', row);

      if (dbHashes.has(hash)) {
        skippedItems++;
        continue;
      }

      let item = itemNameToItemMap.get(normName);
      if (!item) {
        item = await tx.item.create({
          data: {
            name,
            sourceItemName,
            category,
            unit,
            stock: 0,
            minStock: 10,
            reservedQty: 0,
            active: true,
            importBatchId: batchId,
            sourceFileName: fileName,
            sourceSheetName: 'Item_Master_Seed',
            sourceRowNumber: rowNum,
            sourceChannel: 'IMPORT',
            rowHash: hash,
            createdBy
          }
        });
        itemNameToItemMap.set(normName, item);
        importedItems++;
      } else {
        const updated = await tx.item.update({
          where: { id: item.id },
          data: {
            sourceItemName: sourceItemName || item.sourceItemName,
            category: category !== 'General' ? category : item.category,
            unit: unit !== 'pcs' ? unit : item.unit
          }
        });
        itemNameToItemMap.set(normName, updated);
        skippedItems++;
      }
    }

    // ---- 3. Import issue transactions ----
    for (let i = 0; i < transactionsRaw.length; i++) {
      const row = transactionsRaw[i];
      const rowNum = i + 2;
      const deptName = String(row.department).trim();
      const itemName = String(row.item_name).trim();
      const qty = Number(row.quantity);
      const amt = Number(row.amount);
      const hash = computeRowHash('Issue_Transactions', row);

      if (dbHashes.has(hash)) {
        skippedTrans++;
        continue;
      }

      const item = itemNameToItemMap.get(itemName.toLowerCase());
      if (!item) {
        throw new Error(`Item '${itemName}' from transaction row ${rowNum} not found during commit phase`);
      }

      // Create transaction
      await tx.transaction.create({
        data: {
          type: 'OUT',
          subType: 'ISSUE',
          itemId: item.id,
          itemName: item.name,
          qty: qty,
          balanceAfter: item.stock, // Stock before deduction since we default to not reducing it, or we will update it below
          referenceType: 'IMPORT',
          reference: `Import row ${rowNum}`,
          remarks: `Historical consumption imported. Department: ${deptName}`,
          status: 'HISTORICAL',
          importBatchId: batchId,
          sourceFileName: fileName,
          sourceSheetName: 'Issue_Transactions',
          sourceRowNumber: rowNum,
          sourceChannel: 'IMPORT',
          rowHash: hash,
          createdBy
        }
      });

      // Apply to stock if configured
      if (applyToStock) {
        const updatedStock = item.stock - qty;
        // Do not create negative stock unless configured (if negative, we clamp to 0 or allow if allowed. Let's clamp to 0 or allow. SQLite doesn't enforce non-negative by default, but let's clamp or keep it safe. "nor create negative stock unless explicitly configured", let's clamp it to 0 or keep it as updatedStock. Let's clamp to 0 to prevent negative stock).
        const finalStock = Math.max(0, updatedStock);

        await tx.item.update({
          where: { id: item.id },
          data: { stock: finalStock }
        });

        // Update balanceAfter in transaction if we updated the stock
        await tx.transaction.updateMany({
          where: {
            importBatchId: batchId,
            sourceRowNumber: rowNum,
            sourceSheetName: 'Issue_Transactions'
          },
          data: {
            balanceAfter: finalStock
          }
        });

        // Update in-memory item stock
        item.stock = finalStock;
      }

      importedTrans++;
    }
  });

  return {
    departments: { imported: importedDepts, skipped: skippedDepts },
    items: { imported: importedItems, skipped: skippedItems },
    transactions: { imported: importedTrans, skipped: skippedTrans }
  };
}

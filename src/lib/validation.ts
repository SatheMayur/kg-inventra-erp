import { z } from 'zod';

export const itemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  unit: z.string().min(1, 'Unit is required').max(50),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  minStock: z.number().int().min(0, 'Min stock cannot be negative'),
  itemCode: z.string().max(50).optional(),
  maxStock: z.number().int().min(0).optional(),
  safetyStock: z.number().int().min(0).optional(),
  reorderQty: z.number().int().min(0).optional(),
  shortName: z.string().max(100).optional(),
  subCategory: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  hsnCode: z.string().max(30).optional(),
  gstRate: z.number().min(0).max(100).optional(),
  warehouse: z.string().max(100).optional(),
  rack: z.string().max(50).optional(),
  shelf: z.string().max(50).optional(),
  bin: z.string().max(50).optional(),
  active: z.boolean().optional(),
});

export const userCreateSchema = z.object({
  empId: z.string().min(1, 'Employee ID is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  department: z.string().min(1, 'Department is required').max(100),
  floor: z.string().max(50).optional(),
  role: z.enum([
    'admin',
    'employee',
    'STORE_ADMIN',
    'STORE_OPERATOR',
    'DEPT_USER',
    'DEPT_HEAD',
    'PURCHASE_USER',
    'ACCOUNTS_USER',
    'MANAGEMENT',
  ]).default('employee'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const requestLineInputSchema = z.object({
  itemId: z.string().min(1).optional(),
  customItemName: z.string().trim().min(1).max(120).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  qty: z.number().int().min(1, 'Quantity must be at least 1'),
}).refine(
  (l) => (l.itemId ? 1 : 0) + (l.customItemName ? 1 : 0) === 1,
  { message: 'Each line must have either itemId or customItemName, not both' },
);

// A requisition is a header with one or more lines. The route also accepts a
// legacy single { itemId, qty } body and normalises it into one line before parsing.
export const requestCreateSchema = z.object({
  userId: z.string().min(1),
  requiredDate: z.string().datetime().optional(),
  machine: z.string().max(100).optional(),
  concernPerson: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  priority: z.string().max(50).optional().default('MEDIUM'),
  purpose: z.string().max(500).optional(),
  remarks: z.string().max(500).optional(),
  attachments: z.string().optional(),
  lines: z.array(requestLineInputSchema).min(1, 'At least one item is required'),
});

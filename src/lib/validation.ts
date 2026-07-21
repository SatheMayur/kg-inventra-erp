import { z } from 'zod';
import {
  ITEM_NATURE,
  ITEM_NATURES,
  ITEM_PRICING_MODE,
  ITEM_PRICING_MODES,
  ITEM_PROCUREMENT_TYPE,
  ITEM_PROCUREMENT_TYPES,
  validateUnitConversion,
} from '@/lib/item-master';

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional(),
  );

export const itemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  unit: z.string().min(1, 'Unit is required').max(50),
  stock: z.number().int().min(0, 'Stock cannot be negative').default(0),
  minStock: z.number().int().min(0, 'Min stock cannot be negative').default(0),
  itemCode: optionalTrimmed(50),
  maxStock: z.number().int().min(0).optional().default(0),
  safetyStock: z.number().int().min(0).optional().default(0),
  reorderQty: z.number().int().min(0).optional().default(0),
  shortName: optionalTrimmed(100),
  subCategory: optionalTrimmed(100),
  description: optionalTrimmed(1000),
  hsnCode: optionalTrimmed(30),
  gstRate: z.number().min(0).max(100).optional().default(0),
  warehouse: optionalTrimmed(100),
  rack: optionalTrimmed(50),
  shelf: optionalTrimmed(50),
  bin: optionalTrimmed(50),
  preferredSupplierId: optionalTrimmed(120),
  procurementType: z.enum(ITEM_PROCUREMENT_TYPES).optional().default(ITEM_PROCUREMENT_TYPE.STANDARD),
  pricingMode: z.enum(ITEM_PRICING_MODES).optional().default(ITEM_PRICING_MODE.LAST_APPROVED_RATE),
  itemNature: z.enum(ITEM_NATURES).optional().default(ITEM_NATURE.NON_PERISHABLE),
  baseUnit: optionalTrimmed(50),
  purchaseUnit: optionalTrimmed(50),
  consumptionUnit: optionalTrimmed(50),
  unitConversion: z.number().positive('Unit conversion must be greater than zero').optional().default(1),
  perishable: z.boolean().optional().default(false),
  shelfLife: z.number().int().min(0).optional(),
  storageCondition: optionalTrimmed(120),
  qualityGradeEnabled: z.boolean().optional().default(false),
  dailyProcurementEligible: z.boolean().optional().default(false),
  requiresMasterReview: z.boolean().optional().default(false),
  sourceChannel: optionalTrimmed(80),
  active: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  const unitError = validateUnitConversion(value);
  if (unitError) {
    ctx.addIssue({ code: 'custom', path: ['unitConversion'], message: unitError });
  }
  if (value.itemNature === ITEM_NATURE.SERVICE && value.dailyProcurementEligible) {
    ctx.addIssue({
      code: 'custom',
      path: ['dailyProcurementEligible'],
      message: 'Service items cannot be eligible for Daily Procurement',
    });
  }
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
  isDeptHead: z.boolean().optional().default(false),
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

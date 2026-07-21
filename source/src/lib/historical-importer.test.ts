import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeRowHash, validateHistoricalData } from './historical-importer';
import { db } from './db';

// Mock the Prisma DB module
vi.mock('./db', () => ({
  db: {
    department: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    item: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    },
    featureFlag: {
      findUnique: vi.fn()
    }
  }
}));

describe('Historical Importer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.department.findMany).mockResolvedValue([]);
    vi.mocked(db.item.findMany).mockResolvedValue([]);
    vi.mocked(db.transaction.findMany).mockResolvedValue([]);
    vi.mocked(db.featureFlag.findUnique).mockResolvedValue({ key: 'apply_historical_issues_to_stock', value: false } as any);
  });

  describe('computeRowHash', () => {
    it('generates consistent hash for identical row objects', () => {
      const row1 = { name: '  A4 Paper ', category: 'Stationary', unit: 'pcs' };
      const row2 = { unit: 'pcs', name: 'A4 Paper', category: '  Stationary  ' };
      const hash1 = computeRowHash('Items', row1);
      const hash2 = computeRowHash('Items', row2);
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different sheets or content', () => {
      const row1 = { name: 'A4 Paper', category: 'Stationary' };
      const row2 = { name: 'A4 Paper', category: 'Office' };
      const hash1 = computeRowHash('Items', row1);
      const hash2 = computeRowHash('Items', row2);
      const hash3 = computeRowHash('Departments', row1);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('validateHistoricalData', () => {
    it('returns validation errors for missing department name', async () => {
      // Mock empty DB tables
      vi.mocked(db.department.findMany).mockResolvedValue([]);
      vi.mocked(db.item.findMany).mockResolvedValue([]);

      const depts = [{ department_name: '' }];
      const items: any[] = [];
      const txs: any[] = [];

      const result = await validateHistoricalData('test.xlsx', depts, items, txs);
      
      expect(result).toHaveLength(1);
      expect(result[0].sheet).toBe('Department_Master_Seed');
      expect(result[0].message).toContain('department_name is required');
      expect(result[0].type).toBe('ERROR');
    });

    it('returns validation errors for transactions with non-existent item or department', async () => {
      vi.mocked(db.department.findMany).mockResolvedValue([{ name: 'Finance' } as any]);
      vi.mocked(db.item.findMany).mockResolvedValue([{ name: 'Pen', unit: 'pcs', category: 'Stationary' } as any]);

      const depts = [{ department_name: 'HR' }]; // HR introduced in sheet
      const items = [{ item_name: 'Pencil', category: 'Stationary', unit: 'pcs' }]; // Pencil introduced in sheet
      
      const txs = [
        {
          department: 'UnknownDept', // Error
          item_name: 'Pen',
          quantity: 10,
          amount: 50
        },
        {
          department: 'HR', // OK (from sheet)
          item_name: 'UnknownItem', // Error
          quantity: 5,
          amount: 25
        }
      ];

      const result = await validateHistoricalData('test.xlsx', depts, items, txs);
      const errors = result.filter(r => r.type === 'ERROR');
      
      expect(errors.length).toBe(2);
      expect(errors[0].message).toContain("Department 'UnknownDept' does not exist");
      expect(errors[1].message).toContain("Item 'UnknownItem' does not exist");
    });

    it('validates quantity and amount formatting in transactions', async () => {
      vi.mocked(db.department.findMany).mockResolvedValue([{ name: 'HR' } as any]);
      vi.mocked(db.item.findMany).mockResolvedValue([{ name: 'Pen', unit: 'pcs', category: 'Stationary' } as any]);

      const txs = [
        {
          department: 'HR',
          item_name: 'Pen',
          quantity: -5, // Error: <= 0
          amount: 10
        },
        {
          department: 'HR',
          item_name: 'Pen',
          quantity: 5,
          amount: -10 // Error: < 0
        },
        {
          department: 'HR',
          item_name: 'Pen',
          quantity: 'not-a-number', // Error
          amount: 'free' // Error
        }
      ];

      const result = await validateHistoricalData('test.xlsx', [], [], txs);
      const errors = result.filter(r => r.type === 'ERROR');
      
      expect(errors.length).toBe(4);
    });

    it('generates warnings for unit and category mismatches', async () => {
      vi.mocked(db.department.findMany).mockResolvedValue([{ name: 'HR' } as any]);
      vi.mocked(db.item.findMany).mockResolvedValue([{ name: 'Pen', unit: 'pcs', category: 'Stationary' } as any]);

      const txs = [
        {
          department: 'HR',
          item_name: 'Pen',
          category: 'Kitchen', // Mismatch warning
          unit: 'box', // Mismatch warning
          quantity: 10,
          amount: 100
        }
      ];

      const result = await validateHistoricalData('test.xlsx', [], [], txs);
      const warnings = result.filter(r => r.type === 'WARNING');
      
      expect(warnings.length).toBe(2);
      expect(warnings[0].message).toContain("unit 'box' does not match item unit 'pcs'");
      expect(warnings[1].message).toContain("category 'Kitchen' does not match item category 'Stationary'");
    });
  });
});

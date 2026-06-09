import { z } from 'zod';

export const itemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  unit: z.string().min(1, 'Unit is required').max(50),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  minStock: z.number().int().min(0, 'Min stock cannot be negative'),
});

export const userCreateSchema = z.object({
  empId: z.string().min(1, 'Employee ID is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  department: z.string().min(1, 'Department is required').max(100),
  floor: z.string().max(50).optional(),
  role: z.enum(['admin', 'employee']).default('employee'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const requestCreateSchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  qty: z.number().int().min(1, 'Quantity must be at least 1'),
});

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError, ApiError } from '@/lib/api-utils';
import { z } from 'zod';
import {
  cleanSupplierText,
  collectSupplierDuplicateMatches,
  describeSupplierDuplicateMatch,
  isValidGstin,
  normalizeEmail,
  normalizeGstin,
} from '@/lib/supplier-dedupe';

const optionalText = (max: number) =>
  z.preprocess((value) => cleanSupplierText(value), z.string().max(max).nullable().optional());

const supplierCreateSchema = z.object({
  name: z.preprocess(
    (value) => cleanSupplierText(value),
    z.string().min(1, 'Name is required').max(200),
  ),
  gstNumber: optionalText(50)
    .transform((val) => normalizeGstin(val))
    .refine((val) => !val || isValidGstin(val), {
      message: 'Invalid GSTIN format',
    }),
  contactPerson: optionalText(100),
  phone: optionalText(50),
  contact: optionalText(100),
  email: optionalText(100)
    .transform((val) => normalizeEmail(val))
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Invalid email address',
    }),
  address: optionalText(500),
  category: optionalText(100),
  paymentTerms: optionalText(200),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isProcurementUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'PURCHASE_USER';
    if (!isProcurementUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = cleanSupplierText(searchParams.get('search'));
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const suppliers = await db.supplier.findMany({
      where: {
        ...(activeOnly ? { active: true, status: { notIn: ['INACTIVE', 'BLOCKED'] } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { gstNumber: { contains: search } },
                { phone: { contains: search } },
                { contact: { contains: search } },
                { email: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
    });

    return NextResponse.json({ suppliers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const isProcurementUser = auth.user?.role === 'admin' || auth.user?.role === 'STORE_ADMIN' || auth.user?.role === 'PURCHASE_USER';
    if (!isProcurementUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await request.json();
    const validated = supplierCreateSchema.parse(body);

    const existingSuppliers = await db.supplier.findMany({
      select: {
        id: true,
        name: true,
        gstNumber: true,
        phone: true,
        contact: true,
        email: true,
      },
    });
    const duplicateMatches = collectSupplierDuplicateMatches(validated, existingSuppliers);
    if (duplicateMatches.length > 0) {
      throw new ApiError(
        409,
        `Possible duplicate supplier: ${describeSupplierDuplicateMatch(duplicateMatches[0])}`,
        'CONFLICT',
      );
    }

    const supplier = await db.supplier.create({
      data: {
        ...validated,
        active: true,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ supplier });
  } catch (error) {
    return handleApiError(error);
  }
}

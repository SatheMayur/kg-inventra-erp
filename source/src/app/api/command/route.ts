import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorize } from '@/lib/auth';
import { handleApiError } from '@/lib/api-utils';
import { parseCommand } from '@/lib/command';

// POST /api/command — natural-language, READ-ONLY query bar. Never mutates data.
export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text : '';
    const cmd = parseCommand(text);

    switch (cmd.type) {
      case 'lowStock': {
        const items = await db.item.findMany({ where: { deletedAt: null, active: true }, take: 1000 });
        const low = items
          .filter((i) => i.stock - i.reservedQty <= i.minStock)
          .map((i) => ({ id: i.id, name: i.name, stock: i.stock, minStock: i.minStock }));
        return NextResponse.json({
          intent: cmd.type,
          answer: low.length ? `${low.length} item(s) at or below reorder level.` : 'Nothing is low on stock. 👍',
          data: low.slice(0, 50),
        });
      }
      case 'pendingRequests': {
        const reqs = await db.request.findMany({
          where: { status: 'Pending' },
          include: { lines: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        return NextResponse.json({
          intent: cmd.type,
          answer: reqs.length ? `${reqs.length} request(s) pending approval.` : 'No pending requests.',
          data: reqs.map((r) => ({
            id: r.id,
            name: r.lines.map((line) => line.itemName).join(', '),
            qty: r.lines.reduce((sum, line) => sum + line.requestedQty, 0),
            employee: r.employee,
          })),
        });
      }
      case 'stock':
      case 'findItem': {
        const q = cmd.query;
        // SQLite `contains` is case-sensitive; filter in JS over the (small) catalog.
        const all = await db.item.findMany({ where: { deletedAt: null, active: true }, take: 1000 });
        const matches = all
          .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
          .slice(0, 20);
        if (matches.length === 0) {
          return NextResponse.json({ intent: cmd.type, answer: `No items match "${q}".`, data: [] });
        }
        const data = matches.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          available: i.stock - i.reservedQty,
          unit: i.unit,
        }));
        const answer =
          cmd.type === 'stock' && matches.length === 1
            ? `${matches[0].name}: ${matches[0].stock - matches[0].reservedQty} ${matches[0].unit} available.`
            : `${matches.length} item(s) matching "${q}".`;
        return NextResponse.json({ intent: cmd.type, answer, data });
      }
      default:
        return NextResponse.json({
          intent: 'unknown',
          answer: 'Try: "stock of keyboards", "low stock", "pending requests", or just an item name.',
          data: [],
        });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

import { db } from '@/lib/db';
import { resolve, type SourceType, type MasterItem, type KnownAlias, type ResolverResult } from './resolve';

export async function resolveDescription(args: {
  rawDescription: string;
  sourceType: SourceType;
  vendorId?: string | null;
}): Promise<ResolverResult> {
  const [items, aliases] = await Promise.all([
    db.item.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true, category: true, unit: true, itemCode: true },
    }),
    db.itemAlias.findMany({
      select: {
        aliasText: true,
        itemId: true,
        sourceType: true,
        vendorId: true,
        confidenceScore: true,
        timesMatched: true,
      },
    }),
  ]);

  const item_master: MasterItem[] = items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    category: i.category,
    unit: i.unit,
    item_code: i.itemCode ?? '',
  }));

  const known_aliases: KnownAlias[] = aliases.map((a) => ({
    alias_text: a.aliasText,
    item_id: a.itemId,
    source_type: a.sourceType,
    vendor_id: a.vendorId,
    confidence_score: a.confidenceScore,
    times_matched: a.timesMatched,
  }));

  const result = resolve({
    raw_description: args.rawDescription,
    source_type: args.sourceType,
    vendor_id: args.vendorId ?? null,
    item_master,
    known_aliases,
  });

  if (result.new_alias_to_learn) {
    const { alias_text, item_id } = result.new_alias_to_learn;
    const existing = await db.itemAlias.findFirst({
      where: {
        aliasText: alias_text,
        itemId: item_id,
        sourceType: args.sourceType,
        vendorId: args.vendorId ?? null,
      },
    });

    if (existing) {
      await db.itemAlias.update({
        where: { id: existing.id },
        data: {
          timesMatched: { increment: 1 },
          confidenceScore: result.confidence,
        },
      });
    } else {
      await db.itemAlias.create({
        data: {
          aliasText: alias_text,
          itemId: item_id,
          sourceType: args.sourceType,
          vendorId: args.vendorId ?? null,
          confidenceScore: result.confidence,
          timesMatched: 1,
        },
      });
    }
  }

  return result;
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mirrors the pre-migration label-guessing logic (isoPresetKind in
// Building2D.tsx, the typeKey resolver in FloorPlanEditor.tsx, and
// topDown25DType in floorplanBevAdapter.ts) so old rows that still have
// type:'rack'/'shelf' with a descriptive label get rewritten to their real
// type once, here, instead of every renderer re-guessing it forever.
const LABEL_PATTERNS: [RegExp, string][] = [
  [/work surface|table/, 'work-surface'],
  [/chair/, 'chair'],
  [/cabinet/, 'cabinet'],
  [/drawer/, 'drawer'],
  [/locker/, 'locker'],
  [/storage box/, 'storage-box'],
  [/\bbin\b|container/, 'bin'],
  [/pallet/, 'pallet'],
  [/stair/, 'stairs'],
  [/elevator|lift/, 'elevator'],
  [/restroom|bathroom|toilet/, 'bathroom'],
  [/human|person|staff|figure/, 'human'],
];

interface LooseObject {
  id: string;
  type: string;
  label?: string;
  [key: string]: unknown;
}

function realTypeFor(object: LooseObject): string | null {
  if (object.type !== 'rack' && object.type !== 'shelf') return null; // already a real type, or not a rect at all
  const name = `${object.label ?? ''} ${object.id}`.toLowerCase();
  const match = LABEL_PATTERNS.find(([re]) => re.test(name));
  return match ? match[1] : null; // null = genuinely a plain rack/shelf, leave as-is
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN — no writes will be made.' : 'LIVE RUN — rows will be updated.');

  const plans = await prisma.floorPlan.findMany({ select: { id: true, name: true, planJson: true } });
  console.log(`Scanning ${plans.length} floor plans...`);

  let plansChanged = 0;
  let objectsChanged = 0;
  const perTypeCounts: Record<string, number> = {};

  for (const plan of plans) {
    let objects: LooseObject[];
    try {
      objects = JSON.parse(plan.planJson || '[]');
    } catch {
      console.warn(`Skipping ${plan.id} (${plan.name}) — invalid planJson.`);
      continue;
    }
    if (!Array.isArray(objects)) continue;

    let changedInThisPlan = 0;
    const rewritten = objects.map(object => {
      const newType = realTypeFor(object);
      if (!newType) return object;
      changedInThisPlan++;
      objectsChanged++;
      perTypeCounts[newType] = (perTypeCounts[newType] ?? 0) + 1;
      return { ...object, type: newType };
    });

    if (changedInThisPlan === 0) continue;
    plansChanged++;
    console.log(`${plan.id} (${plan.name}): ${changedInThisPlan} object(s) reclassified.`);

    if (!dryRun) {
      await prisma.floorPlan.update({
        where: { id: plan.id },
        data: { planJson: JSON.stringify(rewritten) },
      });
    }
  }

  console.log('---');
  console.log(`Plans changed: ${plansChanged} / ${plans.length}`);
  console.log(`Objects reclassified: ${objectsChanged}`);
  console.log('By new type:', perTypeCounts);
  console.log(dryRun ? 'Dry run complete — nothing was written.' : 'Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

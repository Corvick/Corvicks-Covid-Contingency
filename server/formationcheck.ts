/**
 * Headless check on the shape a commanded group arrives in. No socket, no port,
 * so it leaves a game on 8080 alone.
 *
 * Reported as *"the final formation needs to be much smaller when selecting
 * grey officers over a large area and telling them to move to a location"*, and
 * the cause is that one uniform scale was doing two unrelated jobs. It was
 * capped at `COMMAND_FORMATION_SPREAD * sqrt(n)` and **floored at
 * `minGap / closest`** — and for a scatter box-selected across a quarter of the
 * city the closest pair is a few hundred pixels apart, so holding *that* pair at
 * 36px held everybody else hundreds of pixels apart with them. The cap decides
 * how big now and `separateSlots` decides what is legal, so neither has to be
 * conservative on the other's behalf.
 *
 * Everything goes through the real `handle` on the engine's own world, because
 * the spectator gate is part of what is being measured.
 *
 * `setLooseFormation` is the gate and it is kept: "the group arrives tight"
 * means nothing without "and it did not before". Both modes run in ONE process
 * on the same staged positions.
 *
 *   npx tsx formationcheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node formationcheck.ts
 */
import {
  resetWorld,
  rebuildEntityGrid,
  makeEntity,
  newAiState,
  type World,
} from './src/world.js';
import { world as engineWorld, handle, setLooseFormation } from './src/engine.js';
import {
  ENTITY_RADIUS,
  OFFICER_SPACING_PAD,
  COMMAND_FORMATION_SPREAD,
} from '../shared/constants.js';

const MIN_GAP = ENTITY_RADIUS.officer * 2 + OFFICER_SPACING_PAD;
/** The tightest n bodies can stand at all: a disc of `minGap/2 * sqrt(n)`. */
const packingRadius = (n: number): number => (MIN_GAP / 2) * Math.sqrt(n);

const f1 = (n: number): string => n.toFixed(1);

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

/**
 * A world with nothing in it but the officers we place.
 *
 * The map is stripped down to open ground for the run — `walkableNear` nudges a
 * slot that lands in geometry, and a rig that let it would be measuring the
 * city's buildings rather than the formation. The officers are placed on a
 * clear patch found for the purpose.
 */
function bareCity(world: World): void {
  resetWorld(world);
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
  }
  world.cityOfficers.clear();
  world.bots.clear();
  rebuildEntityGrid(world);
}

/** Open ground with `radius` of clear space round it. */
function openSpot(world: World, radius: number): { x: number; y: number } | null {
  for (let i = 0; i < 20000; i++) {
    const x = radius + 100 + Math.random() * (world.map.width - 2 * radius - 200);
    const y = radius + 100 + Math.random() * (world.map.height - 2 * radius - 200);
    let clear = true;
    for (let a = 0; a < 16 && clear; a++) {
      const t = (a / 16) * Math.PI * 2;
      for (let r = 0; r <= radius; r += 26) {
        if (world.nav.isBlocked(x + Math.cos(t) * r, y + Math.sin(t) * r)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x, y };
  }
  return null;
}

interface Shape {
  /** Furthest slot from the group's centre. */
  radius: number;
  /** Widest distance between any two slots. */
  across: number;
  /** Closest pair of slots, which must never be under `MIN_GAP`. */
  closest: number;
  /** Worst bearing drift from the centre, in degrees. */
  bearingDrift: number;
  /** How far the group's centre ended up from the click. */
  centroidOff: number;
}

function measure(
  world: World,
  ids: string[],
  before: Array<{ x: number; y: number }>,
  clickX: number,
  clickY: number,
): Shape {
  const slots = ids.map((id) => {
    const st = world.ai.get(id)!;
    return { x: st.commandX ?? 0, y: st.commandY ?? 0 };
  });
  let cx = 0;
  let cy = 0;
  for (const s of slots) {
    cx += s.x;
    cy += s.y;
  }
  cx /= slots.length;
  cy /= slots.length;

  let bx = 0;
  let by = 0;
  for (const b of before) {
    bx += b.x;
    by += b.y;
  }
  bx /= before.length;
  by /= before.length;

  const out: Shape = {
    radius: 0,
    across: 0,
    closest: Infinity,
    bearingDrift: 0,
    centroidOff: Math.hypot(cx - clickX, cy - clickY),
  };
  for (let i = 0; i < slots.length; i++) {
    out.radius = Math.max(out.radius, Math.hypot(slots[i].x - cx, slots[i].y - cy));
    for (let j = i + 1; j < slots.length; j++) {
      const d = Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y);
      out.across = Math.max(out.across, d);
      out.closest = Math.min(out.closest, d);
    }
    // Bearing from the group's own centre, before and after. Only meaningful
    // for a body that is actually off the centre.
    const r0 = Math.hypot(before[i].x - bx, before[i].y - by);
    const r1 = Math.hypot(slots[i].x - cx, slots[i].y - cy);
    if (r0 < 1 || r1 < 1) continue;
    const a0 = Math.atan2(before[i].y - by, before[i].x - bx);
    const a1 = Math.atan2(slots[i].y - cy, slots[i].x - cx);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    out.bearingDrift = Math.max(out.bearingDrift, Math.abs(d) * (180 / Math.PI));
  }
  if (!Number.isFinite(out.closest)) out.closest = 0;
  return out;
}

/** Place `positions` as grey officers, order them to (tx, ty), and measure. */
function order(
  world: World,
  positions: Array<{ x: number; y: number }>,
  tx: number,
  ty: number,
): Shape {
  for (const id of [...world.entities.keys()]) {
    world.entities.delete(id);
    world.ai.delete(id);
    world.cityOfficers.delete(id);
  }
  const ids = positions.map((p, i) => {
    const id = `grey-${i}`;
    world.entities.set(id, makeEntity(id, 'officer', p.x, p.y));
    world.ai.set(id, newAiState(Date.now(), p.x, p.y));
    world.cityOfficers.add(id);
    return id;
  });
  rebuildEntityGrid(world);
  handle('spec', { type: 'command', ids, x: tx, y: ty });
  return measure(world, ids, positions, tx, ty);
}

/** A scatter of `n` officers spread over a disc of `radius`, evenly-ish. */
function scatter(cx: number, cy: number, n: number, radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  // A phyllotaxis spiral rather than uniform random: it is the same shape every
  // run, so two modes are compared on identical input and the numbers do not
  // move between runs of the same code.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

const world = engineWorld;
let spot: { x: number; y: number } | null = null;
for (let attempt = 0; attempt < 8 && !spot; attempt++) {
  bareCity(world);
  spot = openSpot(world, 420);
}
if (!spot) {
  console.log('no open ground found');
  process.exit(1);
}
world.spectators.add('spec');

// The officers are staged far from where they are sent, so the whole formation
// is built out of the offsets rather than out of where they already stood.
const stageX = spot.x;
const stageY = spot.y;
const tx = spot.x;
const ty = spot.y;

console.log('\n=== a wide selection, sent somewhere ===');
console.log(
  `  minGap ${MIN_GAP}px - COMMAND_FORMATION_SPREAD ${COMMAND_FORMATION_SPREAD} ` +
    `(was 45) - packing radius is ${f1(MIN_GAP / 2)} * sqrt(n)`,
);
console.log(
  '  n   spread   OLD radius / across   NEW radius / across   packing   NEW closest pair',
);

const sizes = [3, 6, 12, 20];
const spreads = [900, 1800];
const results: Array<{ n: number; wide: number; old: Shape; now: Shape }> = [];

for (const wide of spreads) {
  for (const n of sizes) {
    const positions = scatter(stageX, stageY, n, wide / 2);
    setLooseFormation(true);
    const old = order(world, positions, tx, ty);
    setLooseFormation(false);
    const now = order(world, positions, tx, ty);
    results.push({ n, wide, old, now });
    console.log(
      `  ${String(n).padEnd(3)} ${String(wide).padEnd(8)} ` +
        `${(f1(old.radius) + ' / ' + f1(old.across)).padEnd(21)} ` +
        `${(f1(now.radius) + ' / ' + f1(now.across)).padEnd(21)} ` +
        `${f1(packingRadius(n)).padEnd(9)} ${f1(now.closest)}`,
    );
  }
}
setLooseFormation(false);

console.log('');
const tighter = results.filter((r) => r.now.across < r.old.across / 1.6);
check(
  tighter.length === results.length,
  'every wide selection arrives at well under two thirds of its old width',
  `${tighter.length}/${results.length}`,
);
check(
  results.every((r) => r.now.closest >= MIN_GAP - 0.5),
  'and no two slots are closer than they can stand',
  `worst ${f1(Math.min(...results.map((r) => r.now.closest)))}px against ${MIN_GAP}`,
);
check(
  results.every((r) => r.now.radius >= packingRadius(r.n) * 0.9),
  'and none is squeezed below what the bodies need',
);
check(
  results.every((r) => r.now.centroidOff < 0.5),
  'the group still lands centred on the click',
  `worst ${f1(Math.max(...results.map((r) => r.now.centroidOff)))}px`,
);
check(
  results.every((r) => r.now.bearingDrift < 12),
  'and keeps its shape — bearings from the centre are held',
  `worst ${f1(Math.max(...results.map((r) => r.now.bearingDrift)))} degrees`,
);

/*
 * **The case that most likely produced the report**, and the one worth reading
 * before anything else here.
 *
 * The old floor was `Math.min(1, minGap / closest)`. Two officers who have
 * already arrived somewhere together settle at exactly `minGap` — CLAUDE.md
 * measures them at 36.0px — so `minGap / closest` is 1, the floor is 1, and the
 * scale is 1: **the formation is not compressed at all**, and a box-selection a
 * thousand pixels wide arrives a thousand pixels wide. One pair standing
 * together anywhere in the selection was enough to switch the whole feature off.
 */
console.log('\n=== a wide selection with two of them already stood together ===');
{
  const wide = scatter(stageX, stageY, 10, 600);
  // Two of them at exactly the separation a pair that has arrived settles at.
  wide.push({ x: stageX + 300, y: stageY + 300 });
  wide.push({ x: stageX + 300 + MIN_GAP, y: stageY + 300 });
  setLooseFormation(true);
  const pairOld = order(world, wide, tx, ty);
  setLooseFormation(false);
  const pairNew = order(world, wide, tx, ty);
  console.log(
    `  OLD radius ${f1(pairOld.radius)} across ${f1(pairOld.across)} - ` +
      `NEW radius ${f1(pairNew.radius)} across ${f1(pairNew.across)}`,
  );
  check(
    pairOld.across > 900,
    'CONTROL: one pair at arm-length used to switch compression off',
    `${f1(pairOld.across)}px across`,
  );
  check(
    pairNew.across < pairOld.across / 5,
    'and now it does not',
    `${f1(pairOld.across)} -> ${f1(pairNew.across)}px`,
  );
  check(pairNew.closest >= MIN_GAP - 0.5, 'with every slot still standable', `${f1(pairNew.closest)}px`);
}

// The case the old floor existed for, and the one a bare cap gets wrong: a
// tight clump with one straggler a long way off. Scaled to fit the straggler,
// the clump lands on one pixel.
console.log('\n=== a clump and a straggler ===');
const clump: Array<{ x: number; y: number }> = [];
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2;
  clump.push({ x: stageX + Math.cos(a) * 26, y: stageY + Math.sin(a) * 26 });
}
clump.push({ x: stageX + 1400, y: stageY });
setLooseFormation(true);
const clumpOld = order(world, clump, tx, ty);
setLooseFormation(false);
const clumpNew = order(world, clump, tx, ty);
console.log(
  `  OLD radius ${f1(clumpOld.radius)} closest ${f1(clumpOld.closest)} - ` +
    `NEW radius ${f1(clumpNew.radius)} closest ${f1(clumpNew.closest)}`,
);
check(
  clumpNew.closest >= MIN_GAP - 0.5,
  'nine in a clump and one far off still all get somewhere to stand',
  `${f1(clumpNew.closest)}px against ${MIN_GAP}`,
);
check(
  clumpNew.radius < clumpOld.radius,
  'and the group is no wider than it was',
  `${f1(clumpOld.radius)} -> ${f1(clumpNew.radius)}`,
);

console.log('\n=== the two cases that must not move ===');
const single = order(world, [{ x: stageX + 700, y: stageY + 700 }], tx, ty);
check(
  Math.hypot((world.ai.get('grey-0')?.commandX ?? 0) - tx, (world.ai.get('grey-0')?.commandY ?? 0) - ty) < 0.5,
  'one officer lands exactly on the click',
  `${f1(single.centroidOff)}px off`,
);

// Already close together: under the cap, so nothing should touch it.
const near = [
  { x: stageX, y: stageY },
  { x: stageX + 43, y: stageY },
  { x: stageX + 21, y: stageY + 37 },
];
const nearShape = order(world, near, tx, ty);
check(
  Math.abs(nearShape.across - 43) < 1,
  'a group already 43px across comes out 43px across',
  `${f1(nearShape.across)}px`,
);

world.spectators.delete('spec');
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` - ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);

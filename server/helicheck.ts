/**
 * Headless check that the helicopter comes in on a random bearing and still
 * flies a straight line. No socket, no port, so it leaves a game on 8080 alone.
 *
 * Asked for as: *"allow the helicopter (more so its shadow) that arrives from
 * various utility items to come in from random orientations. make sure it still
 * travels in a straight line though."* It used to enter perpendicular to the
 * nearest map edge — one of four axis-aligned bearings — so every drop looked
 * the same from above; now the bearing is unconstrained and the run each side
 * of the target is a fixed `HELI_APPROACH_RUN` so the approach takes about the
 * same time whatever direction it comes from.
 *
 * `setHeliAxisAligned` is the gate and it is kept: "the bearings are spread"
 * means nothing without "and they used to be four values".
 *
 *   npx tsx helicheck.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/` — that only includes
 * `src/**`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler \
 *     --strict --skipLibCheck --types node helicheck.ts
 */
import { createWorld, resetWorld, type World } from './src/world.js';
import { callBeaconDrop, updateAirSupport, setHeliAxisAligned } from './src/heli.js';
import { HELI_APPROACH_RUN, TICK_RATE } from '../shared/constants.js';

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail = ''): void {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? '  - ' + detail : ''}`);
}

const world: World = createWorld();
resetWorld(world);
const W = world.map.width;
const H = world.map.height;

/** Drop a helicopter on `(x, y)` and read back its geometry. */
function fly(x: number, y: number) {
  world.helicopters.clear();
  callBeaconDrop(world, x, y, 0);
  const h = [...world.helicopters.values()][0];
  return {
    ex: h.x,
    ey: h.y,
    tx: h.targetX,
    ty: h.targetY,
    xx: h.exitX,
    xy: h.exitY,
    facing: h.facing,
  };
}

// ---- straight line, fixed run, honest facing -----------------------------
console.log('\n=== every approach is a straight line through the target ===');
{
  const N = 600;
  let worstCross = 0;
  let worstRun = 0;
  let worstFacing = 0;
  let fliesThrough = 0;
  for (let i = 0; i < N; i++) {
    const x = 400 + Math.random() * (W - 800);
    const y = 400 + Math.random() * (H - 800);
    const f = fly(x, y);

    // entry -> target and target -> exit must be the same direction (colinear,
    // pointing the same way): it flies *through*, it does not turn around.
    const ax = f.tx - f.ex;
    const ay = f.ty - f.ey;
    const bx = f.xx - f.tx;
    const by = f.xy - f.ty;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const cross = Math.abs(ax * by - ay * bx) / (la * lb); // ~0 when colinear
    const dot = (ax * bx + ay * by) / (la * lb); // ~1 when same direction
    worstCross = Math.max(worstCross, cross);
    if (dot > 0.999) fliesThrough++;

    worstRun = Math.max(worstRun, Math.abs(la - HELI_APPROACH_RUN), Math.abs(lb - HELI_APPROACH_RUN));

    // facing is the heading it holds the whole way.
    const want = Math.atan2(ay, ax);
    let d = Math.abs(((f.facing - want + Math.PI) % (Math.PI * 2)) - Math.PI);
    worstFacing = Math.max(worstFacing, d);
  }
  check(worstCross < 1e-6, 'entry, target and exit are colinear', `worst off-line ${worstCross.toExponential(1)}`);
  check(fliesThrough === N, 'it flies through rather than turning around', `${fliesThrough}/${N}`);
  check(worstRun < 0.5, `each leg is ${HELI_APPROACH_RUN}px`, `worst ${worstRun.toFixed(2)}px off`);
  check(worstFacing < 1e-6, 'facing is the run bearing', `worst ${worstFacing.toExponential(1)} rad`);
}

// ---- the bearing is spread, where it used to be four values --------------
console.log('\n=== the bearing is random, not axis-aligned ===');
function bearingSpread(): { distinct: number; nearAxisFrac: number; octants: number } {
  const N = 1200;
  const seen = new Set<number>();
  const octant = new Array(8).fill(0);
  let nearAxis = 0;
  for (let i = 0; i < N; i++) {
    const x = 400 + Math.random() * (W - 800);
    const y = 400 + Math.random() * (H - 800);
    const f = fly(x, y);
    const b = Math.atan2(f.ty - f.ey, f.tx - f.ex); // -PI..PI
    seen.add(Math.round(b * 1e6));
    octant[Math.floor(((b + Math.PI) / (Math.PI * 2)) * 8) % 8]++;
    // within ~7deg of one of the four axes
    const toAxis = Math.abs(((b + Math.PI / 4 + Math.PI * 2) % (Math.PI / 2)) - Math.PI / 4);
    if (toAxis < 0.12) nearAxis++;
  }
  return {
    distinct: seen.size,
    nearAxisFrac: nearAxis / N,
    octants: octant.filter((c) => c > 0).length,
  };
}

setHeliAxisAligned(true);
const old = bearingSpread();
setHeliAxisAligned(false);
const now = bearingSpread();

console.log(
  `        OLD: ${old.distinct} distinct bearings, ${(old.nearAxisFrac * 100).toFixed(0)}% near an axis, ${old.octants}/8 octants`,
);
console.log(
  `        NEW: ${now.distinct} distinct bearings, ${(now.nearAxisFrac * 100).toFixed(0)}% near an axis, ${now.octants}/8 octants`,
);
check(old.distinct <= 4, 'OLD: at most four bearings', `${old.distinct}`);
check(old.nearAxisFrac > 0.99, 'OLD: every approach is axis-aligned', `${(old.nearAxisFrac * 100).toFixed(0)}%`);
check(now.distinct > 1000, 'NEW: a fresh bearing every time', `${now.distinct}`);
check(now.octants === 8, 'NEW: they land in every octant', `${now.octants}/8`);
// uniform over the circle, ~7deg either side of four axes is 0.96rad of 2PI
check(
  now.nearAxisFrac > 0.08 && now.nearAxisFrac < 0.24,
  'NEW: no clustering on the axes',
  `${(now.nearAxisFrac * 100).toFixed(0)}% (uniform ~15%)`,
);

// ---- the flight still completes -------------------------------------
console.log('\n=== the state machine still runs the whole flight ===');
{
  resetWorld(world);
  const before = world.soldiers.size;
  world.helicopters.clear();
  callBeaconDrop(world, W / 2, H / 2, 0);
  const dt = 1 / TICK_RATE;
  let t = 0;
  const phases = new Set<string>();
  let deletedAt = -1;
  for (let i = 0; i < 1400 && deletedAt < 0; i++) {
    t += dt * 1000;
    updateAirSupport(world, t, dt);
    const h = [...world.helicopters.values()][0];
    if (h) phases.add(h.phase);
    else deletedAt = t;
  }
  check(phases.has('hovering'), 'it reached the drop', `phases ${[...phases].join(',')}`);
  check(phases.has('leaving'), 'it started its exit run');
  check(deletedAt > 0 && deletedAt < 45000, 'it left and was cleaned up', `${(deletedAt / 1000).toFixed(1)}s`);
  check(world.soldiers.size > before, 'a soldier roped down', `${before} -> ${world.soldiers.size}`);
}

console.log(`\n${failures === 0 ? 'ALL OK' : failures + ' FAILED'}  (${checks} checks)\n`);
process.exit(failures === 0 ? 0 : 1);

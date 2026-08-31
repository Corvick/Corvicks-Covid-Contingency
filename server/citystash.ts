/**
 * Headless check on the two things the city puts down for you to find:
 *
 *  - **a patrol car parked near the middle**, with a grey officer beside it and
 *    a gun and a utility on the tarmac — asked for as "one cop car in the middle
 *    of the city (location somewhat random each time but still towards the
 *    center) with a grey officer next to it and with two random loot items";
 *  - **the park's stash out in the open**, asked for as "the loot in the park
 *    needs to spawn in a visible area (not in or touching a tree)".
 *
 * No socket, no port, so it leaves a game on 8080 alone.
 *   npx tsx citystash.ts
 *   CITIES=20 npx tsx citystash.ts
 *
 * Not typechecked by `npx tsc --noEmit` in `server/`, which only includes
 * `src`. Check it explicitly:
 *   npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
 *     --strict --skipLibCheck --types node citystash.ts
 */
import { createWorld, buildingIndexAt, type World } from './src/world.js';
import { closestOnBox } from './src/geometry.js';
import { vehicleBox } from './src/backup.js';
import { ITEMS } from '../shared/items.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  CITY_CAR_SPREAD,
  CITY_CAR_OFFICER_GAP,
  PARK_LOOT_CLEARANCE,
  CAR_LENGTH,
  CAR_WIDTH,
  setCityPopulation,
} from '../shared/constants.js';

const CITIES = Number(process.env.CITIES ?? 20);
setCityPopulation(Number(process.env.POP ?? 500));

let fails = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (!ok) fails++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  - ' + detail : ''}`);
}
const f1 = (n: number): string => n.toFixed(1);
function med(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface Row {
  placed: boolean;
  /** How far off the centre of the map, as a share of the half-diagonal. */
  offCentre: number;
  inBuilding: boolean;
  officerGap: number;
  /** Item ids beside it, and what kind each is. */
  kinds: string[];
  lootOnBody: number;
  /** Park loot: how many, and how many are inside a bush. */
  park: number;
  parkTouching: number;
  parkNearest: number[];
}

function inspect(world: World): Row {
  const row: Row = {
    placed: false,
    offCentre: 0,
    inBuilding: false,
    officerGap: Infinity,
    kinds: [],
    lootOnBody: 0,
    park: 0,
    parkTouching: 0,
    parkNearest: [],
  };

  const car = world.vehicles.get('city-car');
  if (car) {
    row.placed = true;
    const dx = car.x - WORLD_WIDTH / 2;
    const dy = car.y - WORLD_HEIGHT / 2;
    // **Per axis, not the diagonal.** The spread is applied to each axis in
    // turn, so the cap is CITY_CAR_SPREAD on each — a hypot of the two reads up
    // to sqrt(2) times that and made a correct placement look out of bounds.
    row.offCentre = Math.max(Math.abs(dx) / (WORLD_WIDTH / 2), Math.abs(dy) / (WORLD_HEIGHT / 2));
    // Every corner and flank of the body, not just its centre.
    const cos = Math.cos(car.facing);
    const sin = Math.sin(car.facing);
    for (const along of [-CAR_LENGTH / 2, 0, CAR_LENGTH / 2]) {
      for (const across of [-CAR_WIDTH / 2, 0, CAR_WIDTH / 2]) {
        const px = car.x + cos * along - sin * across;
        const py = car.y + sin * along + cos * across;
        if (buildingIndexAt(world, px, py) >= 0) row.inBuilding = true;
      }
    }
    const guard = world.entities.get('city-car-officer');
    if (guard) row.officerGap = Math.hypot(guard.x - car.x, guard.y - car.y);

    const box = vehicleBox(car);
    for (let i = 0; i < 2; i++) {
      const p = world.pickups.get(`loot-car-${i}`);
      if (!p) continue;
      row.kinds.push(ITEMS[p.item]?.kind ?? '?');
      if (closestOnBox(box, p.x, p.y).dist <= 1) row.lootOnBody++;
    }
  }

  // The park's own stash. Identified by lying inside the park rectangle, since
  // the ids are the ordinary `loot-N` run.
  const park = world.map.park;
  for (const p of world.pickups.values()) {
    if (p.id.startsWith('loot-car-')) continue;
    if (p.x < park.x || p.y < park.y || p.x > park.x + park.w || p.y > park.y + park.h) continue;
    row.park++;
    let nearest = Infinity;
    for (const bush of world.map.bushes) {
      nearest = Math.min(nearest, Math.hypot(bush.x - p.x, bush.y - p.y) - bush.r);
    }
    row.parkNearest.push(nearest);
    if (nearest <= 0) row.parkTouching++;
  }
  return row;
}

const rows: Row[] = [];
for (let i = 0; i < CITIES; i++) rows.push(inspect(createWorld()));

const placed = rows.filter((r) => r.placed);
console.log(`\n=== a patrol car in the middle of the city (${CITIES} cities) ===`);
check(placed.length === CITIES, 'one is parked in every city', `${placed.length}/${CITIES}`);
check(
  placed.every((r) => !r.inBuilding),
  'and never with its body in a building',
  `${placed.filter((r) => r.inBuilding).length} in one`,
);
check(
  placed.every((r) => r.offCentre <= CITY_CAR_SPREAD + 0.001),
  'inside the band it is allowed',
  `worst ${f1(Math.max(0, ...placed.map((r) => r.offCentre)) * 100)}% of the half-map, cap ${f1(CITY_CAR_SPREAD * 100)}%`,
);
{
  const xs = placed.map((r) => r.offCentre);
  check(
    Math.max(...xs) - Math.min(...xs) > 0.05,
    'and somewhere different each round',
    `${f1(Math.min(...xs) * 100)}% to ${f1(Math.max(...xs) * 100)}% off centre`,
  );
}
check(
  placed.every((r) => r.officerGap < CITY_CAR_OFFICER_GAP * 2),
  'a grey officer is stood beside it',
  `median ${f1(med(placed.map((r) => r.officerGap)))}px`,
);
check(
  placed.every((r) => r.kinds.length === 2),
  'with two items on the tarmac',
  `${placed.filter((r) => r.kinds.length === 2).length}/${placed.length}`,
);
check(
  placed.every((r) => r.kinds.includes('gun') && r.kinds.some((k) => k !== 'gun')),
  'one of them a gun and one of them not',
  placed
    .map((r) => r.kinds.join('+'))
    .slice(0, 4)
    .join(', '),
);
check(
  placed.every((r) => r.lootOnBody === 0),
  'and neither of them under the car',
  `${placed.reduce((a, r) => a + r.lootOnBody, 0)} on the body`,
);

console.log(`\n=== the park's stash, out where you can see it ===`);
const park = rows.filter((r) => r.park > 0);
check(park.length > 0, 'the park has loot in it', `${park.length}/${CITIES} cities`);
check(
  rows.every((r) => r.parkTouching === 0),
  'none of it in or touching a bush',
  `${rows.reduce((a, r) => a + r.parkTouching, 0)} touching`,
);
{
  const all = rows.flatMap((r) => r.parkNearest).filter((d) => Number.isFinite(d));
  check(
    all.every((d) => d >= PARK_LOOT_CLEARANCE - 0.5),
    `every one at least PARK_LOOT_CLEARANCE (${PARK_LOOT_CLEARANCE}px) clear of the nearest`,
    `closest ${f1(Math.min(...all))}px, median ${f1(med(all))}px`,
  );
}
console.log(`  park pickups per city: median ${med(rows.map((r) => r.park))}`);

console.log(`\n${fails === 0 ? 'all checks passed' : `${fails} checks FAILED`}`);

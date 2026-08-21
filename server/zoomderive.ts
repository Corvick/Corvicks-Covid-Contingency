/**
 * Re-derive the three sight radii for a candidate `CAMERA_ZOOM`.
 *
 * The radii are not chosen. The fog has to reach wherever the camera can put
 * the screen and the server has to send entities that far, so the pan and the
 * zoom between them set all three — move either and they must be re-derived or
 * the far half of the screen goes dark. This replicates `cameraReach` and
 * `fogRadius` from the client exactly, and reports what each zoom demands.
 *
 * Raising the zoom shrinks how much world is on screen, so the radii come
 * *down* — which is the whole point: less ground in the fog is less ground to
 * serialise, and fewer bodies to draw.
 */
import {
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  CAMERA_PAN_X,
  SCOPE_PUSH,
  BINOCULAR_PUSH,
  PLAYER_SIGHT_RADIUS,
  BINOCULAR_SIGHT_RADIUS,
  SNIPER_SIGHT_RADIUS,
  CAMERA_ZOOM,
  DOG_CAMERA_ZOOM,
  DOG_SIGHT_RADIUS,
  SWAT_SIGHT,
} from '../shared/constants.js';

/** Straight out of constants.ts — kept in step by hand, so check it. */
const PAN_KEEP_ON_SCREEN = 0.72;

function panY(zoom: number): number {
  return Math.min(
    CAMERA_PAN_X + (VIEWPORT_WIDTH - VIEWPORT_HEIGHT) / (2 * zoom),
    ((VIEWPORT_HEIGHT / 2) * PAN_KEEP_ON_SCREEN) / zoom,
  );
}

/** `fogRadius` from main.ts: the furthest screen corner the push can produce. */
function required(zoom: number, scope: number): number {
  const reachX = scope + CAMERA_PAN_X;
  const reachY = scope + panY(zoom);
  let worst = 0;
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    const d = Math.hypot(
      VIEWPORT_WIDTH / 2 / zoom + Math.cos(a) * reachX,
      VIEWPORT_HEIGHT / 2 / zoom + Math.sin(a) * reachY,
    );
    if (d > worst) worst = d;
  }
  return Math.round(worst) + 24;
}

const current = { hip: PLAYER_SIGHT_RADIUS, bino: BINOCULAR_SIGHT_RADIUS, scope: SNIPER_SIGHT_RADIUS };

console.log(`\nviewport ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} · CAMERA_PAN_X ${CAMERA_PAN_X}`);
console.log(`current radii: hip ${current.hip} · binoculars ${current.bino} · scope ${current.scope}\n`);
console.log('  zoom   world on screen    panY    hip   binoc   scope   ground in fog vs now');

for (const zoom of [1.6, 1.8, 2.0, 2.2, 2.5]) {
  const w = VIEWPORT_WIDTH / zoom;
  const h = VIEWPORT_HEIGHT / zoom;
  const hip = required(zoom, 0);
  const bino = required(zoom, BINOCULAR_PUSH);
  const scope = required(zoom, SCOPE_PUSH);
  // How much ground the hip-fire fog covers, against the current zoom.
  const area = (hip * hip) / (required(CAMERA_ZOOM, 0) * required(CAMERA_ZOOM, 0));
  console.log(
    `  ${zoom.toFixed(1).padStart(4)}   ${`${Math.round(w)}x${Math.round(h)}`.padEnd(14)}  ` +
      `${panY(zoom).toFixed(0).padStart(5)}  ${String(hip).padStart(5)}  ${String(bino).padStart(6)}  ` +
      `${String(scope).padStart(6)}   ${(area * 100).toFixed(0).padStart(5)}%`,
  );
}

// The check worth keeping: the fog must not reach past what the server sends.
console.log(`\n  sanity at the current ${CAMERA_ZOOM}: fog needs ` +
  `${required(CAMERA_ZOOM, 0)}/${required(CAMERA_ZOOM, BINOCULAR_PUSH)}/${required(CAMERA_ZOOM, SCOPE_PUSH)} ` +
  `against radii ${current.hip}/${current.bino}/${current.scope}`);
const ok =
  required(CAMERA_ZOOM, 0) <= current.hip &&
  required(CAMERA_ZOOM, BINOCULAR_PUSH) <= current.bino &&
  required(CAMERA_ZOOM, SCOPE_PUSH) <= current.scope;
console.log(`  ${ok ? 'OK — no dark band on any of the three' : '** SHORT — the far half of the screen would go dark **'}`);

// The dog has its own camera, so it needs its own row. It carries nothing, so
// hip fire is the only case it has — but the pan is capped per zoom, so its
// reach is not the officer's scaled by anything and has to be derived, not
// guessed. The second line is the reason the zoom was pulled out at all:
// whatever can shoot the dog must be something the dog can look at.
const dogNeeds = required(DOG_CAMERA_ZOOM, 0);
const dogVertical = VIEWPORT_HEIGHT / 2 / DOG_CAMERA_ZOOM + panY(DOG_CAMERA_ZOOM);
console.log(`\n  dog at ${DOG_CAMERA_ZOOM}: fog needs ${dogNeeds} against DOG_SIGHT_RADIUS ${DOG_SIGHT_RADIUS}`);
console.log(`  ${dogNeeds <= DOG_SIGHT_RADIUS ? 'OK — no dark band' : '** SHORT — the dog would light ground with nothing sent for it **'}`);
console.log(
  `  dog can look ${dogVertical.toFixed(0)}px up/down against SWAT_SIGHT ${SWAT_SIGHT} — ` +
    `${dogVertical >= SWAT_SIGHT ? 'OK, nothing shoots it from off screen' : '** SHORT — SWAT still out-ranges the frame **'}\n`,
);

/**
 * And the same sweep for the dog's own camera, which is the one that actually
 * moves. Its rule is not the officer's — it carries nothing, so hip fire is its
 * only case, and what it has to satisfy instead is that **anything which can
 * shoot it is something it can look at**: the vertical half-screen plus the
 * capped pan against `SWAT_SIGHT`. Pulling the zoom out buys vision and costs
 * fog and serialisation on the one connection already paying the most, so the
 * question is always "what is the tightest zoom that still clears SWAT", and
 * this is the table that answers it.
 */
console.log('  dog zoom   world on screen    panY    up/down   vs SWAT   sight radius needed');
for (const zoom of [1.4, 1.45, 1.5, 1.55, 1.6, 1.7]) {
  const w = VIEWPORT_WIDTH / zoom;
  const h = VIEWPORT_HEIGHT / zoom;
  const vertical = VIEWPORT_HEIGHT / 2 / zoom + panY(zoom);
  const needs = required(zoom, 0);
  console.log(
    `  ${zoom.toFixed(2).padStart(8)}   ${`${Math.round(w)}x${Math.round(h)}`.padEnd(14)}  ` +
      `${panY(zoom).toFixed(0).padStart(5)}  ${vertical.toFixed(0).padStart(8)}  ` +
      `${(vertical >= SWAT_SIGHT ? 'OK' : 'SHORT').padStart(7)}   ${String(needs).padStart(18)}`,
  );
}
console.log('');

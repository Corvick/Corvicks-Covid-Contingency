/**
 * Dog inspection rig. Temporary — delete after.
 *
 * Drives the real `drawEntity` by hand at a scale you can actually see, the
 * same way the flame stream is checked. Driven off setInterval rather than
 * rAF, which is throttled to nothing while the browser pane isn't compositing.
 */
import type { EntityState, MapData } from '../../shared/types.js';
import { drawEntity, drawGround, drawBlood, drawBloodSpray, spawnBlood } from './render.js';

const canvas = document.getElementById('rig') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const fakeMap = { width: canvas.width, height: canvas.height } as MapData;
const view = { x: 0, y: 0, w: canvas.width, h: canvas.height };

const SCALE = 4;

/**
 * The same poses again at 1:1, which is the size the thing is actually played
 * at. Judging a 13px animal at six times life is how you end up with detail
 * nobody will ever see and a silhouette that doesn't read.
 */
const LIFE_Y = 1060;

interface Pose {
  label: string;
  x: number;
  y: number;
  /** How far round the head is from the body, in radians. */
  yaw: number;
  moving: boolean;
  grappling?: boolean;
  lunging?: boolean;
  health?: number;
  /** Rotating on the spot, so the legs can be seen stepping round a turn. */
  spinning?: boolean;
  /** Snapping on a cycle, so the *opening* can be watched, not its end states. */
  snapping?: boolean;
  /** Put down: grey, sprawled, and left on the road. */
  dead?: boolean;
}

const poses: Pose[] = [
  { label: 'standing (head shut)', x: 180, y: 140, yaw: 0, moving: false },
  { label: 'trotting', x: 590, y: 140, yaw: 0.25, moving: true },
  { label: 'head turned', x: 1000, y: 140, yaw: 0.95, moving: false },
  { label: 'LUNGE — head split', x: 180, y: 400, yaw: 0, moving: true, lunging: true },
  { label: 'latched (worrying)', x: 590, y: 400, yaw: -0.5, moving: false, grappling: true },
  { label: 'lunging, turned', x: 1000, y: 400, yaw: -0.85, moving: true, lunging: true },
  // Pivoting on the spot: covers no ground at all, so the legs here are driven
  // entirely by the turn. If they stand still, the rotation gait is broken.
  { label: 'TURNING ON THE SPOT', x: 180, y: 640, yaw: 0.3, moving: false, spinning: true },
  // Snapping on a cycle, so the *opening* can be watched rather than only its
  // two end states — which is the whole thing that was missing.
  { label: 'SNAPPING (mid-open)', x: 590, y: 640, yaw: 0.1, moving: false, snapping: true },
  { label: 'snapping, turned', x: 1000, y: 640, yaw: -0.7, moving: false, snapping: true },
  { label: 'DEAD (corpse)', x: 180, y: 880, yaw: 0.2, moving: false, dead: true },
];

let t = 0;

/** One dog at true size, with an officer stood next to it for scale. */
function lifeSize(pose: Pose, x: number, y: number): void {
  const travel = pose.moving ? (t * 190) % 1e6 : 0;
  ctx.save();
  ctx.translate(x - travel, y);
  drawEntity(
    ctx,
    {
      id: pose.label + '-life',
      type: 'zombie',
      x: travel,
      y: 0,
      facing: 0,
      health: pose.health ?? 120,
      dog: true,
      head: pose.yaw,
      grappling: pose.grappling,
      lunging: pose.lunging,
    },
    false,
    performance.now(),
    false,
  );
  ctx.restore();
  drawEntity(
    ctx,
    { id: pose.label + '-cop', type: 'officer', x: x + 62, y, facing: Math.PI, health: 100 },
    false,
    performance.now(),
    false,
  );
}

function frame(): void {
  t += 1 / 30;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawGround(ctx, fakeMap);

  const now = performance.now();
  drawBlood(ctx, view, now);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('— at 1:1, the size it is played at —', 40, LIFE_Y - 40);
  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    // The 1:1 strip, and an officer beside it for scale.
    lifeSize(pose, 70 + i * 135, LIFE_Y);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(pose.label, pose.x - 60, pose.y + 110);

    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.scale(SCALE, SCALE);

    // The gait is derived from ground actually covered, so a trotting dog has
    // to be *moved* — nudging the facing alone would give it a still stance.
    // A spinning one covers no ground and drives its legs off the turn instead.
    const travel = pose.moving ? (t * 190) % 1e6 : 0;
    const facing = pose.spinning ? t * 1.6 : 0;
    const e: EntityState = {
      id: pose.label,
      type: pose.label.startsWith('zombie') ? 'zombie' : 'zombie',
      x: travel,
      y: 0,
      facing,
      health: pose.health ?? 120,
      dog: !pose.label.startsWith('zombie'),
      head: facing + pose.yaw,
      grappling: pose.grappling,
      lunging: pose.snapping ? Math.sin(t * 3) > 0 : pose.lunging,
      dead: pose.dead,
    };
    // Draw it at the origin whatever the travel says, so it stays in its cell
    // while the legs still know how far it has gone.
    ctx.translate(-travel, 0);
    drawEntity(ctx, e, false, now, false);
    ctx.restore();
  }

  drawBloodSpray(ctx, now);
}

// A splatter, so the decals and the spray can be looked at too.
spawnBlood(560, 300, 0.3, performance.now());
spawnBlood(600, 320, 2.4, performance.now());
setInterval(frame, 1000 / 30);
frame();

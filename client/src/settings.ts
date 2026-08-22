/**
 * What the player has chosen to spend their machine on.
 *
 * Every one of these is a *client* decision — how the world is drawn, never
 * what is in it — so nothing here reaches the server and no two players can
 * see a different game because of it. That is the line: a setting that changed
 * what you could see would be a cheat, not a graphics option.
 *
 * **The costs quoted are measured, not guessed**, and they are quoted because
 * most of them are tiny. It would be easy to fill this screen with switches
 * that save nothing and let somebody spend an evening toggling them; saying
 * what each is worth is what stops that. On a 1920x1080 backbuffer with a
 * city framed, the whole scene paints in about 5ms and the grime tile is
 * 0.09ms of it. The fog is the one that matters.
 */

export interface Settings {
  /**
   * Draw bodies between snapshots rather than on them.
   *
   * The world moves 30 times a second and the screen draws 60, so without this
   * every body — and the camera following one of them — steps once every second
   * frame and is shown twice. The frame counter says 60 and the motion is 30.
   *
   * Costs up to one snapshot of visual delay, about 17ms on average. The
   * crosshair is client-side and does not pay it, but movement feels slightly
   * floatier. Off is *lower latency and worse motion*, which is a real
   * preference and why it is a switch rather than a decision.
   */
  smoothMotion: boolean;

  /**
   * How finely the fog's shadows are traced.
   *
   * **The biggest single cost in a frame**, and the only row here whose saving
   * is worth the trip — the visibility polygon runs 2-7ms against about 1ms for
   * everything else drawn.
   *
   * `low` does two things, and the *second* is the one that pays. A coarser
   * base fan measured only **9% off the median** (0.38 → 0.35ms), because the
   * early-out means a base ray stops after a handful of walls; the expensive
   * rays are the ones cast at wall corners, and those cannot go without putting
   * shadow edges where the walls are not. So `low` also lets the viewer walk
   * twice as far before rebuilding, which halves how often the polygon runs.
   * The cost is shadows cast from a staler position — their edges lag near
   * walls while moving.
   *
   * There is deliberately no "off". The fog is not decoration — the server
   * only sends what you can see, so removing the polygon would light ground
   * with nothing on it rather than showing you anything new.
   */
  fogDetail: 'full' | 'low';

  /**
   * Draw no fog at all. **Offline rounds only**, and a development tool rather
   * than a graphics setting.
   *
   * The visibility polygon is the largest single thing in a frame, and skipping
   * it is why a spectator — who computes none — is cheaper per frame than a
   * player despite drawing five hundred bodies instead of a dozen.
   *
   * **It is not a wallhack, and cannot become one.** Fog is enforced on the
   * server: an entity outside your sight radius is never put on the wire, so
   * there is nothing hidden on this machine for the client to reveal. What this
   * actually uncovers is the *map* — walls, buildings, the park, the pond —
   * which the client is handed in full at `welcome` and would have drawn
   * anyway. Bodies stay exactly as visible as they were.
   *
   * Restricted to offline for that last reason: knowing the city's layout
   * before walking it is a real advantage against other people, even though
   * knowing where they are is not on offer.
   */
  noFog: boolean;

  /** Grime on the road and the dark corners. Measured at 0.09ms and 0.36ms. */
  groundDetail: boolean;
  vignette: boolean;

  /**
   * Blood on the road, and the droplets thrown off a hit.
   *
   * Bounded and drawn in four unioned paths, so it is cheap — but it is the
   * only thing here that *accumulates* over a round, and somebody hunting for
   * frames on a long game should be able to turn it off.
   */
  blood: boolean;

  /**
   * How many pixels the frame is painted at, as a multiple of the 1920x1080
   * viewport — see `RENDER_SCALES`.
   *
   * **The one row here that buys frames in proportion to itself.** Everything
   * else is a cached fill measured in fractions of a millisecond; painting is
   * not cached and scales with area, so 0.75 is 56% of the pixels and 0.5 is a
   * quarter. The fog mask is a fraction *of the backbuffer*, so its blur and
   * its blit come down with it as well.
   *
   * It cannot change what you can see. The viewport stays 1920x1080 in layout
   * units and every camera, fog, HUD and mouse figure is written in those; all
   * that moves is `canvas.width` and one transform at the top of the frame.
   *
   * Applied on the next frame like everything else here, with no restart —
   * `applyRenderScale` is what `main.ts` registers to resize the two canvases.
   */
  renderScale: number;

  /**
   * **TESTING: the zombie dog's ability cooldowns, off.** Offline rounds only.
   *
   * The one row on that screen that is *not* a client decision, and it is worth
   * being straight about that. Everything else there is how the world is drawn
   * — nothing reaches the server, so no two players can see a different game
   * because of it. A cooldown is a rule about the game and it has to be sent.
   *
   * It carries the same restriction `noFog` does and for the same reason: an
   * offline round has exactly one person in it, so there is nobody to see a
   * different game from. **The server enforces that**, not this flag — a
   * setting the menu declines to offer is still in `localStorage` and would
   * otherwise be carried into an online round without anybody touching
   * anything, which is the trap `noFog` already documents.
   *
   * It is the three ability hexagons and the tentacle lash. The jaws are left
   * alone: the open-shut-recover rhythm is the bite rather than a cooldown on
   * it, and a dog that could re-open its mouth on the same tick would be
   * testing something that does not exist.
   */
  dogLimits: boolean;
}

/**
 * Everything on. These are the settings the game was tuned and measured at,
 * so a fresh install sees what it was designed to look like.
 */
export const DEFAULTS: Settings = {
  smoothMotion: true,
  fogDetail: 'full',
  noFog: false,
  groundDetail: true,
  vignette: true,
  blood: true,
  // Deliberately 1 rather than the sharpest on offer: the game is tuned and
  // measured at the viewport's own size, and a fresh install should see what
  // it was designed to look like *and* cost.
  renderScale: 1,
  // On, i.e. the game as it is. A testing switch defaults to not testing.
  dogLimits: true,
};

/** What LOW GRAPHICS sets. Everything cosmetic off, and the fog coarsened. */
export const LOW: Settings = {
  smoothMotion: true, // kept: it costs nothing to draw and is what smooths a slow machine
  fogDetail: 'low',
  // Deliberately *not* part of the preset. LOW is about how the game is drawn;
  // this changes what a round shows you, and is a tool rather than a quality.
  noFog: false,
  groundDetail: false,
  vignette: false,
  blood: false,
  // The only row in the preset that is worth more than the rest put together
  // — 56% of the pixels, against fractions of a millisecond for the others.
  // 0.75 rather than the floor because LOW should still be playable to look
  // at; anybody who needs a quarter of the pixels can say so on the row.
  renderScale: 0.75,
  // Deliberately *not* part of the preset, the same as `noFog` above: LOW is
  // about how the game is drawn, and this changes what a round is.
  dogLimits: true,
};

const KEY = 'zombie.settings.v1';

/**
 * Live, and shared by reference.
 *
 * The render path reads this object every frame rather than being handed a
 * copy, so a change on the options screen takes effect on the next frame with
 * nothing to plumb through and nothing to restart.
 */
export const settings: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    // Merged over the defaults rather than trusted whole: a stored blob from an
    // older build is missing whatever has been added since, and a missing
    // boolean reads as `false`, which would silently turn a feature off.
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Told when the render scale changes, so the two canvases can be resized.
 *
 * Everything else here is read straight out of `settings` by the render path
 * on the next frame and needs no notification at all. The backbuffer is the
 * exception: a canvas has to be *told* its new size, and resizing it clears it
 * — so it is done once on the change rather than tested every frame.
 */
let onRenderScale: ((scale: number) => void) | null = null;

export function applyRenderScale(fn: (scale: number) => void): void {
  onRenderScale = fn;
  fn(settings.renderScale);
}

/** Write the choice back into the live object, and remember it. */
export function apply(next: Partial<Settings>): void {
  const was = settings.renderScale;
  Object.assign(settings, next);
  if (settings.renderScale !== was) onRenderScale?.(settings.renderScale);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, or storage full. The setting still applies to this
    // session; it simply will not be there next time.
  }
}

/** True when nothing has been changed away from the shipped look. */
export function isDefault(): boolean {
  return (Object.keys(DEFAULTS) as Array<keyof Settings>).every((k) => settings[k] === DEFAULTS[k]);
}

/** True when every setting matches the low preset. */
export function isLow(): boolean {
  return (Object.keys(LOW) as Array<keyof Settings>).every((k) => settings[k] === LOW[k]);
}

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
}

/**
 * Everything on. These are the settings the game was tuned and measured at,
 * so a fresh install sees what it was designed to look like.
 */
export const DEFAULTS: Settings = {
  smoothMotion: true,
  fogDetail: 'full',
  groundDetail: true,
  vignette: true,
  blood: true,
};

/** What LOW GRAPHICS sets. Everything cosmetic off, and the fog coarsened. */
export const LOW: Settings = {
  smoothMotion: true, // kept: it costs nothing to draw and is what smooths a slow machine
  fogDetail: 'low',
  groundDetail: false,
  vignette: false,
  blood: false,
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

/** Write the choice back into the live object, and remember it. */
export function apply(next: Partial<Settings>): void {
  Object.assign(settings, next);
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

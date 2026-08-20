import { execFileSync } from 'node:child_process';
import { GAME_VERSION } from './constants.js';

/**
 * Which build this is: the update it belongs to, then the commit it actually
 * came from.
 *
 * `GAME_VERSION` is the conventional half and is bumped by hand. Everything
 * after it is worked out from git — the short commit, the date it was made, and
 * a `*` when the working tree has been edited since — because a number somebody
 * has to remember to bump is a number that lies, and the question this exists to
 * answer ("is the box in front of me running the same code as the other one?")
 * is precisely the one a stale version answers wrongly. The version says which
 * update you *meant* to be on; the hash says which code you are on, and only the
 * hash notices uncommitted edits.
 *
 * **Node-only, and it must stay out of the browser bundle.** The client cannot
 * shell out, so Vite runs this at build time and bakes the answer in as
 * `__BUILD__`; the server runs it once at startup and puts it on the wire. One
 * derivation and two callers, so the two halves cannot disagree about the
 * *format* — only about the contents, which is the whole point of showing both.
 *
 * `client/tsconfig.json` excludes this file deliberately: the client typechecks
 * all of `shared/`, and `node:child_process` does not exist there.
 */
export function buildStamp(cwd: string): string {
  try {
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

    const commit = git('rev-parse', '--short', 'HEAD');
    const date = git('log', '-1', '--format=%cd', '--date=format:%d %b');
    // Uncommitted edits are the case where the version *and* the commit are both
    // a lie: two machines can agree on each and still be running different code.
    const dirty = git('status', '--porcelain').length > 0 ? '*' : '';
    return `v${GAME_VERSION} · ${commit}${dirty} · ${date}`;
  } catch {
    // Not a checkout — a copied folder, or a build from a zip. The version is
    // still true, so say that much rather than nothing.
    return `v${GAME_VERSION}`;
  }
}

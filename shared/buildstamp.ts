import { execFileSync } from 'node:child_process';

/**
 * Which build this is, worked out from git rather than written down.
 *
 * A number somebody has to remember to bump is a number that lies, and the one
 * question this exists to answer — "is the box in front of me running the same
 * code as the other one?" — is precisely the question a stale version answers
 * wrongly. So nothing is written down: the short commit, the date it was made,
 * and a `*` when the working tree has been edited since.
 *
 * **Node-only, and it must stay out of the browser bundle.** The client cannot
 * shell out, so Vite runs this at build time and bakes the answer in as
 * `__BUILD__`; the server runs it once at startup and puts it on the wire. One
 * derivation and two callers, so the two halves cannot disagree about the
 * *format* — only about the commit, which is the whole point of showing both.
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
    // Uncommitted edits are the case where the commit on its own is a lie: two
    // machines can sit on the same hash and still be running different code.
    const dirty = git('status', '--porcelain').length > 0 ? '*' : '';
    return `${commit}${dirty} · ${date}`;
  } catch {
    // Not a checkout — a copied folder, or a build from a zip. Say so rather
    // than inventing a number.
    return 'unknown';
  }
}

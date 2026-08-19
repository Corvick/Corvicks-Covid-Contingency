/**
 * What a join code has to be, checked headlessly — no socket, no port, and it
 * leaves a running game on 8080 alone.
 *
 *   cd server && npx tsx codecheck.ts
 */
import {
  createLobby,
  joinLobby,
  leaveLobby,
  normaliseCode,
  seatedPlayers,
} from './src/lobby.js';
import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH } from '../shared/constants.js';

let failures = 0;
const check = (what: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${detail ? ` — ${detail}` : ''}`);
};

// ---- 1. shape, alphabet, and no collisions -------------------------------
const N = 4000;
const made: string[] = [];
const seen = new Set<string>();
const letters = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const lobby = createLobby(`host-${i}`, `room ${i}`, `HOST${i}`);
  made.push(lobby.code);
  seen.add(lobby.code);
  for (const ch of lobby.code) letters.set(ch, (letters.get(ch) ?? 0) + 1);
}
check(`${N} codes are all ${LOBBY_CODE_LENGTH} letters`, made.every((c) => c.length === LOBBY_CODE_LENGTH));
check(
  'every letter is in the alphabet',
  made.every((c) => [...c].every((ch) => LOBBY_CODE_ALPHABET.includes(ch))),
);
check('no vowels, so no code spells anything', !made.some((c) => /[AEIOU]/.test(c)));
check(`no two live lobbies share a code`, seen.size === N, `${seen.size}/${N} distinct`);
// Not a statistical test — just proof the draw isn't stuck on part of the range.
const counts = [...letters.values()];
check(
  'every letter in the alphabet gets drawn',
  letters.size === LOBBY_CODE_ALPHABET.length,
  `${letters.size}/${LOBBY_CODE_ALPHABET.length} used, ` +
    `min ${Math.min(...counts)} max ${Math.max(...counts)} of ${(N * LOBBY_CODE_LENGTH) / LOBBY_CODE_ALPHABET.length} expected`,
);

for (let i = 0; i < N; i++) leaveLobby(`host-${i}`);

// ---- 2. normalising what somebody pastes ---------------------------------
const target = createLobby('host', 'the room', 'HOST');
const code = target.code;
const lower = code.toLowerCase();
for (const [label, typed] of [
  ['exactly right', code],
  ['lower case', lower],
  ['leading and trailing space', `  ${lower}  `],
  ['pasted with a newline', `${code}\n`],
  ['hyphenated', [...lower].join('-')],
  ['quoted', `"${code}"`],
] as const) {
  check(`normalise: ${label}`, normaliseCode(typed) === code, `${JSON.stringify(typed)} -> ${normaliseCode(typed)}`);
}
// A typo'd letter must stay put rather than being dropped and shifting the
// rest along, which would silently turn one bad letter into a different code.
check(
  'a letter outside the alphabet is kept, not dropped',
  normaliseCode('AB' + code.slice(2)).length === LOBBY_CODE_LENGTH,
);

// ---- 3. joining ----------------------------------------------------------
const good = joinLobby('guest', `  ${lower} `, 'GUEST');
check('a right code, sloppily typed, gets you in', good.ok);
check('and seats you', good.ok && seatedPlayers(good.lobby).includes('guest'));

let wrong = '';
do {
  wrong = Array.from({ length: LOBBY_CODE_LENGTH }, () =>
    LOBBY_CODE_ALPHABET[Math.floor(Math.random() * LOBBY_CODE_ALPHABET.length)],
  ).join('');
} while (wrong === code);
const bad = joinLobby('guest2', wrong, 'GUEST2');
check('a wrong code is refused', !bad.ok, bad.ok ? '' : bad.reason);

const short = joinLobby('guest3', code.slice(0, 2), 'GUEST3');
check('a half-typed code is refused for being short', !short.ok, short.ok ? '' : short.reason);
check(
  'and the two refusals read differently',
  !bad.ok && !short.ok && bad.reason !== short.reason,
);

const junk = joinLobby('guest4', '!!!!', 'GUEST4');
check('punctuation alone is refused', !junk.ok, junk.ok ? '' : junk.reason);

// An offline room is solo by promise, so its code must not let anybody in.
const solo = createLobby('soloist', 'OFFLINE', 'SOLO', true);
const crash = joinLobby('gatecrasher', solo.code, 'GATECRASHER');
check('an offline room refuses its own code', !crash.ok, crash.ok ? '' : crash.reason);
check('and is not given away as existing', !crash.ok && crash.reason === bad.reason.replace(wrong, solo.code));

// ---- 4. a closed lobby's code stops working ------------------------------
leaveLobby('host'); // the host going takes the lobby with it
const stale = joinLobby('guest5', code, 'GUEST5');
check('a closed lobby\'s code no longer works', !stale.ok, stale.ok ? '' : stale.reason);

leaveLobby('soloist');
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

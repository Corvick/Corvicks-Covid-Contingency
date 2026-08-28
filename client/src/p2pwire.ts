/**
 * What the page and the host's engine worker say to each other.
 *
 * This exists as a module of its own for one reason, and it is a bundling one:
 * `p2phost.ts` imports `engine.ts`, which is the entire game. It is only ever
 * reached through `new Worker(new URL(...))`, which Vite splits into a chunk of
 * its own — but a plain `import` of anything from it, even a single string
 * constant, drags the whole engine back into the main bundle and every player
 * downloads a second copy of the simulation they are not running.
 *
 * So the envelope lives here, where both sides can have it for nothing.
 */
import type { ClientMessage, ServerMessage } from '../../shared/types.js';

/**
 * The host's own seat at their own engine.
 *
 * A constant rather than anything drawn, for the same reason `offline.ts`'s is:
 * there is exactly one page attached to that worker and it is the one that
 * created it. Peer ids come from Trystero and are long random strings, so this
 * cannot collide with one.
 */
export const HOST_SELF = 'host-player';

/** Page to worker. */
export type HostIn =
  | { kind: 'start'; build: string }
  | { kind: 'join'; id: string }
  | { kind: 'msg'; id: string; msg: ClientMessage }
  | { kind: 'leave'; id: string };

/**
 * Worker to page — always addressed to exactly one connection.
 *
 * There is nothing to broadcast: `engine.ts` already produces per-connection
 * messages, because fog is per-viewer, so every snapshot has one addressee by
 * construction.
 */
export interface HostOut {
  to: string;
  msg: ServerMessage;
}

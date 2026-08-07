# Zombie Simulator — project brief

Top-down 2D multiplayer web game. 5 human officers vs 1 zombie master, with
hundreds of civilian and zombie NPCs. Server-authoritative.

## Stack & layout

- **TypeScript throughout.** No game engine, no UI framework.
- `server/` — Node + `ws`, fixed 30Hz tick loop. Owns all game state.
- `client/` — Vite + raw Canvas 2D. Renders snapshots, sends input only.
- `shared/` — types, constants, item registry. Imported by both sides.
- **No root `package.json`.** Install and run in `server/` and `client/` separately.

## Commands

```
cd server && npm install && npm run dev     # ws://localhost:8080  (tsx watch)
cd client && npm install && npm run dev     # http://localhost:5173 (vite)
```

Or double-click `Launch Zombie Game.bat` — starts both and opens the browser.

**Always typecheck both after a change** (there is no test suite):
```
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Node is at `C:\Program Files\nodejs` and may not be on PATH in a fresh shell.

## Architecture

Client sends intent (`input`, `ability`, `selectSlot`); server simulates and
broadcasts. Nothing about position or combat is trusted from the client.

Tick order in `server/src/index.ts`: rebuild nav grid if `navDirty` → rebuild
entity grid → compute frozen (grappled) set → move players → `updateAi` →
resolve collisions → rebuild grid → interactions → shooting → air support →
per-viewer serialise.

Server modules and what each owns:
- `world.ts` — World state container, entity/AI state, collision, spawning, `toWire`
- `ai.ts` — all NPC behaviour (humans, zombies, NPC officers)
- `mapgen.ts` — procedural city; returns walls, windows, bushes, buildings, doors.
  Also guarantees every indoor space can be reached from the street. Ground is
  claimed in order — park, corner complex, big buildings, edge buildings, then
  ordinary blocks yield to all of it — so anything that must get its spot goes
  early
- `navgrid.ts` — 14px A\* grid, connected components (`isReachable`), string pulling
- `danger.ts` — coarse geodesic distance-to-nearest-zombie field
- `doors.ts` — door state, geometry, open/shut/lock/damage, wire serialisation
- `doorplayer.ts` — the player's press-and-hold of E at a door, and its prompt
- `combat.ts` — hitscan, weapons, window damage
- `inventory.ts` — loot spawning, slots, pickup/drop
- `heli.ts` — smoke grenade → helicopter → dropped soldiers
- `spatial.ts` / `geometry.ts` — uniform grid broadphase, math primitives

### Civilian traits

Each civilian rolls a fixed personality in `newAiState`, and most odd-looking
crowd behaviour traces back to one of these rather than to a bug:

`settleTrait` where they eventually hole up · `shelterSeeker` runs for a
building on sight · `shelterFar` picks one blocks away instead of the nearest ·
`bushHider` dives for cover · `fleeStyle: 'bolt'` runs blindly, walls and all ·
`staysIndoors` sits tight when the zombie is outside · `homeBuilding` lives
here and won't wander out · `witness` reacts to someone else running ·
`panicScale` how long they stay rattled · `refugeBias` where in the candidate
list they reach, so crowds fan out instead of funnelling into one doorway.

`sawZombie` latches once someone has seen one, and gates the things only a
naive person does — chasing after a running neighbour to find out why.

Door traits sit alongside them: `closesDoors` shuts it behind them when merely
wandering · `locksDoors` shuts *and* bolts it when getting away from something ·
`begsAtDoors` hammers on a locked one rather than going elsewhere · `begHolds`
stays there even with a zombie on them · `opensForStrangers` would let a
stranger in, which most people would not.

### Doors

Hung in every way into a building and in `INTERIOR_DOOR_SHARE` of the openings
between rooms; half start open. Shut doors are solid to movement, sight and
gunfire, and carry 1000 HP.

**Doors are deliberately not in the nav grid.** Routes are planned as though
every door were open, and whoever is walking deals with the door when they
reach it. That is what makes finding one locked a discovery rather than
something the pathfinder quietly steers around — and it keeps opening a door
off the "rebuild the grid" path, which flipping cells 30 times a second would
otherwise demand.

## Performance rules (these matter — 400+ entities)

- **Everything expensive is budgeted or cached.** A\* is capped at
  `PATH_BUDGET_PER_TICK` (10) searches; AI perception runs at 10Hz staggered per
  entity, not per tick; bush scanning and refuge choice are cached per entity.
- **The danger field is the scaling primitive.** One BFS from all zombies at 6Hz
  serves every human in O(1). Prefer adding to it over per-entity searches.
- Current cost: **~2.4ms median / 3.2ms p95 per 33.3ms tick at 411 entities.**
  A headless harness driving only `updateAi` + collision measures ~1.0ms median
  / 2.3ms p95 — not comparable to the figure above, which includes fog and
  per-viewer serialisation.
- `generateMap` costs ~7ms, once per round. The connectivity repair pass builds
  a nav grid per iteration, so keep its iteration cap low.
- Client shows fps / tick ms / fog ms top-right. Watch it after AI changes.

## Key decisions worth not re-litigating

- **Nav grid, not nav mesh.** Geometry is axis-aligned rects and windows break at
  runtime; flipping grid cells is trivial, retriangulating a mesh is not.
- **Intact glass is solid to the nav layer**, and to `hasWallClearPath`. It is
  see-through, not walk-through, and leaving it out of the grid drew routes
  straight through panes that collision then stopped people against — they
  pressed into the glass until something ate them. `damageWindow` sets
  `world.navDirty`; the tick loop rebuilds nav + danger once, not once per pane.
- **Fleeing is goal-directed**, not direction-steered — humans pick a reachable
  destination and path to it. Direction-only steering walked them into walls.
  This applies to `retreat` as well as `flee`: retreat runs for many seconds, so
  a raw bearing away from the threat parks them on the first wall behind them.
- **Anything that notices it is getting nowhere** (`unstickTick`) picks its way
  out from directions that are actually walkable — `nav.lineClear`, not just "the
  far end of the probe is empty", which called a direction clear whenever the
  ground beyond a wall happened to be open.
- **Buildings carry real footprints (`rects`), not bounding boxes.** ~1 in 3 are
  L/T shaped; bbox tests wrongly report the outdoor notch as indoors. Anything
  aiming at a building aims at an `interiorPointOf` it, never its bbox centre.
- **Doors are stored** (`map.doors`) so NPCs reason about actual exits.
- **Every indoor space is reachable from the street, by construction and then by
  check.** Rooms are a grid joined by a spanning tree of doorways; a partition
  laid as one long wall with a single gap in it seals off whole corners. On top
  of that, `repairEnclosures` walks the finished map and cuts a doorway into
  anything still stranded — it covers a block clamped flush to the perimeter
  with its one door opening into it, a door onto a pocket too narrow to walk,
  and a door on an L-notch leading nowhere. **Fix new cases there, not by
  special-casing the generator.** It never cuts the perimeter wall.
- **Shutting a door is what draws attention to it**, and the zombies who saw it
  happen are worked out *before* the door shuts — line of sight to a door is
  blocked by that very door the moment it closes, so checking afterwards alerts
  nobody and the doors become an impenetrable fortress.
- **Going through a doorway is what makes someone shut it**, not having been
  the one who opened it. Tie it to opening and every door ends up standing open
  within a couple of minutes, because passers-by never close anything.
- **Only open a door you are walking into.** Proximity plus facing means people
  open every door they stroll past along a wall and then never go through to
  shut it. The test is whether the next step intersects the slab.
- **Which side of a door someone is on is a face test, not "are they indoors".**
  Both sides of a door between two rooms are indoors.
- **Couples have one leader and one follower.** The follower doesn't steer at
  all — it holds a position at the leader's shoulder, so the pair moves as one
  thing. Don't give both halves their own flee logic and a mutual attraction:
  two independent steerers converging on each other is how you get a pair that
  circles instead of escaping.
- **Letting go of a hand is rolled once per moment that would test it**, never
  per tick — a 6% chance re-rolled 30 times a second is a certainty. Same shape
  of bug applies to any "rare" reaction evaluated inside the tick loop.
- **NPC speeds are all scaled together.** Human/zombie ratios are deliberate —
  change the scale factor, never one speed alone, or chases break.
- **Fog is server-enforced**: unseen entities are never sent. Client fog is
  cosmetic (visibility polygon, cached ~12Hz, blurred half-res mask).

## TESTING FLAGS CURRENTLY ON — turn off for real play

In `shared/constants.ts`:
- `TEST_DROP_ALL_ITEMS = true` — one of every item spawns around player one
- `PLAYER_ONE_SPAWN_AT_CENTER = true` — player one spawns mid-map, not on the outbreak
- `PLAYER_ONE_SHOT_KILL = false` — already off; set true to one-shot zombies

## Known open issue

**Fog dead spot.** At specific map positions the fog stops occluding entirely;
moving off the spot restores it. Not reproduced in 249 sampled positions — the
polygon and mask are correct everywhere testable. A watchdog in
`client/src/main.ts` logs `[fog] no occlusion at X,Y — … seed N` to the console
when it happens. **If the user reports it, ask for that console line** — the seed
plus coordinates make it reproducible offline.

## Not built yet

- Zombie master (the playable zombie) — `zombieMaster` type exists, unused
- Kevlar and riot shield are collected and shown on the HUD but have **no effect**
- Tracker dart marks targets (`world.trackedTargets`) but nothing consumes it
- Victory condition fires but has only been observed once, via a bot

## How the user likes to work

- **Verify behaviour from a spectator socket**, not a player one — a player
  connection is fog-limited and gives misleading counts. Note that `spectate`
  restarts the round, so to observe a live game use two sockets (one player, one
  spectator) or read the global counters in the state message.
- **He usually has a server already running on 8080.** Don't kill it and don't
  send it `spectate` — that resets the round he's playing. To check crowd
  behaviour, drive the world headlessly instead: import `createWorld` and run
  the tick order above in a loop under `npx tsx`. No socket, no port, no
  disturbance, and it can measure things a spectator can't (who is pressed
  against a wall, how far the infected have spread, per-tick cost).
- Prefers being told plainly what was verified vs assumed, and what was left out.
- Prefers playtesting himself over long automated verification runs.

## Git

Remote: `https://github.com/Corvick/Corvicks-Covid-Contingency.git` (branch `main`).
`git pull` before starting, `git add -A && git commit && git push` when done —
he works across two machines.

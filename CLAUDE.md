# Zombie Simulator — project brief

Top-down 2D multiplayer web game. 5 human officers vs 1 zombie master, with
hundreds of civilian and zombie NPCs. Server-authoritative.

## Stack & layout

- **TypeScript throughout.** No game engine, no UI framework.
- `server/` — Node + `ws`, fixed 30Hz tick loop. Owns all game state.
- `client/` — Vite + raw Canvas 2D. Renders snapshots, sends input only.
- `shared/` — types, constants, item registry. Imported by both sides.
- **No root `package.json`.** Install and run in `server/` and `client/` separately.
- **`shared/package.json` exists for one reason: `{ "type": "module" }`.** It has
  no dependencies and nothing is ever installed in it. With no root package.json
  and none in `shared/`, node walks all the way up, finds nothing, and treats
  `shared/*.ts` as **CommonJS** — where an exported binding is a *snapshot taken
  at import time*, not a live view. That is invisible while every export is a
  `const` and fatal the moment one is not: see **The city is not one size**.

## Commands

```
cd server && npm install && npm run dev     # ws://localhost:8080  (tsx watch)
cd client && npm install && npm run dev     # http://localhost:5173 (vite)
```

Or double-click `Launch Zombie Game.bat` — starts both and opens the browser.

To play with people **over the internet**, double-click `Host Online.bat`
instead. It builds the client and serves it off the game server, so the whole
game is one port — see **Playing over the internet** below.

**Always typecheck both after a change** (there is no test suite):
```
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Node lives somewhere different on each of the two machines, and may not be on
PATH in a fresh shell either way:

- Home: `C:\Program Files\nodejs`, a normal installer build.
- Work: `%LOCALAPPDATA%\node-portable\node-v*-win-x64`, a portable unzip. That
  box has **no admin rights**, so MSI/winget installs fail at the UAC prompt —
  reach for a portable build there rather than trying to install anything.

`Launch Zombie Game.bat` checks both, so prefer it over invoking npm directly
when a shell can't find node.

## Architecture

Client sends intent (`input`, `ability`, `selectSlot`); server simulates and
broadcasts. Nothing about position or combat is trusted from the client.

Tick order in `server/src/index.ts`: rebuild nav grid if `navDirty` → rebuild
entity grid → compute frozen (grappled) set → move players → `updateAi` →
resolve collisions → push bodies out of sandbags → rebuild grid → work the
emplacements → interactions → shooting → air support → radio backup → ducks → fires →
per-viewer serialise. The whole block is skipped while `world.paused`, but
snapshots still go out.

Server modules and what each owns:
- `world.ts` — World state container, entity/AI state, collision, spawning, `toWire`
- `ai.ts` — all NPC behaviour (humans, zombies, NPC officers)
- `mapgen.ts` — procedural city; returns walls, windows, bushes, buildings, doors.
  Also guarantees every indoor space can be reached from the street. Ground is
  claimed in order — park, corner complex, big buildings, edge buildings, then
  ordinary blocks yield to all of it — so anything that must get its spot goes
  early. `MapData.cornerBuilding` names the complex outright rather than
  leaving anybody to assume it is `buildings[0]`
- `navgrid.ts` — 14px A\* grid, connected components (`isReachable`), string pulling
- `rooms.ts` — which room every indoor spot is in, the way out of each, and who
  is in it. Static for the round; occupancy is recounted once a tick
- `rumour.ts` — where zombies have been *seen*, decaying. What the crowd knows,
  as against what `danger.ts` knows, which is everything
- `danger.ts` — coarse geodesic distance-to-nearest-zombie field
- `doors.ts` — door state, geometry, open/shut/lock/damage, wire serialisation
- `doorplayer.ts` — the player's press-and-hold of E at a door, and its prompt
- `combat.ts` — hitscan, weapons, window damage; `fireHeld` is the one
  trigger both players and bots pull
- `dog.ts` — the playable zombie dog: its neck, its legs, its jaws, and what
  shaking does to whoever is in them
- `lobby.ts` — the rooms people wait in: create/join/sit/chat, and the four
  letter code that is the only way into one. Nobody has an entity until their
  lobby starts a round
- `serve.ts` — serves the built client off the game server, so the game is one
  port. Dependency-free on purpose; `ws` is still the only thing this server
  needs
- `emplacement.ts` — the pocket gunner: its crew, its sandbags, its arc
- `fire.ts` — the flamethrower stream, burning ground, and who is alight
- `acid.ts` — what the dog spits: a gobbet in the air, the cloud it leaves, and
  who cannot see out of it. Imports only *types* from `world.ts`, so a cloud can
  be read by `hasLineOfSight` and `speedAt` without a cycle
- `inventory.ts` — loot spawning, slots, pickup/drop
- `heli.ts` — thrown/launched charges, smoke → helicopter → soldiers, blasts
- `backup.ts` — the radio's answer: a van or a car in off the map, and its crew
- `mines.ts` — zap mines on the ground, and who they have dropped
- `ducks.ts` — the flock on the pond
- `spatial.ts` / `geometry.ts` — uniform grid broadphase, math primitives
- `shared/pond.ts` — the pond's radius-per-bearing, read by nav, collision and
  the client's drawing alike

### The front end

`client/src/menu.ts` owns the whole shell — title, gamertag, offline, create and
join — and knows nothing about the game. It holds **no lobby state either**:
the server owns the lobby and pushes the whole thing back on every change, so
the client draws whatever arrived and forwards clicks.

The socket is live behind it, but `started` in `main.ts` gates both the input
loop and `render`, so keys pressed at the menu don't drive an officer standing
in a city nobody is looking at. `?spectate` skips the shell entirely.

**Escape depends on who else is in the round.** Offline it raises the pause
panel — Resume / Restart / Quit — and `world.paused` freezes the simulation
while snapshots keep going out, so the frozen scene stays on screen behind it.
Online it quits outright, because there is nothing there to pause that isn't
also somebody else's game. Both endings go back to the front end either way; a
new round is a new lobby. Restart clears `lobby.running` first, since
`startLobby` refuses while a round is up — which is exactly what it replaces.

A lobby slot is `closed | open | bot | player`. Online a fresh lobby opens with
every seat **open** — which is the same resting state `vacate` puts one back to
when somebody stands up, and `emptySeats` used to disagree with it by starting
everything `closed`. That mattered little while the host arranged the room
before telling anyone; it matters now the code *is* the invitation, because a
friend who has been sent one and arrives to a room with nowhere to sit has to
wait for the host to notice. Offline still starts shut — there is nobody it
could be open to. Clicking a **row** seats you in
it (leaving `open` behind you, and taking a bot's place if it had one);
clicking its **tag** cycles closed/open/bot. Two controls, because one click
can't both move you and cycle the thing you're moving into. Clicking the row
you are *already* in benches you. `START GAME` sends nothing but the command —
the server owns the layout, counts `bot` officer slots into
`world.botOfficerCount`, and `populate` reads it. The gamertag lives in
`localStorage`, prefilled and pre-selected.

**The OPTIONS box beside the bench is the host's, and its one control is the
population slider** — see **The city is not one size**. Everybody in the room
sees the number and the size it implies; only the host's slider moves, and it
disables itself for anyone else rather than being clicked and refused. It is
sent live as it is dragged, the way a seat pushes on every click, with one
exception to the "the client holds no lobby state" rule: **while the slider is
being held, it is the authority on its own position.** The server pushes the
whole lobby back on every change and `renderLobby` writes what arrived into the
controls, which for a slider mid-drag means the value being *left* is written
back over the value being moved to, one round trip behind the mouse — the thumb
sticks and fights the drag. `draggingPop` is that, and it only ever suppresses
the position; the text beside it still updates from whatever arrives.

**Spectating is a lobby state, not a URL.** A spectator holds no seat and gets
no entity; `startLobby` puts them into `world.spectators` *after* `resetWorld`,
which clears it. Start refuses only when there'd be no officers at all — a
round of nothing but bots is the whole point of watching one. `?spectate` still
exists for headless work and bypasses the front end entirely.

**A spectator can command the grey officers, RTS-style.** Box-drag to select,
right-click to send them somewhere, `H` to hold where they stand, `R` to hand
them back to their own AI. Selected officers wear a green ring.

- **All of it is client-side except the `command` message.** `selectedOfficers`,
  the marquee, the rings and the order pulse never leave the browser. The one
  wire message carries the officer ids, a world point, and `stop`/`release`.
  It is an *order*, not anything about visibility — a spectator already sees the
  whole board.
- **`AiState.commandX`/`commandY`**, and the branch that reads them sits in
  `updateNpcOfficer` **below the fight and above escort/guard/patrol**: a
  commanded officer still defends itself and engages what it passes — an
  attack-move, for free — but the order overrides everything calmer. On arrival
  (`COMMAND_ARRIVE_DIST`) it holds and scans the street like a guard. Sticky:
  no expiry, an order holds until replaced.
- **A move order keeps the group's shape rather than piling it on one pixel.**
  Handed the identical destination, five officers walk at the same point and
  collision shoves them into a blob — which is the SC2 clustering nobody wants.
  `commandOfficers` takes the centroid, keeps each officer's offset from it, and
  scales the whole formation down: three picked from the top-right, the middle
  and the centre-left arrive still arranged that way, only closer together.
  - **Server-side, so the wire message is still one point.** The positions here
    are the authoritative ones; the client's are interpolated and would put the
    slots where the bodies are *drawn* rather than where they are.
  - **How big and what is legal are two jobs, and one number cannot do both** —
    see **A wide selection arrives as a group, not as a street** below, which is
    what replaced `scale = clamp(cap / spread, minGap / closest, 1)`. The scale
    is now the cap alone, ceilinged at 1 — which is what makes "already close
    together" mean *leave it exactly as it is* — and `separateSlots` pushes
    apart anything that landed too near afterwards.
  - **The cap grows as `sqrt(n)`** (`COMMAND_FORMATION_SPREAD`), the same
    `sqrt(area / count)` reasoning the garrison's spread uses — one flat figure
    is loose for three officers and impossible for ten.
  - **Every slot goes through `walkableNear`**, extracted out of the dog roar's
    `roarTarget` into `world.ts` and shared, so a slot landing in a wall is
    nudged rather than walked at.
  - Measured: bearings from the group's centre held to **2.0°**, centroid
    **0.0px** off the click, a group already 43px across comes out 43px across,
    and a single officer lands exactly on the click — its offset is zero, so
    nothing about that case ever changed.
- **Two officers stand `OFFICER_SPACING_PAD` further apart than their circles
  demand**, so a group that has arrived reads as several people rather than one
  mass. Officer-to-officer only. **The broadphase query had to widen with it** —
  `a.radius * 2 + 8` was exactly the new `minDist`, so the pairs the padding
  exists to separate would have sat on the boundary and been offered by luck.
  Measured: two walked together settle at **36.0px** where they used to touch at
  28.

#### A wide selection arrives as a group, not as a street

Reported as *"the final formation needs to be much smaller when selecting grey
officers over a large area and telling them to move to a location"*, and there
were two faults under it — one obvious and one that had been quietly switching
the whole feature off.

**The scale is uniform, so one number was doing two unrelated jobs**: keep the
formation small, and keep the closest pair far enough apart to stand. It was
`clamp(cap / spread, minGap / closest, 1)`, and the floor is the half that goes
wrong.

- **Two officers who have already arrived somewhere together settle at exactly
  `minGap`** — this file measures them at 36.0px. So `minGap / closest` is
  **1**, the floor is 1, and the scale is 1: *nothing is compressed at all*. One
  pair standing together anywhere in the selection was enough. Measured, twelve
  officers with one such pair among them: **1060.7px across**, which is the
  selection arriving exactly as wide as it was picked.
- **And it cannot even do the job it was there for.** Handed a clump already
  *tighter* than `minGap`, the floor computes above 1, clamps to 1, and again
  disables the scaling — so nine officers in a huddle with one straggler a
  thousand pixels off arrived at **1260px radius with the huddle still 17.8px
  apart**. The rule was conservative in exactly the cases it was not needed and
  absent in the one it was.
- **`separateSlots` is the replacement**, and separating the two jobs is the
  whole idea: the cap decides how big, a relaxation decides what is legal, and
  neither has to be conservative on the other's behalf. A handful of passes,
  each pushing an overlapping pair half apart, then a **rigid re-centre** on the
  click — rigid, so it cannot undo any of the separation, and it is what keeps
  the centroid exactly where the order was given.
  - Two slots exactly on top of each other have no direction to push along, so
    one is invented **off the pair's indices rather than at random**: an order
    given twice from the same selection has to produce the same formation, or
    the group visibly reshuffles on a double right-click.
  - It is a relaxation and not a solve. The input is already roughly the right
    size so only a few pairs are ever over, and a pass that cannot quite finish
    leaves a slot a little tight rather than in somebody's lap — which collision
    sorts out on arrival, as it did for the whole formation before any of this
    existed. At most 64 bodies, once per order.
- **`COMMAND_FORMATION_SPREAD` went 45 → 22**, which is the obvious half. `minGap
  / 2` is 18, so `18 * sqrt(n)` is about the tightest `n` officers can stand in
  at all; 45 was two and a half times that. It is 1.2 of it now, which leaves
  the shape readable without the group arriving as a smear.

`server/formationcheck.ts` is the harness — headless, no socket, no port, and
it drives the real `handle` because the spectator gate is part of what is being
measured. `setLooseFormation` is the gate and it is kept. Staged on a
phyllotaxis spiral rather than at random, so both modes see identical input and
the figures do not move between runs of the same code:

| n | old radius / across | new radius / across | packing radius | new closest pair |
|---|---|---|---|---|
| 3 | 77.9 / 146.5 | **38.1 / 71.6** | 31.2 | 45.8 |
| 6 | 110.2 / 202.9 | **53.9 / 99.2** | 44.1 | 36.8 |
| 12 | 155.9 / 290.3 | **76.2 / 141.9** | 62.4 | 36.0 |
| 20 | 201.2 / 384.5 | **98.4 / 188.0** | 80.5 | 36.0 |

**The result no longer depends on how wide the selection was** — 900px and
1800px scatters give the identical figures, which is the ask stated as a
property. Plus the two faults above: a wide selection containing one arm's-length
pair goes **1060.7 → 146.8px across**, and the clump-and-straggler **1260 → 69.6px
radius with its closest pair going 17.8 → 36.0**. Bearings from the group's
centre are held to 2.0°, the centroid lands 0.0px off the click, no pair is under
36px anywhere, and nothing is squeezed below the packing bound.

#### And a command card to build with

Selecting grey officers raises an SC2-shaped card bottom-right —
`drawCommandCard`, with `commandCardSlots` as its geometry. Five columns by
three rows, mostly empty: a **shovel** bottom-left opens a build page whose
**sandbag** is top-left and whose **back arrow** is bottom-right.

- **`commandCardSlots` is the geometry and `drawCommandCard` is the paint**, the
  same split `minimapFrame` / `drawMinimap` uses and for the same reason: a
  button you can see and cannot press is what two copies of that arithmetic
  produces.
- **Every slot is drawn, filled or not.** A card that grew a box at a time would
  move the buttons already on it — the same argument as the dog's empty fourth
  hexagon, and now the second feature to lean on it.
- **The card owns its own rectangle.** The hit test runs before the marquee, and
  a press anywhere on the panel is swallowed even where there is no button, or
  dragging off the card box-selects the city behind the UI.
- **The count is read off the wire, not tallied here.** `EntityState.bag` is
  true while a grey officer still has his one sandbag, and the client counts the
  flag across the selection — the server owns whether one has been spent, and a
  client tally would go stale the moment a wall went up, an order was given up
  on, or its owner was eaten. **It is in `ENTITY_FIELDS`**, which has now caught
  five flags.
- **Every grey officer gets exactly one sandbag**, which is what bounds the
  whole feature: a spectator can wall a street, not the city. `hasSandbag`
  defaults **true** on every `AiState` and is only ever read for a grey officer
  — the same trick the door traits use, so nothing has to be told that a
  civilian does not build sandbags.
- **The builder is the nearest officer *in the selection* who still has one
  and is not already out on an errand.**
  The card belongs to the selection, so it is never a stranger across the city
  who gets pulled off a street, and the count means something the player can
  act on. Nobody else in the group is disturbed by the order.
- **The ghost holds only its angle**; its position is the cursor, so there is no
  second copy of the pointer to keep in step. Amber where it fits, red where it
  does not — sampled along the wall's length against `map.walls`, which are
  AABBs, so it is a point-in-rect loop that only runs while a ghost is up. The
  server nudges a bad spot to walkable ground rather than refusing, and a
  silently relocated wall is a worse answer than a red ghost.
- **A wall in hand takes the wheel off the camera.** Checked before the zoom is
  banked, so siting a barricade is aiming *it* rather than aiming it while the
  ground slides underneath — a camera that moved as well would make the rotation
  impossible to judge. There is nothing else the wheel could mean at that
  moment.
- **`drawSandbagWall` is one definition with three callers** — the pocket
  gunner's bags, a built barricade, and the ghost. The ghost's whole job is to
  show exactly what is about to exist, so a second drawing of a sandbag would
  defeat it.
- **A `Barricade` is the gunner's bags with the gun taken away**, and it lives
  in `emplacement.ts` beside them. `zombieAtSandbag`, `resolveEmplacementCollisions`
  and the drawing all handle both, so a zombie tears a wall down with no new AI
  branch — as far as one is concerned there is no difference between the two,
  and there should not be. **In the nav grid's destructible layer, which a
  zombie does not read** — see **A sandbag wall is a thing to walk round unless
  you can eat it** below; it used to be out of the grid altogether, the doors'
  rule. It is deliberately *not* a `nearestProtector`: that is a judgement about
  a machine gun and this has none.
- **One budget for the errand, never extended** (`BARRICADE_GIVE_UP_MS`), the
  shape `HIDE_DEEPER_GIVE_UP_MS` and the beacon carrier both use — and **giving
  up does not spend the sandbag**, so an unreachable spot costs a walk rather
  than the wall. Being knocked off the spot mid-job restarts the stacking rather
  than banking it, like the mast.
- Measured on the harness: assigned to the nearest holder, the wall stands at
  **0px off the spot at the exact angle asked for**, the builder's sandbag is
  spent and the other two keep theirs; with none left the order is refused; a
  non-spectator socket is ignored; giving up keeps the sandbag; and a zombie
  held against one takes it from 900hp to 696 in seven seconds.
- **Built like the guard branch, deliberately not the beacon carrier.**
  `unstickTick` wants 38px/s to call a body un-stuck and a walking officer makes
  40 (`HUMAN_WALK_SPEED * 1.15`), so it fires the instant one turns a corner and
  walks it off on a blind breakout heading — the trap this file records for
  anything that walks. `headingToward` already routes around walls with A*.
  Measured: a commanded officer closes ~36px/s on an open target and reaches
  within `COMMAND_ARRIVE_DIST`, then holds dead steady; a target clicked inside
  geometry, it gets as close as it can and holds there.
- **Grey means grey.** `type: 'officer'` with an `AiState` and not in
  `world.bots` / `world.soldiers` / `world.swat` — the ambient garrison plus
  the grey radio-dispatched crews. The client's predicate is the wire flags:
  `npc && !bot && !soldier && !swat`. Commanding a dispatched crew just pulls it
  off its sweep, which is the spectator's call.
- **Only from a spectating socket**, checked server-side (`world.spectators.has`).
  A player cannot command the garrison. This is one more thing an anonymous
  socket with your tunnel URL could poke at — see the internet-play caveats — but
  it cannot reset the world or touch a real player's unit, and the exposure is
  smaller than "a spectator already sees everything".
- **Keys are the client's** (`H`, `R`, and the card's grid — see below). The
  wire carries the flag, not the keybinding.
- **A spectator gets a drawn cursor now** — `canvas` is `cursor: none` and the
  crosshair used to be inside the `!spectating` HUD block, so a watcher had no
  pointer at all. It is `drawCrosshair`, framed with corner brackets
  (`command`) while officers are selected so it reads as "a click sends them
  here".

#### An order across a threshold is an order to go through the door

Reported as a grey officer right-clicked into a building from the street
standing against the front of it. The pathing was never the fault: routes are
planned as though every door were open — that is the rule doors follow
everywhere — and **`updateNpcOfficer` has never called `doorTick` at all**, so
the city's own officers could not work a handle under any circumstance. An order
across a threshold was an order they had no way to carry out.

- **`openDoorAhead` is the tail of `doorTick` split off**, and it is the only
  half an officer under orders wants. The rest of that function is the
  civilian's — shutting one behind you, bolting it, slamming one on a zombie,
  walking back across a room to see to it — and handing an officer that is the
  same mistake `closesDoors` being cleared on a bot at spawn already avoids:
  every one of them is an officer standing in a doorway instead of getting where
  it was sent. `doorWorkTick` came out with it, so a bolt half drawn is not
  walked away from.
- **Only while an order stands** (`commandX` or `buildX`). An ambient garrison
  officer has nowhere it needs through, and giving the whole city's officers a
  new appetite for doors is a far larger change than the one asked for.
- **Below the fight**, like every other standing order here: a door is a job,
  and a zombie at your shoulder is not something you finish a job through.
- **`underOrders` now covers a spectator's order**, which is what stops the
  officer shutting the door behind itself on the way in — the same reasoning
  already written there for a crowd shouted into a building.
- **Two tests read `e.type === 'officer'` where they read `world.bots`.**
  Opening is instant, and a lock is worked from whichever side it is on. Both
  were already the rule for an officer, and both said "bot" because a bot was
  the only officer that had ever reached them.
- Measured on the harness over six cities, both behaviours on the same city and
  the same door: **opened 0/6 → 6/6, got inside 0/6 → 6/6**, median 2.8s. The
  old behaviour's closest approach to the spot is **65px** — about the width of
  a wall, which is the report stated as a number. A door **bolted** as well is
  drawn back and gone through 6/6.

#### A wall you have ordered stays on the screen until it is built

Three faults in one report: *"the ghost of sandbag should stay in place as long
as an officer is trying to place it, and allow multiple to be built right now.
Clicking the icon just makes you build a brand new one and removes the old
command."*

- **A sandbag is only spent when the wall goes up**, so the man already walking
  to a spot still read as a holder — and being also the nearest, he was picked
  again and the second order silently replaced his first. A run of clicks could
  only ever produce one wall. `commandOfficers` skips anybody with a `buildX`
  now, and **refuses rather than reassigns** when everybody who has a bag is
  already out: taking a wall off one spot to put it on another is a worse answer
  than the order not landing, and the card's count says so before the click.
- **`BuildSiteState` on the wire is the ghost.** Between the click and the wall
  there was nothing on screen at all — the ghost cleared with the mouse button
  and the only way to know an order had landed was to wait and see whether a
  wall appeared. It is counted off `AiState` rather than kept as a list, for the
  reason every tally here is: an errand ends four ways — built, given up on, its
  owner turned, its owner eaten — and a list somebody has to strike from is a
  list that holds a ghost over an empty street for the rest of the round.
  **Spectators only**, and built by the first viewer who is actually watching,
  so a round nobody watches never walks the AI map for it.
- **Three treatments, one `drawSandbagWall`.** Faint and dashed while he walks,
  filled in and steady once he has arrived and is stacking (`buildAt`, which is
  exactly that line), solid once it is a wall. The ghost's whole job is to show
  what is about to exist, so a second drawing of a sandbag would defeat it — the
  same argument the in-hand ghost already rests on.
- **`selectedSandbags` subtracts the men on errands**, off the same wire, so the
  button cannot be lit with an order behind it that the server will refuse.
- **Shift-click keeps the wall in hand**, the way an RTS queues a row of
  buildings. It runs dry on its own: the count is read against the wire, which
  is a tick behind, so holding shift with one left over puts the ghost down.
- **Pressing the icon with a wall already in hand keeps the bearing** you
  dialled in on the wheel. It is "another one of these", not "start again".
- **The in-hand ghost is not drawn while the cursor is over the card**, and the
  pointer comes back in its place: the ghost *is* the cursor, and a wall sitting
  out in a street under a panel is a wall a click there would not build.

#### And the pointer is a pointer

- **`SPECTATE_CURSOR_SCALE` (0.6).** The gunsight is sized for laying a weapon
  on a body, and a spectator is not aiming at anything. Measured off the canvas,
  the mark spans **42 layout pixels against a 46px card slot** at full size — it
  very nearly covered whichever button it was over — and **26px** at 0.6.
- **The stroke widths are deliberately not scaled.** A mark at two thirds the
  size with two thirds the stroke is a *fainter* mark rather than a smaller one,
  and the whole of what makes this legible on a white wall is that it is stroked
  twice.
- **It is drawn over the card**, which it was not. `canvas` is `cursor: none`,
  so hiding it there left a watcher with no pointer at all over the one part of
  the screen that is made of buttons — which is the exact fault `drawCrosshair`
  was added to the spectator view to fix in the first place. The card's hover
  highlight is a second reading of the same thing, not a replacement for it.

`server/rtscheck.ts` is the harness for the two server halves — headless, no
socket, no port. `setOfficersIgnoreDoors` is the gate and it is **kept**: the
control is the whole value of the run. Put the sandbag bug back as well and it
is **7 checks FAILED against 0**, with the console showing all three orders
landing on `grey-0` and two walls out of three.

*One thing about staging the sandbag half was the rig lying rather than the code
failing.* Spread the three spots out one per officer and the nearest holder to
each is a different man anyway — so the **bug passes the check outright**. They
have to be clustered, which is the report itself: a spectator clicking a few
spots along one stretch of street.

`client/rtsrig.html` is the client half, and it lives under `client/src` so
unlike the harnesses at `server/` root it is covered by `npx tsc --noEmit`. rAF
is throttled to nothing while the browser pane is not compositing, so no frame
of a real round can be put on screen from here; `getImageData` needs none, and
`spectatorPan` was split out pure for the half that is not a drawing at all. It
reports the pointer's span against the slot; that a ghost puts ink inside its
own footprint and **0px outside it**, with the walking, stacking and built
treatments reading as three different things; that **3 of 3 buttons show their
grid key and 0 of 27 empty slots do**, with the grid in reading order; and the
camera's arrows, ramp and the two cases that switch the edge off.

*Its letter probe was the rig lying before it was ever the code, twice over.*
"Ink in the slot" is answered by the icon alone, so the reading has to be the
slot's own bottom-left corner — and "ink" cannot mean *unlike the road*, because
the card paints a panel and every slot a fill over it, so an empty slot is
already 34/255 off the road before anything is drawn in it. Measured that way it
reported **27 empty slots are lettered**. What is actually being looked for is
an amber glyph.

#### The card has grid hotkeys, and they are what took the camera off WASD

QWERT / ASDFG / ZXCVB lies over the five columns and three rows exactly as they
are drawn. **The keyboard's own layout is the card's layout**, which is the whole
idea of a grid binding: you learn one shape and every page of every card obeys
it, rather than learning a letter per button.

- **The letter is printed in the slot**, bottom-left. A binding you have to be
  told about separately is one nobody uses, and the letter's *position on the
  card* is the mnemonic — so seeing it in place is most of how the grid is
  learned. The label strip names the key too, beside what the button does.
- **`pressCardButton` is one function with two callers.** A button can be
  reached by mouse and by key now, and a second copy of what it does is how the
  two drift into a shovel that opens the build page when clicked and does
  nothing when typed.
- **A key with no enabled button under it falls through**, which is what leaves
  `R` free to hand a selection back today: its slot is empty on both pages. The
  day something is put there the card takes the key, which is the right way
  round — the card is the thing with a button on it.
- **It cost the spectator's WASD camera**, and that is not a side effect but the
  reason the camera moved. W, A, S and D are four of these fifteen, and a
  watcher pressing S to look further down the street would be pressing the
  second button of the bottom row.

#### So the camera is on the arrows, and on the edge of the screen

- **`input.arrows` is tracked separately from `input.state`.** A player still
  drives a body with WASD, which is `state`; only the spectator camera reads
  `arrows`. One flag rather than a mode, so nothing has to ask which it is.
- **Edge scrolling is `EDGE_SCROLL_BAND` (48px) deep and ramped**, from
  `EDGE_SCROLL_MIN` at the inner lip to a full key's worth hard against the
  edge. Flat was the alternative and is worse: the band has to be wide enough to
  hit without aiming, and a wide band at full speed lurches the camera away the
  moment you reach for anything near the edge of the screen.
- **Only while the pointer is over the canvas**, which `input.pointerOver` is
  for and which the feature cannot be written without. `mousemove` is bound to
  the canvas, so a pointer that leaves the window leaves its last position
  frozen — and having left by an edge, that position is *inside the band*. The
  camera would slide for as long as you were away and you would come back to a
  view nobody asked for. `blur` clears it too, for alt-tab.
- **And never over the command card**, which sits in the bottom-right corner and
  so lies across both the right and bottom bands. Reaching for a button must not
  send the city sliding out from under the officers you are about to give an
  order to. The card already owns its own rectangle for clicks; this is the same
  rule for a pointer resting on it.
- **The vector is clamped to one, not normalised to one**, and the difference is
  the whole ramp. A held key contributes a whole unit, and dividing by the
  length is what keeps a two-key diagonal the same speed as a straight line — an
  edge push contributes a *fraction*, and dividing that by its own length scales
  it straight back up to full speed. So it is only shortened when it is longer
  than one.
- **`spectatorPan` is pure and exported so it can be measured.** rAF is
  throttled to nothing while the browser pane is not compositing, so the camera
  cannot be driven and watched from here at all — a live spectator round read
  `0 fps` with a 10-second frame gap. This is the same split as
  `commandCardSlots` against `drawCommandCard`.

#### A wall order is not thrown away by a stray right-click

Reported as *"when placing sand bags have it so one right click does not
override the placing of the sandbag command for the grey officer, only a double
right click will have them change their orders."*

- **A plain move goes round the builders.** Siting a barricade is a walk of
  several seconds, and a single right-click anywhere on the map threw that
  errand away with nothing said: the ghost went out, the sandbag was never
  spent, and the only sign was a wall that never appeared.
- **Everybody else moves on that same click**, which is what stops the exemption
  becoming a stuck group. The filter is on the individual, not on the message.
- **Filtered before the centroid, not skipped after it.** The formation is a
  shape made out of the people who are actually going; leave a builder in the
  arithmetic and he pulls the whole group's slots toward a spot he is not
  walking to.
- **`DOUBLE_RIGHT_MS` is 280**, well under the 500ms an operating system calls
  a double-click, because this has to be a thing you meant rather than a thing
  two ordinary orders in a hurry add up to. It is **spent** when it fires, so a
  third quick click is a fresh single — otherwise hammering the button cancels
  every build in the selection one after another.
- **The gesture is the client's and the wire carries what it meant**
  (`override`), the same shape as shift-queueing and the H and R keys.
- **The order pulse goes amber for an override** where a move is green, so
  taking a wall back is visibly a different thing from asking for one.
- **`H` and `R` still call an errand off**, and are left alone: both are
  explicit stand-down orders rather than a click that might have been meant for
  the map.

Measured in `rtscheck.ts`, staged with three men walking to three spots and **a
fourth officer with no errand as the control** — without him, "nothing happened"
is satisfied just as well by the whole order having been dropped. A single
right-click leaves **3 of 3** wall orders exactly where they were and sends no
builder anywhere, while the spare officer moves on that very message; the double
takes all three off, sends them, and **does not spend the sandbags**.

**PLAY OFFLINE is the same lobby with `offline: true`**, which is why it needed
almost no code: no chat, seats cycle closed→bot only, seats start `closed`, and
a vacated seat goes back to `closed` rather than `open`. The one thing it
genuinely needed was `notice` — with no chat box drawn, a refusal from START had
nowhere to be read.

### Four letters are the only way into a lobby

Creating one draws a code; JOIN asks for it. That is the whole of matchmaking,
and it is deliberately the whole of the *access control* as well.

- **The browse list is gone, and its absence is the feature.** `summaries`, the
  `lobbies` message and `lobbyList` were removed outright rather than left
  unused: an endpoint that still listed the lobbies on a server would hand out
  every code on it and quietly turn the code into a formality. Nothing
  enumerates lobbies now, so the client has no way to ask what exists — which is
  what makes "only the people I sent it to" true rather than merely intended.
- **The code is the lobby's identity, not a label on it.** `lobbies` is keyed by
  code and there is no second internal id, because with nothing to list there
  would be no way to ever hold such a handle.
- **No vowels** (`LOBBY_CODE_ALPHABET`). Four letters from the full alphabet
  spell a word often enough to matter, and the once it does is the once it is a
  rude one on a stranger's screen. Twenty letters at four places is 160,000
  codes against a handful live, so a collision is a formality to retry rather
  than a pressure on the length. `randomInt` rather than `Math.random` scaled by
  hand — a guessed code is a stranger in your game.
- **An offline room refuses its own code, and refuses it in the exact words a
  code that never existed gets.** Solo is a promise, and a distinguishable
  refusal would confirm the room is there.
- **A refusal must not move you.** `lobbyError` exists alongside `lobbyLeft` for
  this: mistyping is the ordinary case now, and `lobbyLeft` sends you back a
  screen, so a typo would cost you your place in the flow. The message lands on
  the JOIN screen with the code still in the box and selected.
- **Short and wrong are different refusals**, because they are different things
  to the person typing — a half-finished paste against a code that found
  nothing. Answering both with "no" has them retyping something that was never
  going to work.

Two things bit during this and neither is guessable from the code:

- **`maxlength` on the code box has to be far longer than a code.** The browser
  applies it to a *paste* before any script sees the text, so at `maxlength="4"`
  a pasted `"  bwkg  "` arrives already truncated to `"  bw"` and the handler
  strips it to two letters — a code silently half-eaten, which is exactly what
  copying one out of a chat message looks like. Measured before the fix:
  `"  bwkg  "` → `BW`. It is 32 now and the input handler does the clamping,
  which it was doing anyway. Verified after: `"  bwkg  "`, `"bwkg\n"`,
  `"b-w-k-g"` and `'"BWKG"'` all land as `BWKG`.
- **`navigator.clipboard` does not exist for the people this feature is for.**
  It needs a secure context — HTTPS or localhost — and the guests are the ones
  reaching the dev server at `http://192.168.x.x:5173`. So the `execCommand`
  path in `copyToClipboard` is not a legacy fallback, it is the one that runs
  for everybody but the host, and the scratch textarea it needs must be off
  screen rather than `display:none` (a hidden element cannot be selected).
  Failing even that, COPY reads `CTRL+C` and selects the code on screen, and
  `#lobby-code` carries `user-select: all` so one click takes the lot.

`server/codecheck.ts` is the harness — headless, no socket, no port, so it
leaves a game on 8080 alone. It covers the shape and alphabet of 4000 codes,
that no two live lobbies collide, that every letter gets drawn, six ways of
mistyping or pasting one, and the four refusals.

#### The link carries the code

`?join=MZGD` — the whole invitation as one thing to paste. Four letters is
already short, but it is four letters typed into a box the guest has to be told
how to find; a link is one click out of a chat window. With a gamertag already
remembered it goes **title → lobby, no clicks at all**; without one it stops at
the single field standing in the way and then goes straight in.

- **It is spent on `welcome`, not at page load, and this was a real bug.**
  `net.ts` drops a send on the floor when the socket is still connecting —
  silently, no error and no queue — so the auto-join fired into nothing and the
  guest sat on the JOIN screen with the right code in the box and no idea why
  nothing had happened. `welcome` is the first thing the server says, so it is
  the honest "you may talk now". `takeInvite` needs a code, a name *and* a
  socket, is called from all three becoming true in whatever order they do, and
  the first call that finds all three clears it. **Anything else that wants to
  send at startup has the same trap waiting for it.**
- **COPY INVITE LINK is refused on localhost.** The link is built from
  `location.origin` — the only address known to actually reach this server —
  so a host playing at `http://localhost:8080` would copy a link meaning "your
  own PC" and paste it to four people. A button that hands out a broken link is
  worse than no button, so it disables itself and says which address to open the
  game on instead. `Host Online.bat` therefore opens the LAN address rather than
  localhost, and through a tunnel you open the https URL and the link carries
  that.
- **Two buttons, not one that changes meaning.** The link goes in a chat window;
  the code gets read aloud to somebody already looking at the game. Different
  moments, so both stay.

### The code is now enough, because the game is peer to peer

**The four letters used to be a key into a `Map` inside one server process, and
that is exactly why sending somebody the code did not work.** They launched the
game, their machine started its *own* server, their client connected to their
*own* localhost, and `lobbies.get('MZGD')` on that machine quite correctly found
nothing. The two computers never exchanged a packet. Nothing was broken — the
lobby, the seats, the chat and the code were all real and all working — there
was simply no mechanism by which a guest's machine could learn where the host's
was. **The UI was complete and the transport underneath it was missing.**

Four letters cannot carry an address. Twenty letters at four places is 160,000
codes; an IPv4 address and port is far more than that and a home IP is different
next week. So a joining machine has to *ask* something it already knows how to
reach. The only question is who runs that something, and the answer here is
nobody: **Trystero signals over public infrastructure that is already there for
other reasons** — Nostr relays by default, BitTorrent trackers and MQTT brokers
otherwise. Once two browsers have swapped an offer and an answer through it, the
relay drops out and the connection is direct.

**Almost none of this is new code, and that is the whole reason it was
affordable.** Three things were already true and none was built for this:

- **`engine.ts` has no Node imports at all** — no `ws`, no `http`, no `fs`. Its
  entire API is `connect(id, sendTo)` / `handle(id, msg)` / `disconnect(id)`, and
  it has never cared whether a `sendTo` ends in a socket, a `postMessage` or a
  data channel.
- **`offline.ts` already ran that engine in a browser Web Worker.** That was
  built so a solo round would stop fighting the renderer for cores. It is also,
  unchanged, a complete game server running in a page.
- **`net.ts` already hid the transport** behind a `Connection` interface.

So the host's browser *is* the server, exactly as the Node process was, and
**nothing above `net.ts` found out** — `main.ts`, `menu.ts` and `render.ts` are
untouched by the transport change.

- **`p2phost.ts` is `offline.ts` with its one assumption removed.** That file
  says there is exactly one player and hardcodes a single connection id; this
  one is fed up to six. The only addition is a routing envelope (`p2pwire.ts`)
  saying which connection a message is from or for.
- **`p2pwire.ts` exists for a bundling reason, not a design one.** `p2phost.ts`
  imports the whole engine and is only ever reached through
  `new Worker(new URL(...))`, which Vite splits into its own chunk — but a plain
  `import` of even one string constant from it drags the engine back into the
  main bundle, and every player downloads a second copy of a simulation they are
  not running.
- **The peers are connected from the main thread, not the worker.**
  `RTCPeerConnection` is `[Exposed=Window]` and does not exist in a worker at
  all. So the page owns the connections and the worker owns the simulation, at
  the cost of one extra structured clone each way — the same coin `offline.ts`
  already pays, and still not JSON.
- **It is a star, not a mesh.** Trystero's documented weak spot is rooms where
  every peer connects to every other, which grows as the square. Host-authoritative
  means a guest only ever connects to the host: five connections for six players
  rather than fifteen, and no guest can desync from another because no guest
  simulates anything.
- **`allowWorldReset` is false here where `offline.ts` sets it true**, and the
  reasoning is the one already written beside `EngineConfig`: that flag is about
  who can reach the engine. Offline it is only the page that made the worker.
  Here it is anybody holding the code, and `restart` calls `resetWorld` from any
  connection, in or out of a lobby.
- **The room is opened by the transport, not by the menu**, and it cannot be
  opened any earlier. It is named after the code, and the code is drawn by the
  engine inside `lobbyCreate` — so `goHost` watches for the first `lobby`
  message and opens the room on the code in it. An **offline lobby is skipped
  outright**: it promises nobody can join, and publishing its code to a public
  relay is exactly what `joinLobby` refuses from the other end.

**There is deliberately no "hello" action for the host to announce itself
with.** That was the first design and it had a race: the guest would learn who
the host was and send `lobbyJoin` straight back, possibly before the host's
engine had run `connect` for that peer — at which point the message is addressed
to a connection the engine does not know about and is dropped. **The host is
latched off the first game message instead**, which cannot race, because the
first thing any engine says to a new connection is `welcome` and it only says it
*after* connecting them. The greeting and the proof of readiness are the same
event. No guest can be mistaken for a host either: a guest only ever sends to
`hostId`, and until that line runs it does not have one.

**`connected` is no longer required by `takeInvite`.** It meant "the socket has
said `welcome`, so you may talk", which was honest while joining meant sending
down a socket. Joining needs no socket now, and waiting on one would hang an
invite link forever on any machine not also running a game server — which is
every guest's machine.

**The join takes seconds where a socket took none**, so the button says
`connecting…` and refuses a second click. Finding a peer means reaching a relay,
being noticed, and a full ICE handshake. Silence for that long is
indistinguishable from a dead button, which is a fault this screen has had
before. `JOIN_TIMEOUT_MS` is 8s and a timeout is reported in the same words a
wrong code produces — from the player's side those are the same event, and
telling them apart would ask them to act on a distinction they cannot act on.

Measured with two browser tabs, host and guest, no server process anywhere:
lobby `SZPW` created in the host's page, guest joined **by code alone**, both
seated (`OFFICER 1 HOSTY`, `OFFICER 2 GUESTY`), round started, and the host's
engine reported **`516 entities | 2 clients | 498 survivors`** at **7.4–9.0ms
against the 33.3ms budget**, `serialise+send 0.6–0.7ms`, with survivors falling
as the outbreak spread. The whole city, for two people, in a tab.

**What is not measured, and should not be claimed:**

- **Nothing about rendering.** rAF is throttled to nothing while the browser
  pane is not compositing, so the guest's canvas read back blank — that is the
  documented limitation, not a fault, and it means somebody has to look at a
  real frame.
- **Nothing about NAT.** Two tabs on one machine exercise signalling and the
  data channel and nothing about traversal. Roughly **10–20% of peer pairs
  cannot connect directly** — symmetric NAT, mostly mobile and corporate — and
  fixing that needs a TURN relay, which is bandwidth somebody pays for.
  `BaseRoomConfig` takes `turnConfig` and `rtcConfig` when that day comes.
- **Nothing about more than two.** Five guests has never been run.
- **The relays are somebody else's and they visibly wobble.** Every run logged
  `relay failure from wss://relay.nostr.place/ - pow: insufficient leading-zero
  bits` and a dead `wss://hornetstorage.net/relay`. It worked anyway because
  Trystero uses several — but a bad day on public infrastructure is a day nobody
  can join, and it is not something that can be fixed from here. `joinRoom`
  takes a `relayUrls` list, and the strategy can be swapped for
  `trystero/mqtt` or `trystero/torrent` wholesale.

**The old URL path still exists and still works.** `Host Online.bat`, `serve.ts`
and the whole one-port story are untouched — but CREATE and JOIN no longer go
near the Node server's lobby, so that path is now for spectating, dev, and
LAN-with-a-known-address rather than for getting friends in.

**One weakening worth knowing.** The room topic is derived from the app id and
the code, both of which are in the shipped client, so a public relay could in
principle be scanned for live four-letter rooms — where before, a stranger also
needed your URL. `BaseRoomConfig.password` end-to-end encrypts a room and is the
lever if that ever matters.

### Playing over the internet

The codes say *which room*; they say nothing about *which machine*, and that
second half is what actually stopped people playing together. Three things had
to change and none of them is the lobby.

- **One port, because two cannot be tunnelled sensibly.** In development the
  client is Vite on 5173 and the server is `ws` on 8080, so a guest needs both
  reachable and a URL with `?server=` stapling them together — two forwards or
  two tunnels, and a URL nobody can retype. The `WebSocketServer` now rides an
  `http.Server` that also serves `client/dist` (`serve.ts`), so the address bar
  and the game are the same thing.
- **Which is what lets the client find the server by looking at the address
  bar.** A built client defaults to `location.host`; a dev build still reaches
  for `:8080` on whatever host served it, gated on `import.meta.env.DEV` and
  tree-shaken out of the production bundle. So there is no `?server=` for a
  guest to be given, and therefore no way to hand somebody one pointing at the
  wrong machine. `?server=` still overrides both, for LAN and dev.
- **`wss:` when the page is https, and it is not optional.** Every tunnel worth
  using terminates TLS, and a browser blocks a `ws://` socket opened from an
  https page as mixed content. Hardcoding `ws://` is what would have made this
  work perfectly on the LAN and fail the moment it went out to the internet,
  with a console error nobody would think to look for. Derived from
  `location.protocol`.

**`ALLOW_WORLD_RESET` exists because exposing this server made two old messages
dangerous.** `restart`, and `spectate` with `restart` set, both call
`resetWorld` from *any* socket, in or out of a lobby — so anybody who has the
address can wipe the round everyone is playing, and the four-letter code does
not cover it because neither message goes near a lobby. Nothing in the client
sends `restart` at all any more; the pause panel's Restart is `lobbyRestart`,
which checks you are the host. Both are off unless `ALLOW_WORLD_RESET=1`.
Measured both ways against a live server: with the flag off, `{"type":"restart"}`
and `{"type":"spectate","restart":true}` leave the seed untouched; with it on,
both change it. **Plain `?spectate` is deliberately unaffected** — it sends
`restart: false`, only watches, and is the documented way to observe a live
round. Only `?spectate=new` needs the flag.

**How to actually host**, in the order worth trying:

- **A tunnel** (`Host Online.bat` uses this if `cloudflared` is on PATH):
  `cloudflared tunnel --url http://localhost:8080` prints an
  `https://….trycloudflare.com` URL that *is* the game. No router access, no
  account, works behind CGNAT, and it is a single portable `.exe` — the only
  kind of install that works on the machine without admin rights. Costs some
  latency through Cloudflare's edge, and the URL changes every run.
- **A forwarded port** — lowest latency and the right answer if the router is
  yours: forward 8080/TCP and hand out `http://your-public-ip:8080`. Impossible
  behind CGNAT, which is most mobile and some fibre ISPs.
- **Tailscale** if everyone will install it: WireGuard hole-punching gives a
  genuinely direct machine-to-machine connection, which is the closest thing
  here to actual peer-to-peer, with no forwarding. Needs admin to install on
  Windows, so it is out on the work box.

#### The HUD says what the connection costs

`ping 10ms (p90 22) · input ~43ms` on the perf readout, so "it feels laggy"
becomes a number and the tunnel-versus-forwarded-port question can be settled
with a measurement rather than an impression.

- **Two figures, because they answer different questions.** `ping` is the wire
  alone. `input` is what a player actually feels, and it is the one that
  decides anything: between a keypress and the officer moving there are two
  waits at 30Hz — one for the next `sendInputLoop`, one for the next server
  tick — averaging half a period each, so the felt figure is the round trip
  plus roughly a whole tick period. A frame to draw it is small next to that
  and is left out rather than guessed at.
- **p90 rather than a max, because jitter is what ruins the feel**, not the
  average. A steady 80ms is far more playable than one swinging between 20 and
  200, and only the spread shows that.
- **The server answers in the message handler, nowhere near the tick.** A reply
  that waited for the next tick would fold up to 33ms of server cadence into
  the wire figure and report the network as slower than it is. Measured: 12/12
  probes answered, `t` echoed untouched, worst 29.6ms — under one tick period,
  which is what says it is not tick-bound. Note the figure *does* include time
  the server spends blocked inside its own tick, which is correct: that is real
  latency a player pays.
- **The window is per-connection.** Carrying it across a reconnect would average
  the old route's timings into the new one's. Verified: 20 samples, zeroed the
  moment the server went away, rebuilt from the new connection only.
- **Thresholds are set for driving a body**, not for commanding a unit — green
  under 70ms of input latency, amber to 120, red past it. There is no
  client-side prediction anywhere in this game, which is the whole reason the
  number matters: nothing hides it.

It is drawn with the rest of the perf readout, so it only shows **in a round**,
not at the menu or in the lobby.

Two things this does *not* do, and both are fine until they aren't: there is no
rate limit on connections or messages, and no cap on how many sockets one
address may open. A public tunnel URL handed to friends is not the same as a
server advertised to strangers, and nothing enumerates lobbies, so the exposure
is "somebody guessed or was given your URL". Worth revisiting before this is
ever left running unattended.

### The city is not one size

The host's lobby slider: **100 to 500 civilians, and the city shrinks with the
crowd.** It exists because one of the two machines this is developed on cannot
run a full round, and it is the only setting in the game.

- **The number is civilians only.** The garrison, the players, their bots and
  the five zombies that walk in from the edge are all on top of it — which is
  what the slider says, and what `HUMAN_COUNT` has always meant.
- **Area scales with population**, so the streets stay as busy as they are now.
  A quieter round is meant to be a *smaller city*, not the same city with the
  people thinned out of it; walking four blocks to find anybody is not the game.
  That is `sqrt(pop / 500)` on each axis.
- **`CITY_SCALE_MIN` (0.6) is where it stops, and the floor is not a round
  number picked by eye.** Blocks, roads and the gaps between buildings keep
  their **absolute** sizes at every setting — that is precisely what keeps a van
  able to drive in and a SWAT team able to get out of it — so shrinking the map
  removes blocks rather than tightening them. What does not shrink on its own is
  the landmark set, and below about 0.6 the corner complex stops being a corner
  of a city and starts being the city. The floor is 3000x2220, which still holds
  an 8x6 street grid around all of it. Below the floor the crowd genuinely
  thins, which is the trade at the bottom of the slider.
- **Counts scale; sizes do not.** `scaledCount` in `mapgen` is the whole of it:
  big buildings and loose bushes by *area*, edge buildings by one axis since
  they line a perimeter. Landmarks that are absolute — the corner complex, the
  big buildings — are additionally capped as a *share* of the shorter side
  (`CORNER_COMPLEX_MAX_SHARE`, `BIG_BUILDING_MAX_SHARE`), which is a no-op at
  full size and is what stops one swallowing a small map.
- **The garrison scales by area, not linearly.** The figure that matters is the
  furthest any spot can be from the nearest officer, and it goes as
  `sqrt(area / count)` — so holding officers-per-square-pixel fixed holds that
  distance fixed. Scaled linearly a small city would come out *better* garrisoned
  than a full one, which is a difficulty change smuggled in under a performance
  setting. Floored at four.
- **The slider is refused while a round is up**, and the control says so rather
  than being clicked and ignored. There is nothing left for it to size: the nav
  grid, the room map and every broadphase grid are already built to the city on
  screen. Restart is what applies a change.

**`WORLD_WIDTH` and `WORLD_HEIGHT` are `let`, and that is the whole mechanism.**
ES module exports are live bindings, so the hundred-odd places that read them
see whatever `setCityPopulation` last wrote without any of them being handed a
size. The cost is one rule: **nothing may derive a module-level constant from
them.** `TRACKER_RANGE` became `trackerRange()` and the client's `SPECTATE_FIT`
became `spectateFit()` for exactly that reason — computed at import they would
freeze the launch size in and then quietly disagree with the map forever.

- **The client is never told a population.** It is told a `MapData`, which
  carries the width and height the server actually built, and `setWorldSize`
  takes its word for it — on `welcome` and on `map`, **before** anything below
  reads a dimension (the spectator camera recentres on the middle of the city a
  few lines further down). Deriving the size from a population on both ends
  would be the same arithmetic written twice, and the day they disagree the fog,
  the camera clamp and the minimap all frame a city that is not the one on the
  wire.
- **`resizeGrids` in `resetWorld` is not optional.** A `SpatialGrid` takes its
  column count in its constructor. *Shrinking* leaves an oversized grid, which
  is merely wasteful — it is a sparse `Map`. **Growing is the one that breaks**,
  and quietly: `col`/`row` clamp to the last index, so everything past the old
  city's edge lands in one cell. Measured on the real case, a host who plays a
  quiet round and then restarts at full size: **85 bodies in a single cell
  against 6** with the resize in.
- **The trap that cost the most time is not in this code at all.** `shared/` had
  no `package.json` and there is no root one, so node treated those files as
  CommonJS and every importer got a *snapshot* of `WORLD_WIDTH`. Every round
  came out 5000x3700 with 500 people in it wherever the slider was, and nothing
  errored — the giveaway was that functions *inside* `constants.ts` saw 0.36
  while `WORLD_WIDTH` read 5000 in every importer. `shared/package.json` fixes
  it. `startLobby` now compares the generated `map.width` against
  `citySizeFor(lobby.population)` and logs loudly if they disagree, so losing
  that file again is noisy rather than silent.

`server/citysize.ts` is the harness — headless, no socket, no port, so it leaves
a game on 8080 alone. Measured over six cities at each of five settings:

| pop | city | buildings | street clearance p5/p50 | narrowest doorway | van parks | crew out | garrison |
|---|---|---|---|---|---|---|---|
| 500 | 5000x3700 | 84-89 | 8 / 74 | 46 | 36/36 | 36/36 | 12 |
| 400 | 4472x3309 | 63-65 | 8 / 80 | 46 | 36/36 | 36/36 | 9-10 |
| 300 | 3873x2866 | 53-55 | 8 / 80 | 46 | 36/36 | 36/36 | 7-8 |
| 200 | 3162x2340 | 34-38 | 8 / 80-86 | 46 | 36/36 | 36/36 | 5-6 |
| 100 | 3000x2220 | 24-26 | 8 / 86-90 | 46 | 36/36 | 36/36 | 4-5 |

Garrison is the city's own officers, not counting the bots standing in for
absent players. Ranges are across repeated runs — the map is not seeded, so
quote a range and never compare two single runs.

**A smaller city is a more open one, never a tighter one** — the median street
clearance goes *up* as it shrinks, the narrowest doorway is 46px at every
setting (the dog's collision circle is 38), and the van found a spot its whole
footprint fits and got its crew out on every one of 180 calls. The park and the
pond were on the map in 30/30 cities.

**What it buys**, on the same world resized under itself, 300 ticks each with a
clock that actually advances: entities **521 → 113**, nav cells 94,870 →
34,185, `generateMap` 8.1 → 2.0ms, and the tick roughly **3x** — 6.28 → 2.01ms
median on a quiet run, 13.25 → 3.48ms on a busy one, so take the ratio and not
the absolute figures. Live in a real round with one bot: 519 entities and
`updateAi` 5.2ms at 500, **111 entities and 2.1ms** at 100.

**A city at 500 is byte-for-byte the one it was.** Every scaled count and every
share cap is a no-op at full size, and none of them consume an extra `rand()`,
so the seeded map is unchanged: five seeds hashed against `HEAD` before the
change and after it, **5/5 identical** down to the wall, door and bush counts.

*Note the measurement of "space between buildings" went through a wrong version
first.* The smallest gap between any two footprints anywhere in a city is an
outlier of two rects that happen to nearly touch, and it bounces between 0 and
28px from seed to seed at **every** setting — it says nothing. The question is
whether a small city is a *tighter* one, which is a question about the
distribution, so the harness walks the walkable ground instead and records how
far each open spot is from the nearest blocked one.

### Nothing on the outbreak's side starts indoors

Reported as *"don't let zombies or the zombie dog start in a building"*, and the
four ways in were not equally at fault. Measured over forty cities with the old
behaviour gated back in:

| indoors, out of every spawn | OLD | NEW |
|---|---|---|
| the initial outbreak | 1/200 (0.5%) | **0/200** |
| a breach point | 13/800 (1.6%) | **0/800** |
| the roar's summons | 3/320 (0.9%) | **0/320** |
| a dog joining a round | **79/400 (19.8%)** | **0/400** |
| a dog's next life | 346/480 | **0/480** |

- **The dog was the real one, and `findSpawnNear` is why.** It checks geometry
  and other bodies and nothing else — which is exactly right for a SWAT team
  getting out of a van against a frontage, or a pocket gunner going down in a
  hallway, and wrong for the one caller that has to come in off the street. **A
  room's floor is clear of wall slabs**, so a spot in somebody's front room
  passes every test it makes. It has an `outdoors` flag now, off by default, so
  the answer for every other caller is byte-for-byte what it was.
- **The edge walks were nearly right and had no floor under them.** The breach
  point steps inward off the perimeter until it is out in the open — the
  perimeter has buildings built onto it, so an edge point lands in a front room
  often enough to matter — but the loop *ends* after forty steps rather than
  failing, and it also clamps against the far inset and burns the rest on the
  spot. A body was then quietly left wherever it had got to. `streetSpotNear`
  is the floor: it spirals like `walkableNear` and asks the further question of
  whether a spot is *outdoors*, which walkable and reachable do not answer.
- **A dog's next life is a preference, not a rule.** It rises out of a shambler,
  and with the whole horde indoors the alternative to an indoor host is refusing
  the birth — which costs the player the round rather than a bad camera angle.
  So outdoor hosts are taken when there are any and indoor ones when there are
  not.
  - **It also closes a documented rendering fault.** The shamblers most likely
    to be indoors are the ones pressed against a shut door, and a dog rising
    with its centre inside the slab collapses its own visibility polygon and
    blacks the screen out — the case under **Known open issue** that says *"the
    dog gets it worst, and gets it on respawn"*.
- **Conversion is untouched, and deliberately.** Somebody bitten in a back room
  turns in that back room; that is not a spawn and there is nowhere else for it
  to happen.

`server/spawncheck.ts` is the harness — headless, no socket, no port.
`setSpawnsIgnoreBuildings` is the gate and it is kept: the control is the whole
value of the run, since every new figure in that table is a zero and a zero is
what a rig that sampled nothing also reports.

*Two things about the run are worth reading correctly.* The 72% on a dog's next
life is a **staged ratio, not a live one** — twelve shamblers are put in rooms
against the five the city starts with, because a fresh city's horde is out in
the street by construction and a rig that waited for a live one would find
nothing but correct answers and pass in both modes. And the three edge faults
are rare enough that twelve cities showed **0/240** for the breach where forty
showed 13/800; quote the wider run, and do not conclude from a short one that
the walk never fails.

### Civilian traits

Each civilian rolls a fixed personality in `newAiState`, and most odd-looking
crowd behaviour traces back to one of these rather than to a bug:

`settleTrait` where they eventually hole up · `shelterSeeker` runs for a
building on sight · `shelterFar` picks one blocks away instead of the nearest ·
`bushHider` dives for cover · `fleeStyle: 'bolt'` runs blindly, walls and all ·
`staysIndoors` sits tight when the zombie is outside · `homeBuilding` lives
here and won't wander out · `witness` reacts to someone else running ·
`panicScale` how long they stay rattled · `refugeBias` where in the candidate
list they reach, so crowds fan out instead of funnelling into one doorway ·
`shelterLarge` wants a landmark rather than the nearest front door ·
`officerSeeker` runs to whoever has a gun and stands behind them ·
`barricades` retreats deeper into a building and bolts a door rather than
running past the thing · `followsCrowd` falls in behind a neighbour who is
plainly getting away · `hidesDeeper` holes up at the back of a building rather
than in the first room it reaches.

Zombies roll three of their own: `smartZombie` decides how *well* one searches
— every zombie leaves an emptied room now, see **Rooms** below — `spreadsOut`
makes one pick somebody the pack isn't already after, and `freshUntil` makes
anything newly turned ignore doors entirely while there is prey about.

`sawZombie` latches once someone has seen one, and gates the things only a
naive person does — chasing after a running neighbour to find out why.

Door traits sit alongside them: `closesDoors` shuts it behind them when merely
wandering · `locksDoors` shuts *and* bolts it when getting away from something ·
`begsAtDoors` hammers on a locked one rather than going elsewhere · `begHolds`
stays there even with a zombie on them · `opensForStrangers` would let a
stranger in, which most people would not · `guardsDoors` keeps seeing to the
doors of the room it has holed up in.

### Rooms

`mapgen` carves buildings into a grid of rooms joined by a spanning tree of
doorways and then **throws the room grid away** — all that survives is walls and
doors. `rooms.ts` rebuilds it from the other end: plug every doorway, flood-fill
what is left inside each footprint, and each puddle is a room.

Reading the *finished* map rather than the generator is the whole point. It
covers an ordinary block that was never partitioned (one room), a landmark
carved into twenty, and the openings `repairEnclosures` cut afterwards, without
any of those three knowing the room map exists. Measured over eight seeds:
~100 rooms per city, zero without an exit, zero indoor samples unassigned.

- **It is static.** Walls and doorways don't move, so unlike the nav grid it is
  built once with the map and never rebuilt — `rebuildNav` deliberately leaves
  it alone. A smashed pane is a hole in a room, not a reason for two rooms to
  become one, so glass counts as a room boundary whether or not it survives.
- **The doorway plug has to be thicker than the door slab.** A ten-pixel slab
  can fall between two fourteen-pixel cell centres, and then the fill leaks
  through the doorway and two rooms silently merge. `ROOM_DOOR_PLUG` widens it
  until a solid line of centres lands inside.
- **A room's id bleeds two cells past its floor** (`ROOM_DILATE_CELLS`).
  Somebody standing in a doorway stands on no room's floor at all, and reading
  that as "out in the street" made a zombie halfway through a door change its
  mind about where it was.
- **`Room.depth` is how many doorways deep a room is**, from one BFS out of
  the street when the map is built. It is what `hidesDeeper` means by "further
  in", and it is static for the same reason the rest of this is. `randomPoint`
  sits beside it: every room's floor cells in one flat pair of arrays grouped
  by room, so a spot inside a given room is a single lookup rather than a
  rejection sample around a centroid that an L-shaped room would defeat.
- **Occupancy rides on the loop that already counted survivors.** `preyIn(room)`
  is an array lookup, not a spatial query — which is what makes "is there anyone
  left in here" affordable for three hundred zombies. It is also *exact*: the
  radius test it replaced counted a crowd through the wall of the room next
  door, so a zombie alone in an empty room concluded it wasn't empty.

### Zombies search room by room

Everything a zombie does with nothing in front of it to chase is
`zombieSearchTick`. Empty the room, leave by a way out it actually knows about,
and go somewhere nobody has swept.

- **Every zombie leaves an emptied room. `smartZombie` is how well.** A bright
  one gives up after `ZOMBIE_ROOM_CLEAR_MS` and picks the exit leading to the
  least recently swept room, avoiding the one it came from, the ones other
  zombies are already in, and shut doors. A dull one dawdles for
  `ZOMBIE_ROOM_CLEAR_SLOW_MS` and takes whatever is handy. That gap is what
  keeps buildings occupied instead of everything draining into the street.
- **The room underfoot is latched, not read fresh.** Re-deciding mid-threshold
  is how one ends up turning round in its own doorway.
- **It aims past the doorway, not at it.** Arriving *at* a door means standing
  in the gap, where the room underfoot hasn't changed yet.
- **Outdoors it mills about before hunting.** A horde that beelines from
  building to building leaves the streets empty, so `ZOMBIE_STREET_WANDER_MS`
  of aimlessness comes first, and only then does it pick a building.
- **"Try the other door first" is emergent, not coded.** A shut door is scored
  worse than an open one, so it walks to the open one; when every exit is shut
  it goes to one and claws. And a way out it makes no progress toward for
  `ZOMBIE_EXIT_PROGRESS_MS` is dropped and penalised in the next choice.
- **`lastSeen` has to expire** (`ZOMBIE_LAST_SEEN_MS`). The chase-the-last-
  sighting branch runs *above* every check that would notice a zombie getting
  nowhere, so one making for a spot it can't reach — behind a bolted door,
  across a wall — used to grind there for the rest of the round, invisible to
  the stuck check and the room search alike. This was the single biggest cause
  of the remaining long stalls once the search itself worked.

Measured with the old behaviour gated back in, three seeds, 180s each — spells
spent stuck in one empty room: median **17-20s → 8-12s**, p90 **65-76s →
19-28s**, spells over 90s **14/7/3 → 0/0/0**. Rooms entered per zombie
1.19-1.36 → 1.50-1.67. Tick cost was flat (+0.05-0.1ms median) despite 20-50%
*more* zombies alive, because they find people. It is a harder game now:
survivors at 180s fell from 187-263 to 80-176.

### Being shot is a grudge, not a suggestion

Two reports: *"when zombies are attracted to being shot at they should commit to
the person that shot at them originally — lots of back and forth happening right
now"*, and *"if I am in a tree and shoot a zombie it will approach me for one
second and then change its mind and go back to whatever it was doing"*. One
mechanism, three separate faults, and none of them would have been enough on its
own.

- **The intent was re-rolled per round that landed.** `RETALIATE_CHANCE` was
  0.45, rolled inside `hit` — so a burst re-decided the same zombie several
  times a second, and the 55% that lost the roll got a bare `lastSeen` with no
  commitment at all.
- **What the winning roll bought was a pause, not a decision.**
  `state.nextSenseAt = now + RETALIATE_COMMIT_MS` (1600) delays the next
  perception tick; it does not change what that tick then decides. 1.6s is
  exactly the "approaches me for one second and then changes its mind" in the
  report, and it is a coincidence only in the sense that the number was picked
  before anybody watched it.
- **And `senseTarget` stamped over the memory.** This is the one that mattered.
  It writes the chosen body's position into `lastSeen` — the very field carrying
  where the shot came from — so a zombie that set off toward a hedge, spotted a
  civilian on its next perception tick, lost *both* its target and its record of
  the shot. It did not change its mind; it had its mind taken off it.

`provokedBy` and `provokedUntil` on the AiState are the whole of the fix.

- **It is latched to the first shooter.** A second officer landing rounds on it
  gets the flinch and the stagger and nothing else. With three people firing,
  "commit to the one that shot at them originally" is only meaningful if later
  shooters cannot take it over.
- **Where to go still rides `lastSeen`**, like the dog's roar and
  `followTheChase` before it — so no new branch was needed in `updateZombie` and
  nothing about walking to a remembered spot is written twice. What the
  provocation adds is that `senseTarget` may not overwrite it, and that
  `lastSeenUntil` is stretched to the provocation's own deadline rather than
  expiring at `ZOMBIE_LAST_SEEN_MS` under a grudge that still stands.
- **`committed` is deliberately narrower than `provoked`.** The exclusivity
  holds only while there is still somewhere to be; once the walk is spent —
  arrived, or given up on — ordinary targeting resumes, so a zombie that went to
  the spot and found nobody is not locked out of the rest of the city for the
  remainder of the twelve seconds.
- **One exception, at pouncing distance.** A provoked zombie that walks *through*
  somebody at arm's length to reach a spot two streets away is a different kind
  of wrong from the one being fixed. `ZOMBIE_LUNGE_RANGE` is reused rather than a
  figure of its own because it is already this game's definition of close enough
  to throw yourself at something — and an interception at that range is not the
  reported flip-flop: it ends in a grab, with the grudge still standing
  underneath it when that resolves. Taking it does **not** cost the remembered
  spot, or the exception becomes another way to lose the grudge.
- **The noise is a nudge, not a grudge.** `alertZombies` still sends everything
  in `GUNSHOT_ALERT_RADIUS` (900) toward the bang with no commitment, and a meal
  in front of them still wins — hearing a shot is not the same as being shot,
  and a 900px radius that *committed* everything in it would pull whole
  neighbourhoods onto one officer every time a trigger was pulled. What it must
  not do is undo one, so it now skips anybody already provoked by a different
  officer.

**`ZOMBIE_PROVOKED_SNIFF` (70) is the whole of the bush fix**, and it is the
half that no amount of commitment would have supplied. A bush you are standing
in does not blind you and does stop anybody seeing in, which is what makes
hiding work — and it also meant a zombie could walk to the exact pixel it was
shot from, stand on top of the shooter, fail `hasLineOfSight` against the
foliage, find nothing and wander off. Inside that radius the sight test is
skipped **for the shooter alone and only while the provocation stands**, so it
is not a hole in cover: a zombie strolling past a hedge still cannot see the
civilian in it and `bushHider` is untouched.

`server/provoke.ts` is the harness — headless, no socket, no port.
`setZombieForgetsTheShooter` is the gate, kept rather than deleted because the
control is the entire value of the run. Sixteen staged runs each way:

| | OLD | NEW |
|---|---|---|
| intent on the shooter | 1516/2003 ticks (76%) | **1748/1748 (100%)** |
| intent on the decoy | 487 ticks (24%) | **0** |
| reached the shooter | 10/13 | **15/15** |
| bush: reached the spot | 12/12 | 12/12 |
| **bush: found the shooter** | **0/12** | **12/12** |
| bush: closest approach | 28.0px | 62.8px |

**The bush row is the report stated exactly**: the old behaviour walked to within
**28 pixels** of the officer who shot it and never once found them. The new one
is *further* away at 62.8px only because the run stops the moment it finds them,
which is inside the 70px sniff.

**What the rig does not show is oscillation**, and that is worth being straight
about. It stages one zombie and one round, where the median run makes a single
decisive defection to the decoy rather than flapping — flips are median 0 either
way. The "lots of back and forth" in a live round is that per-round re-roll
across a burst and a crowd, which is the cause the first bullet above names, and
this is the mechanism rather than a reproduction of the feel.

*Four things about staging this were the rig lying rather than the code failing,
and every one of them made the two modes look alike:*

- **`fire` reads `world.entityGrid`, and staging entities does not fill it.**
  Bodies added since the last `rebuildEntityGrid` are not in it, so the hitscan
  found nothing and **no round ever landed on anybody**. What still ran was
  `alertZombies`, which fires on the *shot* rather than on the hit — so the
  zombie walked toward the noise and the rig scored that as the grudge working.
  Both modes read ~60% committed and neither had executed a line of the code
  under test.
- **`world.bushGrid` is what `hasLineOfSight` reads, not `map.bushes`.** Pushing
  foliage onto the map without rebuilding the broadphase leaves it invisible to
  every sight test in the game: the zombie saw the shooter straight through the
  thicket at 380px and targeted him on tick one, so the rig reported **7/7 found
  the shooter in *both* modes** and had staged no bush at all. `buildStaticGrids`
  is exported for this.
- **One round, not a burst.** The old behaviour re-rolled and re-paused on every
  round that landed, so firing once a second bought 6.4s of an 8s run and the old
  code scored **80% committed**.
- **The decoy has to stay a temptation for the whole walk.** Staged 260px off the
  zombie on the far side it fell out of sight as the zombie advanced — 160px of
  walking puts it at exactly `ZOMBIE_SIGHT_RADIUS` — so the old behaviour was
  never offered the choice it is supposed to fail and both modes read 100%/0%.
  And staged at 150px it sat exactly on `ZOMBIE_LUNGE_RANGE`, the one distance
  the new rule deliberately lets through, so the rig measured the carve-out and
  the *new* behaviour scored worse than the old.

### Word of a chase travels exactly one hop

A zombie that can see somebody chasing prey — but cannot see the prey itself —
goes where the chaser is going. A zombie that can only see *that* one carries
on wandering. `followTheChase`, off the back of `senseTarget`.

**The one-hop limit is the whole design, and it costs nothing to enforce.** A
zombie that has actually seen prey has `targetId` set; one that is only
following a chaser has nothing but the borrowed memory. The candidate test is
`targetId !== null`, so a follower cannot itself be followed — the rule falls
out of the existing state with no flag, no depth counter and no bookkeeping.
Left to propagate freely it would zip the whole map together the instant one
zombie spotted anybody, which is both the wrong behaviour and, at three hundred
zombies, an enormous one.

- **What is borrowed is where the *prey* is**, not where the chaser is. They
  make for the same place he is making for rather than queueing up behind him.
- **It goes into `lastSeen`**, so the existing "make for where it was" branch
  does the moving and `ZOMBIE_LAST_SEEN_MS` expires it. Nothing else in the
  zombie AI needed a line about this at all.
- **Only for a zombie with nothing of its own** — no target, and no live memory
  of one. Somebody already making for a spot they saw a person at is not
  somebody to pull off it.
- **Found in the loop that was already walking that list.** `senseTarget`
  queries the neighbours anyway, so spotting the nearest chaser is free; the
  only new cost is a single line-of-sight ray, and only for the nearest
  candidate, and only for a zombie with nothing to chase. Seeing *him* is the
  premise, and that ray is why this cannot see round corners.

Measured with a staged chain — a human, then A at 231px, B at 462, C at 693,
everything pinned so the geometry holds: B has somewhere to go on **235/240**
ticks and C on **0/240**. With the behaviour gated off, B is 0/240 too. Live,
over two paired 150s runs: tick median **2.87→3.04ms** and **3.18→3.41ms**,
with slightly more zombies alive at the end (135→149, 239→253) — the horde is a
little better at finding people, which is the point.

*Pinning the chain is what makes that test mean anything.* Left free, B drifts
a few pixels toward the human, comes inside `ZOMBIE_SIGHT_RADIUS` and sees them
directly — which looks exactly like the feature working and is not.

### Some of them fan out; a horde is not a conga line

`senseTarget` scored on distance alone, so twenty zombies stood roughly
together all picked the same nearest person and trailed after them in single
file — while the crowd four paces past that person walked off untouched.

- **`spreadsOut` is a rolled trait** (`ZOMBIE_SPREAD_SHARE`, 0.6), deliberately
  not all of them: a pack where nothing ever doubles up also never brings
  anybody down, and `MAX_GRAPPLERS` already caps the pile-up that matters.
- **It rides the same score `INFECTED_TARGET_PENALTY` does**, as a multiplier
  of `1 + claims * ZOMBIE_SPREAD_PENALTY`, so "already bitten" and "already
  spoken for" compose rather than argue. It is a *penalty*, not a veto —
  somebody twice as close is still worth taking off somebody else.
- **Its own claim doesn't count against it**, or a zombie talks itself out of
  the target it already has on every perception tick.
- **`world.targetClaims` is counted once a tick**, in the walk `updateAi` was
  already paying for survivors and room occupancy — the same trick, and the
  same reason. One map lookup per zombie here against a spatial query per
  zombie in `senseTarget` if each went and found out for itself.

Measured with the trait gated off, three runs each, 180s — chasers per distinct
target: median **1.80-2.00 → 1.60-1.67**, p90 **2.40-2.60 → 2.14-2.75**. Note
the map is not seeded, so how far the outbreak got varies wildly between runs
and the survivor counts are not comparable; the ratio is, and the two groups
don't overlap on the median.

#### And a margin is what stops them dithering

Fanning out came with a flaw: zombies changed target erratically, several times
a second. `ZOMBIE_TARGET_STICK` (0.7) is the fix — the target you already have
is scored 30% cheaper than a fresh one.

- **The cause is a best-response loop, not a bug in any one line.**
  `world.targetClaims` is rebuilt every tick from everybody's current
  `targetId`, and every zombie re-picks at `SENSE_INTERVAL_MS`. So each one is
  optimising against a number its neighbours are moving underneath it: A leaves
  P for Q, P's claim drops, P is attractive again, A comes back. That is the
  standard congestion-game oscillation and it needs damping, not a better
  score.
- **Discounting your own claim only makes the incumbent *neutral*.** That line
  stops a zombie talking itself off its own target, which is a different
  problem. Neutral flips on any wobble — two prey drifting past each other in
  distance, or one neighbour applying or removing a whole
  `ZOMBIE_SPREAD_PENALTY` on one of them.
- **A margin rather than a change budget**, and the budget was the other
  candidate: cap a zombie to N switches and lock it out for a few seconds.
  Rejected because it leaves the oscillator running — it re-enters the loop the
  moment the lockout expires — refuses good switches as readily as bad ones,
  and needs carve-outs for the target dying, leaving sight, or the pack filling
  up. Three carve-outs is the tell that a rule is fighting the code. It is also
  the same cure as `BOT_BOLT_DIST` → `BOT_SAFE_DIST`, `BOT_SWAP_MARGIN` and
  `longestGun`: the answer to dithering on a line is a margin, four times now.
- **It applies to every zombie, not only `spreadsOut` ones.** A dull zombie
  dithering between two equidistant people looks the same on screen.

`server/targetchurn.ts` is the harness — headless, no socket, no port, so it
leaves a game on 8080 alone. Both modes run in one process, alternating city by
city. It has two halves, and the staged one is the important one:

| | OLD | STICK |
|---|---|---|
| switches / zombie-second-with-a-target | 0.366-0.533 | **0.206-0.245** |
| switches within 500ms of the last | 39-57% | **23-26%** |
| switches within 1s of the last | 51-66% | **31-37%** |
| median gap between switches | 400ms | **1600ms** |
| chasers per distinct target, med/p90 | 1.00 / 3.00 | 1.00 / 3.00 |

Three cities each at 120s. **The control is the bottom row** — this is a margin
laid over the fanning-out, so the thing it could plausibly have undone is
measured rather than assumed, and it did not move.

**The staged half is what says the margin discriminates rather than being
merely stubborn.** A zombie holding P at 300px, pinned on open ground, when Q
appears: at 100px it takes Q, at 200px it takes Q, at 280px it keeps P — where
the old behaviour took Q in all three. That 280px case *is* the churn, and the
100px case is the one a change budget would have refused. Pinning matters: left
free the zombie closes on its target, the geometry stops holding, and a switch
caused by the distances changing looks exactly like the feature working.

**The extreme tail is unchanged and the reason is worth knowing.** The worst
single zombie-second is 8 switches in both. A neighbour piling onto your target
applies `ZOMBIE_SPREAD_PENALTY` — a ×1.85 — which still overwhelms a ×0.7
margin, so in a dense crowd the claim swing wins. That is *the feature*, not
noise: a claim landing on your target is supposed to push you off. Fully
dominating one extra claim needs the stick below 1/1.85 = 0.54, which would
require a new target to be 46% closer and would start disabling `spreadsOut`
for anybody who already has a target. 0.7 damps the bulk and leaves the trait
its say; below ~0.54 is a different trade, not a stronger version of this one.

### What the crowd knows

**`danger.ts` is omniscient and `rumour.ts` is not, and that distinction is
the point.** The danger field is sourced from every zombie on the map whether
or not anybody has laid eyes on it. That is the right answer for the half
second of running for your life — and the wrong one for deciding where to
stroll, where to hole up, or which house to run into.

So the split is: **flight reads `danger`, everything calmer reads `rumour`.**
Only a human or an officer who actually *sees* a zombie writes to the rumour
field, in `senseThreats`, and what they write fades over `RUMOUR_MEMORY_MS`.
It is deliberately shared rather than per-person — people shout, so one
sighting is a street the whole neighbourhood keeps out of for a while. That
also makes it O(1) to read, which is the only reason four hundred of them can
afford to consult it at all. No BFS: it is a memory, not a distance.

Before this, nothing outside the flee branch consulted danger of any kind.
`pickWanderTarget` took the first walkable ring sample and `chooseSettleGoal`
sorted purely by distance, so a civilian would calmly settle into the house
they had just watched a neighbour dragged out of.

- **Nobody knows a door is locked until they try it.** No refuge choice reads
  lock state anywhere — see `shelterAppeal`. What they can judge is how many
  ways in and out a building has from the street, and whether anyone has been
  shouting about the place. Finding a bolted door is a discovery: they beg
  (`begsAtDoors`), or go round the side (`anotherWayIn` → `shelterVia`), and
  only give the building up once every way in has been tried and refused.
  `refusedDoors` only ever records a door somebody physically walked up to.
- **"Covered" is about zombies, not locks.** A doorway is covered when a
  zombie *they can see* is standing in it, or is closer to it than they are and
  would plainly get there first. `openDoorInto` on the way in, `exitPointFor`
  on the way out, same test both ways.
- **Escape routes are scored along the way, not only at the far end.** Scoring
  the destination alone picks somewhere lovely on the other side of the zombie,
  and then the router walks them straight past it.
- **A protector is an officer of any kind or a deployed pocket gunner**, and
  the gunner wins from half again as far off. The spot offered is *behind* the
  bags, so a crowd gathering at one doesn't wander into its own gun's arc. Some
  of them say so (`PROTECT_LINES`), on a long interval — a chance re-rolled per
  tick is a person who never stops talking.

### Holing up is something you do, not somewhere you stop

Reported as *"civilians that have run to a room and locked a door after seeing
a zombie then stand where they are motionless after doing so"*, and the code
said exactly that: `case 'settled'` was a `return` and nothing else. Somebody
who ran into a room, shut the door and threw the bolt then stood on that pixel,
facing that bearing, for the rest of the round. Measured on a rig, sixty
seconds of being holed up moved them **0.0px** and put them in **1** distinct
spot. Every other kind of standing about in the file — the rally hold, an
officer at his post — at least looks around.

`settledTick` is the whole of it, and `settleHere` is the one door into the
state: everything that decides somebody has stopped running goes through it
rather than assigning `mode` itself, because settling is three things at once —
a room to be in, sometimes a walk to the back of the building first, and a
clock for the pacing that follows.

- **They pace the room they shut themselves into.** Long stops and short legs:
  `SETTLED_PAUSE_MIN_MS`-`MAX` (2.2-9s) of standing and looking about, then a
  walk to another spot on the same floor at `SETTLED_ROOM_SPEED_MUL` of a
  stroll. That is waiting something out rather than strolling, and it is
  deliberately **not a trait** — standing dead still was never anybody's
  personality, it was the absence of any behaviour at all.
- **The target is a floor cell of their own room**, from `RoomMap.randomPoint`,
  which is what makes "wander in *here*" mean the room and not a radius. A ring
  sample round the body would put half the targets through the wall, and the
  router would then walk them out of the front door to reach one. Measured:
  **0 of 9000 ticks** spent outside the room in the rig, 99.5-99.8% live.
- **`settleRoom` is latched, not read fresh.** It is what "in here" means, and
  somebody who drifts into their own doorway must not thereby adopt the room
  next door — a doorway belongs to whichever room's floor is nearer. What
  repairs a latch that *was* wrong is the leg deadline: a lap that ran out of
  time is a lap that went nowhere, so the room is re-read on that failure only.
  Arriving proves the latch, since the spot came out of it.
- **Somebody holed up does not open a door** (`holedUp`). They shut themselves
  in on purpose, and the pacing must not become a slower way back out of it.
  The existing refusal to unbolt one was already keyed on `mode === 'settled'`;
  this extends it to shut-but-unlocked doors, and both now ask `holedUp` so
  they can tell "finished with doors" from "still walking to where I mean to
  hole up", which want opposite things. It costs at most one tick: a threat
  sets `flee` further down the same update. Measured: **0 of 6** rigs opened
  the shut unlocked door in a minute.
- **The pause runs before the walk, so the walk's deadline starts where the
  pause ends.** Set from `now` it is mostly spent motionless and then expires
  before a step is taken, at which point the target is thrown away and another
  picked — pacing becomes a person standing still choosing spots they never
  walk to. Measured that way: **168-290px** covered in a minute and a reach of
  30-63px inside rooms a good deal wider. After: **220-624px** and a reach of
  ~60-110px.

Live over 180s, three cities: pace **12.6-13.8 px/s** median while settled,
they get **73-90px** from where they settled (p90 148-164), 55-59% of settled
ticks are the standing-about half, and **99.5-99.8%** of them are spent in
their own room. `updateAi` is **+0.02 to +0.04ms** on the median with the old
behaviour alternated back in every 50 ticks on the same world — which is to say
free; settled people path within one room, so `hasWallClearPath` answers almost
all of it and A\* rarely runs.

#### Some of them keep seeing to the doors

`guardsDoors` (`DOOR_GUARD_CHANCE`, 0.45). A bolted door that a neighbour walks
through five minutes later has bought nothing, and until now nobody ever looked
at it again.

- **It is the noticing only.** `lockAlso` already knows how to walk to a door,
  shut it and bolt it — it is what `askForNeighbourDoor` drives — so the whole
  addition is a scan that sets `state.lockAlso`. Nothing about the walking or
  the handle work is written twice.
- **`Room.exits` is the list, so it is three or four indices rather than a
  spatial query.** That is what makes it affordable for a city full of people
  sitting in rooms, and it is checked on `DOOR_GUARD_CHECK_MS`, not per tick.
- **A door is "unsecured" if it is open, or shut and unbolted.** One an officer
  bolted is left alone entirely and one somebody else is working is left to
  them, the same rules everything else here follows.
- Measured on a rig, door thrown wide open and unbolted: **6/6 shut again and
  6/6 bolted again, median 2.6-2.9s**, against **0/6 and 0/6** with the trait
  off. Live over 180s: **80-104 doors re-shut and 106-131 re-bolted** per city.

#### And some of them hole up at the back

`hidesDeeper` (`HIDE_DEEPER_CHANCE`, 0.4). `Room.depth` is new and static —
doorways between a room and the street, one BFS with the room map — and it is
what "deeper" means. Not distance: the far end of a long hall is no further
from the street than its near end, and a cupboard off it is.

**That is also what makes it a landmark behaviour with no mention of
landmarks.** An ordinary block is one undivided room, so there is nowhere
deeper in it to go and the trait never fires there. Measured over three cities:
~120 rooms, of which **89-93 are at depth 0** and only 3-5 buildings are
partitioned at all, reaching depth 8. Same limit as room-to-room barricading,
and for the same reason.

- **One room at a time, and the first version was not.** Aiming straight at the
  deepest room in the building fails twice over, and the rig found both:
  fourteen seconds at 35px/s does not cross a landmark, so **8 of 8** hiders hit
  their deadline having arrived nowhere; and the router has no idea this is
  meant to be an indoor journey, so the shortest nav line from a front room to
  a back one runs out of one street door and in at another — **2 of 8 ended up
  outside the building they were hiding in.** A hop through the adjacent
  doorway cannot leave the building, and repeated it arrives at the back anyway.
- **The choice is a BFS over the room graph even though the walk is one hop.**
  Greedily requiring every step to go deeper strands anybody whose neighbours
  are all at their own depth, which is an ordinary shape — two rooms off the
  street side by side. Measured that way, **1 hider in 8 never moved at all**
  in a building nine rooms deep. The search walks the flat bit to get to the
  stairs. It is one building, twenty rooms at the outside, once per room
  entered.
- **It aims at the middle of the next room, not a random spot on its floor.**
  `randomPoint` is uniform over floor cells and some of those sit right beside
  the doorway just come through; arriving on one leaves the room underfoot
  ambiguous and the next hop is then chosen from the wrong room. Measured that
  way, **1 in 8 walked back out the way it came**. Spreading a household out is
  the pacing's job and it does it in seconds.
- **One budget for the whole move in** (`HIDE_DEEPER_GIVE_UP_MS`, 20s), never
  extended as they go, which is what bounds a ping-pong at a doorway however
  the room underfoot is read. A bolted door on the way costs them one room, not
  the plan — they hole up where they got to, which is a fine place to be.
- **No `unstickTick` on that walk, and it was tried.** It wants
  `UNSTICK_MIN_PROGRESS` (16px) in `UNSTICK_CHECK_MS` (420ms) — **38px/s**,
  calibrated for running away and *above* what a walking civilian makes at
  42px/s the moment it turns a corner or stands at a handle. Measured, hiders
  spent **4.5-9.1s of a 20s move in** committed to a blind breakout heading they
  had no need of, and two of them were walked out of the building by it. The
  budget covers a route that genuinely will not work; the breakout was making
  work. **Anything that walks rather than runs has this trap waiting for it.**
- Measured on the rig: **6-8 of 8** end deeper in, median gain **3-4 doorways**,
  deepest 4, and **0 of 8** end up outside the building — against **0 of 8**
  with the trait off. Live it is 7/19 and 10/22 of the hiders who settled
  somewhere with a back to it at all, the difference being that a live city
  scares them back out of it mid-walk.

**`server/settlecheck.ts` is the harness** — headless, no socket, no port, so
it leaves a game on 8080 alone. Both behaviours run in one process,
alternating every 50 ticks for the tick cost, and `setSettledStandsStill` is
the gate. That gate is **kept** rather than deleted with the measurement,
unlike most here, because the control is the most valuable line it prints:
484px of a room against **0.0px** is the whole of what says the fix is the fix.

Two things about measuring this are worth not rediscovering:

- **Every harness in this repo sets `world.pathBudget = PATH_BUDGET_PER_TICK`
  (10) where the real server sets `PATH_NODE_BUDGET_PER_TICK` (12000).** The
  budget is charged in *nodes* now — see the note under performance — so those
  harnesses run A\* capped at ten node expansions, which finds nothing at all.
  It is a leftover from before the budget changed units. `settlecheck.ts`,
  `crowdcheck.ts`, `vehiclecheck.ts`, `rallycheck.ts` and `complexcheck.ts` use
  the right one; `tickprof.ts`, `targetchurn.ts`, `grapplecheck.ts` and
  `pathbench.ts` still do not, and any figure they produced that depended on
  something routing around a wall is suspect.
- **`server/tsconfig.json` only includes `src/**`, so none of the harnesses at
  the `server/` root are typechecked.** `npx tsc --noEmit` there passes while
  `vehiclecheck.ts` is calling `closestOnBox(x, y, box)` on a function whose
  first parameter is the box — `tsx` strips types without checking them, so it
  ran and returned `NaN` for every distance, and the rig reported 0% of ticks
  spent pressed against a van it was in fact pressed against 97% of the time.
  Check one explicitly:
  `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node crowdcheck.ts`
- **A "did they move" threshold of 1px measures the pacing speed, not
  stillness.** A pacing civilian covers 0.99px in a tick, so every single
  moving tick reported as motionless and the pacing read 90% still. It is not;
  the threshold was the whole of the difference.

### An order into a building is an order to go inside it

Reported as *"when civilians are ordered to GET OVER THERE and it's in a
building I don't want civilians just pushing themselves against the wall of the
building — they need to know they are being asked to go in a building and stay
in there"*. The report is exact, and there were three separate causes.

- **The order was a bare coordinate.** `rallyHumans` took an `x, y` and every
  civilian in earshot walked at it. A click from above lands on a wall slab as
  often as on a floor — the slabs are most of what a building looks like — and
  nothing resolved that into anywhere anybody could stand.
- **The route was one long A\*, and it mostly failed.** A room several
  partitions in is a long twisting search, and it comes back empty at
  `PATH_MAX_NODES`; `headingToward` then falls through to `slideToward`, which
  walks blindly at the goal. **That is the wall-pressing, exactly.** Measured
  over six cities, one route from the street to the deepest room of each was
  found on **43 of 72** attempts.
- **And there was no "stay in there" at all.** Arriving set nothing; the
  `rallied` hold is a spot, not a room, and it was reached by 0 of 72.

`rallyRoomAt` resolves the building and the room once, at the moment the order
is given, and `rallyIndoorTick` is the walk. Three legs, and they are three
because the router only knows how to do the first one: to a street door, then
one doorway at a time off the room graph, then `settleHere`.

- **The room is resolved on the shout, not per person.** One point, one answer,
  and a point that is not strictly inside anything snaps to the nearest
  footprint within `RALLY_BUILDING_SNAP` — being sent to the front step of the
  house you were plainly pointing at is a far better failure than being sent
  nowhere.
- **Everybody gets their own spot on that room's floor** (`randomPoint`), not
  the pixel that was clicked. Thirty people converging on one point shove each
  other off it; this is the same reason `refugeBias` exists.
- **Arriving is `settleHere` with `deeper: false`.** "Stay in there" needed no
  code of its own — settling already paces the room, sees to its doors and
  refuses to open the way out. The one thing overridden is `hidesDeeper`:
  somebody *sent* to a room is already where they were told to be, and
  wandering another three doorways past it is not obeying an order.
- **`roomHopToward` is `deeperRoom` told where it is going.** Same BFS, same
  one-hop-at-a-time reason, and the street is deliberately not a node in it —
  a route through the street is a route that leaves the building.

**The door faults were doing as much damage as the pathing**, and none of them
is about the person walking. Reported a second time as *"a lot are shutting the
door on those trying to get in"*, which is what said the first fix was only a
third of one.

**`world.ralliedInto` is the mechanism: a building a crowd has been shouted
into holds its *street* doors open while the order might still be being
obeyed.** It is **a deadline rather than a count of who is still coming**, which
is the only shape that cannot leak — a counter has to be decremented by
everybody who arrives, gives up, is eaten or turns, and the one that gets missed
holds the doors open for the rest of the round, which is the `busyBy` fault
under **Doors**. Cleared by `resetWorld`, because a building index means nothing
on a new map. Interior doors are never held: the order was to be *in the
building*, and a bolt between two of its rooms is nobody's way in.

**There are exactly three places a door gets shut on somebody, and it took all
three.** Gating one took 60 shuts to 19; gating two left 19; all three is 0.

- **`doorTick`** arms a follow-up for walking through a door somebody else left
  open. `underOrders` covers the walker here, which is the same shape as bots
  having `closesDoors` cleared at spawn and the same reason: seeing to a door is
  a civilian's own business, and this is a moment when they have been handed
  somebody else's.
- **`finishDoorWork`** arms one for the door you *opened yourself* — which under
  an order is the street door the whole crowd is filing through. **This was the
  one that mattered and the one that was missed**, because it is not where you
  look: the first fix gated the branch that reads like "shutting a door" and
  left the branch that reads like "opening" one.
- **`askForNeighbourDoor`**, which bolts the door next to the one just done.

Underneath all three, **`guardsDoors` fires on nearly half the city**, so
somebody settled, noticed the front door standing open, walked back and locked
the rest out. `unsecuredDoorOf` asks `doorHeldOpen` too.

Measured on the paired rig, counted only while the order could still be being
obeyed — the hold lasts `RALLY_ROOM_GIVE_UP_MS` and the run is half again as
long, so counting the whole window folds in the perfectly correct shuts that
happen once everybody has settled:

| its street doors, while the crowd is filing in | OLD | NEW |
|---|---|---|
| shut on the queue | 47-49 | **0** |
| bolted on it | 0 | **0** |
| share of that window they stood open | 45.7-54.6% | **75.8-96.9%** |

`server/rallycheck.ts` is the harness — headless, no socket, no port.
`setRallyIgnoresBuildings` is the gate and it is kept: the control is the whole
value of the run. **Paired**, both behaviours on the same city from the same
start positions with the same rolled traits and the same doors — unpaired it
measures the city rather than the code, and two runs of it swapped the groups'
places on nothing but how many of each city's deep rooms happened to be
reachable.

| twelve shouted into the deepest room, 60s, 10-14 cities | OLD | NEW |
|---|---|---|
| ended up inside the building | 107/120, 111/168 | **117/120, 148/168** |
| …and holed up in it | **0** | **117/120, 148/168** |
| ticks spent inside it | 45.5-62.2% | 64.1-70.9% |
| ticks pressed on its outside wall | 23.0-28.3% | **9.8-12.1%** |

Two runs quoted rather than one because the map is not seeded and how many of a
city's deep rooms are reachable moves the absolute numbers a long way. The
"holed up" row is the unambiguous one: that half of the order did not exist.

**The residual ~10% is mostly a queue, not a fault.** A crowd of twelve goes
through one street doorway one at a time, and a building whose only way in is
bolted genuinely cannot be entered — `wayIntoBuilding` returns null once every
exterior door has been walked up to and refused, and they give up *then* rather
than standing there for the whole budget. Giving up picks a fresh wander target
away from the building, or they mill about on the doorstep that just beat them,
which looks like the reported fault with no order behind it.

### The corner complex is worth going into now

Three asks, one landmark: more loot in it, rarer the deeper in you go, more
people living in it, and bot officers that know both of those things and can
find their way back out.

**`MapData.cornerBuilding` is the whole of how anything finds it.** One index on
the map rather than a flag on every footprint — it is `buildings[0]` by
construction today, and anything leaning on that would break silently the day
something else is pushed first.

- **Every room of it gets a draw**, which is what makes it *more* loot rather
  than better loot in one place. `COMPLEX_LOOT_PER_ROOM` plus one more every
  `COMPLEX_LOOT_DEPTH_BONUS` doorways in. Measured over ten cities: **13-52
  pickups in it, median 22**, against a median of **1.4** in an ordinary house
  that got any at all. The map is not seeded and the complex is 12-25 rooms
  depending on the draw, so quote the range — the 52 is a 25-room one.
- **Rarity is a ceiling that comes down with `Room.depth`**, not a set of
  hand-picked tiers — `lootAtMost(COMPLEX_RARITY_CEILING - depth *
  COMPLEX_RARITY_PER_DEPTH)`, still weighted, so inside a tier the odds are
  still the odds. Derived from the registry, so anything added later lands on
  the gradient the day it exists. Measured over ten cities, median rarity by
  depth: **9 at the front door, then 3, 3, 3, 2, 2, 1** six doorways in — which
  in play is "the front rooms can hold a bolt action or a machine gun, the back
  ones only ever hold snipers, flamethrowers, radios and shields". Depth rather
  than distance for the same reason `hidesDeeper` uses it: the far end of a
  long hall is no further from the street than its near end, and a cupboard off
  it is.
  - **The gradient is compressed at the top and that is the table, not a
    bug.** `ALL_LOOT` is weighted by rarity, so its own median draw is about 3
    — the ceiling only has room to *remove* the handful of very common entries
    before it is down to the scarce tiers. What the player sees is the ceiling
    coming down, which is the whole ask.
- **Placed by room, not by rect.** `placeIn` samples a building's footprint
  rows, which for a twenty-room landmark is a lottery over the whole thing —
  there would be no way to say which room anything landed in, and the gradient
  is the entire feature. `RoomMap.randomPoint` is uniform over one room's own
  floor cells.
- **Nothing lands in a doorway.** A room's id bleeds a couple of cells past its
  floor so a body in a threshold reads as being in a room, which means
  `randomPoint` can hand back the threshold itself. Measured: **0** in a
  doorway across eight cities.
- **It draws through `drawItem` like everything else**, so `ITEM_CITY_CAP`
  still holds — a twenty-room building drawing on its own would otherwise be
  the fastest way in the game to put six radios on one map. Measured over ten
  cities: **0 caps broken, 0 guns or utilities missing**, so the ceiling and
  both floors under the rest of the city are untouched.
- **The crowd is a thumb on the existing draw, not a count of its own.**
  `COMPLEX_CROWD_MUL` extra tickets in the same uniform pick `populate`
  already makes, so it scales with the population slider for free and cannot
  over-fill a small city's complex. Measured: **19-33 civilians in it, 4.4-6.6%
  of a whole city in one building.**

#### And bots go in after it

`complexRaidTick`. Two separate things stopped a bot ever getting any of this,
and both had to go.

- **Nothing took a bot to the building.** `botPatrolTarget` refuses an indoor
  sample outright — right for a house it has already stripped, wrong for the
  one building in the city worth going into.
- **And it could not have walked through it.** `lootWanted` scores anything
  inside `BOT_LOOT_RANGE` (1400), which from the front step is most of a
  landmark — so a bot targets a rifle six partitions in and asks for one route
  to it, which is the same search that comes back empty at `PATH_MAX_NODES`.
  Measured, a city with thirty pickups in its complex had a bot pick one from
  the pavement and never get through the front wall for the whole round.

**`indoorHeadingToward` is the fix and it is shared.** Out in the street, aim
at the way in first; inside, one doorway at a time off the room graph. **A
no-op for most of the city by construction** — an ordinary block is a single
undivided room, so it falls straight through to the router, which is the same
reason `hidesDeeper` never fires anywhere else. It is used by the bot's loot
walk as well as by the raid, and it is what took rooms entered from a median of
10 to 15.

- **Walking past it is the trigger** (`BOT_COMPLEX_NOTICE`, 900), deliberately.
  A bot that knew about the complex from the first tick would set off across
  the city for it and every round would open with four officers filing into one
  corner. Knowledge you pick up by being there is also the only kind an officer
  plausibly has: what you can tell from the street is that it is a very big
  building.
- **It sits below the loot branch and above patrol.** Below loot because the
  raid exists to put loot in reach and collecting it is already written; above
  patrol because a patrol target is outdoors by construction and would walk the
  bot straight back out on the next tick.
- **And it knows the way out**, which is the half that would otherwise be
  missing. Past `BOT_COMPLEX_LEAVE_AT` of the budget it turns round and walks
  out down `Room.depth`, one doorway at a time, and only then goes back to
  being an officer. Reserved out of the budget rather than waiting for the
  clock, because a raid that ends when the clock stops ends with a bot
  switching off in a back room, which is worse than never having gone in.
- **Arriving at the deepest room is itself the cue to leave**, and it needs no
  bookkeeping: reaching this branch at all means the loot scan above it found
  nothing left in reach worth walking to.
- **One budget, never extended** — same shape as `HIDE_DEEPER_GIVE_UP_MS` and
  `RALLY_ROOM_GIVE_UP_MS`, and what bounds a ping-pong at a doorway however the
  room underfoot is read. `BOT_COMPLEX_SNUB_MS` is what stops one that has
  finished walking straight back in.

`server/complexcheck.ts` is the harness — headless, no socket, no port. It runs
with nothing alive but the bot, deliberately: a live outbreak turns the run into
a measurement of how far the city got rather than of whether the bot can work a
landmark. Measured over eight to ten cities, 180s each: **went in and came back
out 7-8 of 8**, median 85-137s, **8-13 rooms entered**, deepest **5-7 doorways
in**, **7-12 items taken**.

**A run that did not go in is the report working, not failing.** One was near
enough to notice the place for 3% of the round — it walked off after something
it could see across the street first, which is what an officer should do. The
harness prints that share for exactly this reason: "did not go in" and "was
never near it" are very different claims and a run that cannot tell them apart
is reporting the city.

**Three things about staging this were the rig lying rather than the code
failing:**

- **A bot staged with a bare `newAiState` is not a bot.** `populate` clears
  `closesDoors`, `locksDoors`, `slamsDoors`, `barricades`, `guardsDoors` and
  `hidesDeeper` at spawn; a rig that skips that gets an officer rolling
  civilian door traits, and the run reported **144 door-shutting jobs across
  eight cities** — none of which a real bot would ever have done.
- **`initDoors` starts every door unlocked**, and a lock only ever appears
  because a civilian threw one. So a rig with nothing alive but a bot never
  meets a bolted door at all, and the claim that an officer works a lock rather
  than kicking it in cannot be measured in the raid loop — it has to be staged
  with every exterior door bolted, which is also the only way to tell "unlocked
  it" from "walked round to another one".
- **Opening is instant for a bot**, so a door job counted by watching
  `state.doorAction` change never sees an `open` at all: `finishDoorWork` runs
  on the same tick. The counter reads what takes *time*, which is the set this
  is actually about.

### Barricading, and why it is rarer than it sounds

`threatSharesRefuge` asks whether a zombie is in this **room**, not this
building. The building was the only question available before the room graph
and it is far too coarse: it is the difference between being locked in with
the thing and being two rooms and a bolted door away from it. Taking it as a
veto is what made barricading impossible.

**The limit is the city, not the AI.** Measured over three seeds, only ~3% of
the ticks a frightened person spends indoors are spent somewhere with an
interior door at all — `buildingAt` (the ordinary block) emits no partitions
whatsoever, so most of the map is single-room buildings and `hasInnerExit` is
false for them. Room-to-room barricading is therefore a landmark behaviour,
firing single-digit times some rounds and a few hundred in others depending on
how many big buildings the seed drew. If it should be common, the change is in
`mapgen`: partition ordinary buildings too. That is a much bigger decision than
it looks — it touches pathing, spawning, feel and cost — so it has not been
made. What covers the rest of the city instead is the front door: `barricades`
now also drives the door-slam path, so they shut and bolt the way they came in.

### Running past a pile in the doorway

Reported as *"most civilians will not run deeper into a building or go out
another exit and instead try to run past zombies that just broke open a door…
sometimes 8 zombies will clog the doorway and everyone in the room will charge
them"*, with the note that going round **one or two** is wanted and should stay.
So the rule is a threshold on the *pile*, never on the presence of a zombie.

- **`DOORWAY_MOB` (3) is that threshold**, and under it a doorway is only
  scored worse rather than refused. It is the same figure as `MAX_GRAPPLERS`
  and `GRAPPLE_NO_ESCAPE_AT`, which is already the number at which being taken
  hold of stops being a fight.
- **The old test could not see a pile at all.** A doorway counted as "covered"
  only while a zombie was within `DOOR_BLOCK_RADIUS` of it *or nearer to it
  than the runner* — so the moment eight of them came through and spread into
  the room, every one of them was further from the door than the people at the
  back of it, the door read as clear, and the room ran at them.
- **Exits are scored now, not taken in distance order**, and threats *on the
  way* to one count as much as threats at it — scoring only the far end is the
  mistake `escapeDestination` already names. Two passes: the first refuses any
  exit a zombie would plainly reach first, and the second drops that, so a lone
  zombie between somebody and the **only** door is a thing to be got round
  rather than a reason to stand still.
- **`nextRoomAwayFrom` is `barricadeRoom` with a flag**, and dropping the flag
  is what gives the retreat to everybody. Backing into the next room when every
  way out is held is what anybody would do; before this only the `barricades`
  third of the city ever did, and the rest fell through to the open-ground
  escape and milled about in front of the pile.

**What this does not fix is the map, and that is the honest headline.** Staged
with a pile in the way out and people in the room, both behaviours were measured
against each other on the same city:

| | with another way out | with no other way out |
|---|---|---|
| used another way out | 54-60 of 60 either way | — |
| reached the pile, 8 in the doorway | 27 → **24** of 60 | 60/60 either way |
| closest approach, 8 in the doorway | 58 → **74px** | 23 → 22px |

A room with somewhere else to go already used it, and the change buys a little
more clearance. **A room with one way out has nowhere to send anybody, and no
AI change can make one** — which is most of the city: only 3-5 buildings a seed
are partitioned at all and ~90 of ~120 rooms are at depth 0. The lever for
"most civilians will not run deeper into a building" is `mapgen` partitioning
ordinary blocks, the same conclusion as **Barricading** above and the same
reason it has not been done.

### Running from one zombie into another

Reported as *"civilians will sometimes keep running back towards zombies, see
the zombies, run away, and turn around back towards them"*. It is an
oscillation **between two threats**, not a hysteresis on losing sight of one,
and CLAUDE.md had already written down the fix without applying it here:
`dodgeThreats` existed for bots, and the note beside it said *"`skirtThreat` is
the civilian version and reads only `threatX/threatY` — the one tracked threat,
which is routinely not the one it is about to run into."*

`skirtThreat` is gone and everybody runs `dodgeThreats`. Two things change: it
reads **every** threat in `threatPoints` rather than the single tracked one, and
it scores **both** ways round against all of them rather than taking the first
side that is merely walkable — which is how somebody sidesteps out of one
zombie's path and into the rest of the pack. `BOT_DODGE_*` lost its prefix
accordingly.

Measured live, alternating the two behaviours every 300 ticks on the same
evolving city, counting **spells of walking at a zombie the civilian can see**:
**753 → 656, 288 → 193, 723 → 560** — fewer in 3 of 3 cities, 13-33% — and the
tick got *cheaper* with it, **4.06 → 3.74, 2.60 → 2.46, 3.41 → 3.15ms**, since
fewer people are grinding into things.

**A "shun what you just ran from" memory was built for this and thrown away,
and the reason is worth keeping.** It remembered where the threat was for 15s
and scored every candidate destination against the walk to it. On the live
metric it looked fine; on the staged rig it made things **worse — 2 returns
into sight became 9** — because it is a lockout, and a lockout leaves the
oscillator running: they turn away, the memory lapses, they turn back, round
again. That is the same objection already recorded against a change budget
under **And a margin is what stops them dithering**. Deleted rather than tuned.

*Three measurements of this were wrong before any of them were right*, and all
three are the same lesson:
- **`queryCircle` is a bounding box.** It hands back bodies out to 424px on the
  diagonal against a 300px sight radius, and `senseThreats` re-checks
  `dist <= sight`. A probe that does not put the "wander" share at 42% on a
  sample that turns out to be zombies at **359-384px** — people walking at
  things they cannot possibly see.
- **The gap between two bodies is not a measure of who is walking where.** A
  zombie is faster than a fleeing human by design, so the distance closes while
  they run for their life: measured that way, `flee` reads as "46% of samples
  spent closing on it", which is the chase working. It has to be the civilian's
  own step against the bearing to the thing.
- **Live is the wrong place to look for this at all.** Skirting a wall, going
  round a doorway and being unstuck flip the sign several times a second, on top
  of a signal of a few events a minute. `server/crowdcheck.ts` is staged for
  that reason, pins the zombies, and runs both behaviours on the *same* city
  back to back — unpaired, it put 31 people in one mode's rooms and 7 in the
  other's.

### Doors

Hung in every way into a building and in `INTERIOR_DOOR_SHARE` of the openings
between rooms; half start open. Shut doors are solid to movement, sight and
gunfire, and carry DOOR_HEALTH (1600).

**A door claim has to be able to lapse, and could not.** `busyBy` says somebody
is working this handle and nobody else may start, and only `finishDoorWork`
ever gave it back — so anyone dragged off a handle, shot, or *turned* (which
hands them a fresh AiState with no memory of the door) left it claimed for the
rest of the round. `doorTick` then bows out for everyone, and since the nav
grid plans routes as though every door were open, the whole room keeps walking
into it. **That is the "officers stuck in a room" case, and civilians got it
too.** `doorBusyForOthers` is now the only way to ask, and it drops a claim
whose owner has left the world or whose deadline (`busyUntil`, set by
`claimDoor`) has passed. Both are needed: turning leaves the entity in the
world, and being shoved off a handle leaves it alive but past its deadline.
Measured before the fix, one 120s run had a door claimed by a dead entity for
726 consecutive ticks.

**A charge takes a door off its hinges.** `blastDoors`, called from `detonate`,
so a frag off the belt and a launcher shell both do it. Rated against
DOOR_HEALTH rather than against what a blast does to a body
(`BLAST_DOOR_DAMAGE_MAX` 2000, `MIN` 800) — a grenade that merely scratches a
door is one nobody would ever throw at a door. Measured: point blank takes down
116/116 doors in a city, at 92% of the blast radius 86 are hurt and standing
and all 86 go down to a second charge, and beyond the radius nothing is
touched. There is deliberately **no line-of-sight test to the door itself** —
the door is what is being asked about, and a ray to it is blocked by the very
slab in question. What stops a blast reaching round a corner is the check on a
point 10px *short* of the slab, on the side the charge went off. Bushes are
waved through; a hedge does not stop a blast.

A door an officer bolted (`playerLocked`) is one no civilian will unlock or
open. Civilians can draw the bolt on each other's locks from the inside, taking
`DOOR_NPC_UNLOCK_MS`, which is what keeps a locked city from seizing up.

Player actions all run on one key: the press arms the *hold* action and a
release inside `TAP_MAX_MS` performs the tap instead. Completing an action
latches the key (`doorSpent`) until it is physically released — otherwise still
holding E after the bolt goes across immediately starts drawing it back.

**Doors are deliberately not in the nav grid.** Routes are planned as though
every door were open, and whoever is walking deals with the door when they
reach it. That is what makes finding one locked a discovery rather than
something the pathfinder quietly steers around — and it keeps opening a door
off the "rebuild the grid" path, which flipping cells 30 times a second would
otherwise demand.

They *are* in `hasWallClearPath`, which is a different question and the one
that matters for anything solid: that function has exactly one caller — the
straight-line shortcut in `headingToward` — and what it asks is whether you can
**walk** there. A parked vehicle is now in both it and the grid, and being in
only one of the two is the same as being in neither. See **The radio**.

### The park

Reserved ground like any other landmark, but with two rules of its own.

- **It goes anywhere on the map.** It used to be staked out first, clamped to
  within 11% of the centre, and everything else worked around it. Now the
  corner complex — the one thing that claims its ground outright rather than
  sampling for it — goes first, and the park takes the next pick from the whole
  map, retrying on a clash. Measured over 12 seeds its centre lands anywhere
  from 16% to 84% across and 21% to 78% down, and it overlapped a building in
  0 of them.
- **It thins toward its edges** (`PARK_EDGE_FADE`, `PARK_EDGE_DENSITY`), so you
  can see into the trees from the street instead of meeting a wall of them.
  The thinning is a rejection that **drops the bush**, not one that re-rolls its
  position: re-rolling only moves it inwards, which thickens the core rather
  than thinning the edge. Measured, the edge sits at 56% of core density, which
  is what the curve asks for; with the re-roll it was 75%.
- **A dirt path runs right across it**, in one side and out the other with a
  couple of kinks — dead straight reads as a road. Nothing grows within
  `PARK_PATH_WIDTH / 2 + PARK_PATH_CLEARANCE` of it, and that applies to the
  *general* bush scatter as well as the park's own fill; the scatter runs over
  the whole map and was dropping bushes on the path until it was told about it.
  Measured: 0 bushes on the path across 12 seeds.
- **Its ends are flat, and they fray.** `lineCap` is butt rather than round —
  a track worn through grass stops where people stopped walking, and a domed
  cap reads as a lozenge lying on the lawn rather than as a way in. A scatter
  of loose dirt spills off each end (`PARK_PATH_END_*`), because a flat cap on
  its own is too clean a line to look walked.
- **A lamp post stands at each end**, set back and off to one side the way one
  stands beside a gate, throwing a faint yellow pool. Derived from the path
  polyline the client already has — the two ends are its first and last points
  — so it costs nothing on the wire and cannot drift out of step with where the
  path actually runs.
- **The dirt texture is hashed, not stored and not rolled.** `PARK_PATH_SPECKS`
  of grit and scuff, positioned off the speck index, so it is identical every
  frame with no per-frame state. The park is the most overdraw-sensitive thing
  on screen — see the note on `drawBushes` — so it is a fixed count of small
  opaque blobs rather than anything translucent and overlapping.
- **The path needs no nav or collision work.** Bushes slow you down, so a clear
  line through a thicket is the quick way through without any rule saying so.
  It is drawn under everything as ground, one stroked polyline with a wider
  faint pass beneath for the soft edge.

### A grab is short, and it is a coin toss

`GRAPPLE_MIN_MS` 1s to `GRAPPLE_MAX_MS` **2s**, rolled as the **average of two
randoms** rather than one. That makes it triangular: mode and mean both land in
the middle and both ends are rare, where a flat roll over the same range gives
the same average while making the shortest scuffle and the longest pin equally
likely. A grab wants a typical length you can learn.

**The ceiling came down 3s → 2s and the odds went up to match**, and the second
half is not optional. A grab is half the event it was in duration, so leaving
`INSTANT_INFECT_BASE` where it was would have quietly halved the rate at which
an outbreak actually converts anybody. It is **0.5** now, against 0.05 — a grab
is a coin toss between turning on the spot and getting away bitten, where
before, turning on the spot was a rarity and the incubated bite was very nearly
the only outcome.

- **The clean getaway takes its 10% off the top**, so the share of grabs that
  actually turn somebody is 0.90 × 0.5 rather than 0.5. Measured over 600
  staged grabs: **46.0%** turned by one zombie, 52.7% by two (the
  `INSTANT_INFECT_PER_EXTRA_ZOMBIE` step), with 9.5% and 8.8% walking away
  clean. If an exact 50% is ever wanted it is `BASE_ESCAPE_CHANCE` that has to
  move, not this constant.
- **Nothing outlasts the ceiling** — 2000ms across those trials. The *floor*
  is no longer `GRAPPLE_MIN_MS`, because an escape can land at any point inside
  the grip: held times now start at tens of milliseconds. See below.

A vest is the exception and stays at `KEVLAR_GRAPPLE_MS` — half a second of
scuffle it loses, which is the point of wearing one.

**This is the largest balance change in the file and the staged figures do not
show it.** A grab is a coin toss now rather than a one-in-twenty, so the
outbreak compounds from the first minute instead of building through incubated
bites. Measured on the same harness, same machine, same 120s, three cities
either side of the change: **zombies alive 57 / 27 / 110 → 295 / 168 / 375**,
and **survivors 456 / 487 / 398 → 219 / 322 / 141**. Roughly three to six times
the horde and about half the city left alive. The map is not seeded and runs do
vary wildly, but the ranges do not overlap and the direction is the same in all
three. `INSTANT_INFECT_BASE` is the knob if that is too far.

*Note the target-churn figures rise in that same run — 0.206-0.245 → 0.349-0.407
switches per zombie-second — and that is not `ZOMBIE_TARGET_STICK` regressing.*
There are three times as many zombies with three times as much prey in reach,
so there is genuinely more worth switching to. The ratio against the gated-off
behaviour holds at about 2.2x, which is the figure that means anything.

#### Three of them and it is over

`GRAPPLE_NO_ESCAPE_AT` (3) is now one threshold doing three things: the escape
roll is skipped, the grip is pulled in to `GRAPPLE_PILE_TURN_MS` (1s), and it
ends in a turn rather than in a roll. Measured over 600 piles: **100% turned,
every one of them at 1033ms.**

- **One constant for all three, deliberately.** Being swarmed is a single state
  — the moment the fight stops being a fight — and split across three numbers
  that happen to be 3 they would drift into a pile you cannot escape but can
  survive, or one that turns you without ever having been unescapable. It is
  the same figure as `MAX_GRAPPLERS`, so "three or more" is exactly three in
  practice: nothing lets a fourth take hold.
- **The pull-in is a `Math.min`, and that is load-bearing rather than
  defensive.** The older rule — that a joining zombie can never *lengthen* a
  grip — still holds, and a plain assignment would have broken it the moment a
  third arrived late to a scuffle already due to end. Measured both ways: a
  300ms grip stays **+300ms** when the third joins, and a 1900ms grip is pulled
  in to **+1000ms**.
- **Kevlar still wins outright**, because it returns long before any of this.
  Measured against a full pile of three: **0% turned, 0% bitten, 100% clean**,
  at the vest's own 533ms. "Cannot be infected" stays absolute.

#### Letting go was not the same as getting away

Reported as *"most do not have enough speed to get away once they get out of a
grapple and just end up getting grappled again by the same zombie"*. The
diagnosis was right and the cause was not speed at all.

**Nothing made a released victim un-grabbable.** Only kevlar and the shield
ever set `world.grappleImmune`, so the zombie standing on them simply took hold
again on the next tick. Measured before the fix: **100% of releases re-grabbed,
median 33ms — one tick — and the victim never got further than 31px against a
32px grab reach.** They were re-taken before they could take a step.

- **Raising `ESCAPE_SPEED_MULTIPLIER` on its own would have done nothing
  visible**, and that is the point worth keeping. At any multiplier one tick is
  a few pixels: 1.5 → 1.9 moves the victim 4px instead of 3px in the 33ms
  before the zombie has them again. The fix had to be a *window*, not a speed.
- **`ESCAPE_IMMUNE_MS` (800) is that window**, granted by `getsClear` to every
  release — the clean break *and* the far more common bitten-but-standing one.
  Longer than `KEVLAR_IMMUNE_MS` on purpose: a vest buys a breather inside a
  fight that is still going, where this has to break contact outright.
- **The speed then decides what the window buys.** 1.9 puts a fleeing civilian
  at 158 px/s, ahead of even the fastest *fresh* zombie (133), while the one
  that just let go is winded to 47-66 by `ZOMBIE_POST_GRAPPLE_SLOW`.
- **`ESCAPE_BOOST_MS` went 1400 → 4000, because 1400 was a sprint rather than a
  flight** — reported as exactly that. The cliff at the end was the problem: the
  burst stopped a full second *before* the zombie finished winding, so the
  victim dropped to `HUMAN_FLEE_SPEED` — below every zombie speed — while the
  chase was still on. At 4000 the last 1.4s are spent outrunning a *recovered*
  zombie, which is what turns a delay into an escape. Swept on open ground with
  no cover:

  | burst | re-grabbed after | ground made | clean away |
  |---|---|---|---|
  | 1400ms | 4000ms | 138px | 4% |
  | 2600ms | 5600ms | 238px | 1% |
  | **4000ms** | **6467ms** | **269px** | **17%** |
  | 6000ms | — | 225px | 32% |

  Past 4000 it goes bimodal — a third get away outright and the rest are caught
  early against geometry — so a single figure stops describing it.
- Measured after, same rig: **0 re-grabbed within a tick, 22% still free after
  9s, median 5467ms to re-grab among those caught, and 211px of ground**
  against a 32px reach.
- **The ones still caught on open ground are correct, not a shortfall.**
  `HUMAN_FLEE_SPEED` is deliberately below every zombie speed, so once the burst
  expires the chase resumes and the zombie wins it. Raising *that* is the thing
  not to do — see **NPC speeds are all scaled together**. What a release buys is
  five-odd seconds and a couple of hundred pixels, which is time to reach a
  door, a building or a crowd. The rig has none of those, so it is the floor on
  how well this works rather than the figure.

**An escape now happens at a random moment inside the grip, not on the
deadline.** `BASE_ESCAPE_CHANCE` is rolled in `attemptGrab` as the grip is
taken, and `GrappleSession.escapeAt` is when it will break; the tick loop
checks it ahead of `endsAt` because it is by definition the earlier of the two.
Resolved at the end, every escape looked identical — the full struggle, then
release. Measured over 20,000 grips: **10.0% will break**, spread across the
window at 19.6 / 20.6 / 19.8 / 19.9 / 20.1% by fifths, reaching both ends.

- **A pile revokes it.** `escapeAt` is cleared once `GRAPPLE_NO_ESCAPE_AT` have
  hold — a getaway already rolled has to be taken back rather than left to fire
  out from under the pile a moment later.
- **The armoured are left out of the roll**, since a vest already guarantees no
  infection and spending a charge is what one costs. Without that, an early
  escape would hand them the outcome for free and quietly make kevlar last
  longer than three grabs.

**At the city level this is a wash, and it was not meant to be one.** Same
harness, 120s, three cities either side: zombies **295/168/375 → 169/305/309**
and survivors **219/322/141 → 342/208/182** — medians barely moved and the
ranges overlap heavily. That is the honest result: only 10% of grabs end clean,
and the other 90% now get away *while infected* rather than being re-grabbed,
which changes how a grab plays without changing how fast the outbreak spreads.

`server/grapplecheck.ts` covers all of it, and the release check is the one
that matters most because **the bug was an absence rather than a line** —
nothing granted immunity, so there was nothing to read wrong. Put back
deliberately, it fails 3 checks and reproduces the original 33ms and 28px
exactly.

### A joining zombie can shorten the grapple clock, never lengthen it

`endsAt` is set **only inside `if (!session)`** in `attemptGrab` — creating the
session. Everything after that is `session.zombieIds.add(e.id)`, so a second
zombie piling on inherits the deadline the first one set and cannot push it
back. Measured with a staged pile, on the older 1.0-2.2s window: the deadline
was +1805ms when the first grabbed and +1805ms after a second joined, moved by
**0ms**, and it resolved at +1833ms — one tick past, which is the 30Hz
granularity.

**The third one is the exception, and it only ever pulls the deadline in** —
see **Three of them and it is over**. That is written as a `Math.min` precisely
so this section stays true: the rule was never "the deadline is immutable", it
was "nobody gets to buy the victim more time by joining". Measured after: a
300ms grip is still +300ms with three on it, and a 1900ms one becomes +1000ms.

What *can* look like a reset is a fresh grab: `resolveGrapple` deletes the
session, and a zombie still stood on you starts a new one with a new deadline
on the next tick. That is a second grapple rather than a lengthened one, and
`world.grappleImmune` — the window kevlar and the shield buy — is the only
thing that interrupts it.

### How a gun is held

**`ItemDef.grip` decides the profile, not the drawing.** Absent is the pistol
everyone used to get whatever was actually in their hands — both arms out to a
grip on the centre line. `grip: 'rifle'` is shouldered instead: butt into one
shoulder, the support hand well down the forestock, and the weapon lying off to
that side rather than straight out in front. Currently on the bolt action, the
semi-auto, the sniper, the heavy MG and the charge rifle.

- **The wire carries `held`**, the item id, and only for officers and only when
  it is not the pistol. A handful of entities pay a short string; the four
  hundred civilians and zombies pay nothing.
- **The arms and the weapon are drawn in two passes**, either side of the
  torso, so the gun lies *over* the shoulder instead of vanishing under the
  body. `riflePose` is computed once and shared by both — derive it twice and
  the hands drift off the gun the first time a number changes.
- **The two arms do different jobs and are drawn differently.** That asymmetry
  is what reads as "rifle" from above; a symmetric pair reaching to a point in
  front reads as "pistol" no matter what is drawn at the end of it.
- Measured off the canvas, gun pixels relative to the body: pistol sits **0.09
  radii** off the centre line, the rifle **0.76** — and 4903 px of weapon
  against the pistol's 351.

### Items, orders and scenery

- **Kevlar denies a grab outright** rather than soaking damage: the grapple
  lasts half a second, ends with no infection, and spends one of three uses.
  It is an early return in `resolveGrapple` — the escape and infection rolls
  below it never run, which is what makes "can't be infected" absolute.
  Shrugging one off also buys `KEVLAR_IMMUNE_MS` where **nothing can lay a hand
  on you at all** (`world.grappleImmune`). Without that window the vest is worth
  almost nothing in the only situation it exists for: in a crowd the next zombie
  grabs on the same tick the last one let go, and all three uses are gone inside
  a second and a half with the wearer never having moved. The zombies keep
  chasing meanwhile — they just can't get a grip.
- **The grenade launcher is never in the loot table.** Rarity 0 keeps it out by
  construction and it gets one roll for the whole city, so most rounds have
  none. Its shell and the smoke grenade are both real projectiles that bounce.
- **`ONE_OFF_ITEMS` is a quota; `GUARANTEED_ITEMS` is a floor.** The one-offs
  are out of the loot table entirely and placed exactly once. The rare guns
  stay *in* the table and are only topped up when a city rolled none — at
  rarity 1 a gun that is missing from the map altogether is a worse kind of
  rare than a scarce one. Both take over an ordinary loot spot, and both skip
  spots already holding a placed item so the second placement can't eat the
  first.
- **`ITEM_CITY_CAP` is the third of that set: a ceiling.** Currently one entry,
  `radio: 2`.
  - **Rarity is a weight, not a scarcity, and the radio is why that matters.**
    At 2 of the 37 entries in `UTILITY_LOOT` it takes 5.4% of every utility
    roll, and a city rolls once per building — so the expected count is about
    *three*. Measured over ten cities before the cap: min 1, median 3, max 6,
    with five of the ten holding three or more. Each radio is a van, a SWAT
    team and two patrol cars, so a round with three of them is the garrison's
    problem being solved out of a pocket. Reported as three vans in one round,
    which turned out to be the ordinary case rather than a fault.
  - **Nothing was spawning them.** Checked before changing anything: **0 of 50**
    bot officers spawn holding a radio, and the debug heap is not the city's
    loot. 29 of 31 came from the plain building/park roll.
  - **Lowering the rarity would not have done it.** That makes three unlikely
    rather than impossible, and it makes the radio scarcer in the ordinary case
    too — which is not the complaint, one or two is right. A ceiling leaves the
    common case exactly as it was and cuts only the tail.
  - **A capped draw is re-rolled, not dropped**, so the house still gets its
    utility and the amount of loot in a city is untouched — only the mix moves.
  - **It has to cover every way onto the map or it is not a ceiling.** The
    building roll, the park stash and the pond bank all draw from a table and
    all go through one `drawItem` in `spawnPickups`. The every-utility floor
    needs no telling, since it only fires when the city has none at all.
  - Counted by **scanning what has actually been placed**, not by a tally.
    Placement can fail — the park gives a spot 24 tries and may come away with
    nothing — and a tally incremented at the draw would count items that never
    landed.
  - Measured over 12 cities after: radios **min 1, median 2, max 2**, ten cities
    at 2 and two at 1, **0** over the cap and **0** with none. Guns missing 0,
    utilities missing 0, one-offs exactly 1 in all 12 — so the floor and the
    quota still hold underneath the ceiling.
- **The ammo box can refuse to be picked up.** Utilities report `used`,
  `carry` or `refuse`; holding the pistol or a full gun leaves the box on the
  floor rather than wasting it.
- **"Follow me" and "wait" share one charge.** The charge is spent on release,
  not on the call, so one buys a full cycle. The wheel takes an option list
  with per-entry usability rather than one shared count.
- **Four guns carry their behaviour in `ItemDef`, not in branches.** The
  **bolt action rifle** is the common one — pistol cadence, far tighter, and
  `slowMs`/`slowMul` make a hit stagger longer than anything else. The
  **sniper** sets `scope`, which pulls the client's camera back *and* widens
  `sightRadiusFor` on the server — without both you'd be aiming at ground the
  fog never sent you. Its `headshot` kills when the round arrives inside
  `HEADSHOT_ARC` of the way the zombie is facing: a shot between the arms, so
  the one charging you is the one you can take the head off. The **heavy MG**
  is hopeless from the hip until right-click plants it (`DEPLOY_MS`); the
  player is rooted from the moment they commit, not from when the pegs land.
  A second right-click **packs it up**, which takes `UNDEPLOY_MS` and roots you
  for that too — getting up is a decision, not a free cancel. `world.stowing`
  records how far up it had got, so a bipod cancelled halfway drains the gauge
  from halfway rather than snapping to full, and the draining gauge is the only
  thing telling the player why they still can't move.
  The **charge rifle** fires on release, not press, in **four discrete bars**.
  One bar is one body, each bar after that is one more, and the fourth also
  drives the round through one wall or door — `throughWall` in `fire`, which
  skips exactly one blocker in the sorted list. Below the first bar it doesn't
  fire at all and costs nothing, so a mis-click isn't a wasted round.
  Bots share `fireHeld` and so fire all of them, at full charge.
- **Firing on whole bars is what lets the gauge tell the truth.** The charge
  rifle used to fire on the raw held fraction, which no four-segment readout
  can honestly show. `drawChargeBars` and the server both quantise to
  `CHARGE_BARS`, so what you see filled is exactly what you get.
- **The heavy MG is a pinning weapon, not a killing one.** Its damage was cut
  to 4-8 and `slowMs`/`slowMul` added, because at 110ms cadence it was doing
  bolt-action work ten times faster than the bolt action. A held burst now
  stops a charge dead without dropping much of it.
- **Every gun *and every utility* is in every city, derived from the registry.**
  `GUARANTEED_ITEMS` was a hand-kept list of the rare ones, so adding a gun and
  forgetting to list it produced maps that simply didn't have it.
  `GUARANTEE_EVERY_GUN` and `GUARANTEE_EVERY_UTILITY` walk `ITEMS` instead —
  rarity 0 excluded, since those are placed by their own roll, and the pistol
  excluded because you always have one. That is 9 guns and 15 utilities.
  Measured over six cities: 96-117 items, **0** guns and **0** utilities
  missing in any of them.
  - **It survives a small city, which is the case that could have broken it.**
    Loot follows the buildings, so it scales on its own — but the floor needs
    somewhere to *put* what a smaller roll missed, and `placeSomewhere` only
    gets twelve tries at a house of its own before falling back to a takeover.
    Measured over four cities at each of three settings: 113 / 75 / 46 pickups
    at 500 / 300 / 100 population, **0** guns and **0** utilities missing at any
    of them, and the one-offs still exactly one each.
  - **The floor adds loot rather than displacing it.** It used to take an
    ordinary spot over, which was fine when it was four rare guns and is not
    when it is two dozen items — a third of the city's loot would have been the
    guarantee eating the roll. `placeSomewhere` puts it in a house of its own,
    and only falls back to a takeover if twelve tries find nowhere to stand.
  - **Utilities used to be deliberately *not* guaranteed**, the idea being that
    every city should be missing something. With fifteen of them that meant the
    one piece of kit a round was built around simply wasn't anywhere, and there
    is no way to tell that from inside the round. The scarcity worth keeping is
    `ONE_OFF_ITEMS`, which is still exactly one per city.
  - **`freeSpots` asks by pickup id, not by item.** The floor now covers nearly
    the whole registry, so a set of already-placed *items* would leave nothing
    takeable at all; `loot-oneoff-` and `loot-min-` ids are what is off limits.
- **Every gun bar two took a 10% cut**, rounded to whole numbers: pistol 15-25
  → 14-23, bolt action 42-64 → 38-58, sniper 70-95 → 63-86, and so on down the
  registry. The **charge rifle** and the **flamethrower** are exempt — the
  charge rifle's whole point is the top bar landing hard, and the
  flamethrower's damage figure is 1-2 because the *fire* is the weapon and
  cutting it would mean nothing. `GUN_DAMAGE_MIN`/`MAX`, the unnamed default a
  grey officer with no gun falls back on, is deliberately left alone: it is not
  a gun in the registry and nobody asked for ambient officers to be nerfed.
- **The city is meant to be full of three guns.** `boltRifle`, `machineGun`
  and `shotgun` carry the weight (12/11/9) and every rare stays at 1, so
  raising them makes the common guns commoner rather than everything commoner.
  Between the two sit `semiAutoRifle` and `chargeRifle` at 5 — a middle tier of
  guns you neither trip over nor go a whole round without.
- **The semi-auto rifle is the bolt action's rate, at the bolt action's cost.**
  Same class of round; two and a half times the cadence (470ms against 1150),
  three times the bloom, less damage a round and a lighter stagger. It is what
  the bolt action is *for* — one careful shot — given up for volume.
- **A house rolls for a gun and a utility separately.** They used to compete
  for the one item a building could hold, which is why a house with a rifle in
  it never also had a vest. `GUN_LOOT` and `UTILITY_LOOT` are separate weighted
  tables derived from the registry.
- **The debug heap is not part of the city.** `TEST_DROP_ALL_ITEMS` used to be
  laid down by `spawnPickups` at world generation, which put one of every item
  in the game on the map before anybody had joined: bots walked to it, fought
  over it and kitted themselves out of it, and every measurement of how loot
  behaves was taken against a pile that would never exist in a real round.
  `dropDebugKit` is called from `spawnPlayer` and from the respawn loop in
  `resetWorld` instead, so it follows whoever spawns. Ids are
  `loot-test-${owner}-${i}`, so a second player gets their own pile and the
  same player respawning repositions theirs rather than stacking a new one.
  Measured over six cities: **0** debug pickups in a generated city, +27 the
  moment somebody spawns.
- **Bots may not shop from it either.** `lootWanted` skips any `loot-test-` id,
  the same test `inACity` uses. A bot within `BOT_LOOT_RANGE` of a player's
  heap helped itself and took the **radio** first, since it scores highest of
  anything on the belt — a free van and a free SWAT team that no real round
  would ever hand out, and a quiet skew on every measurement taken with the
  flag on.
- **The every-gun floor still ignores it**, via `inACity` excluding any
  `loot-test-` id — the heap can now appear mid-round, and counting it would
  have the guarantee satisfied by test items while the buildings went without.
- **Some loot is hidden in the park.** `PARK_LOOT_COUNT` (5) items rolled on
  `PARK_LOOT_GUN_SHARE`, plus `PARK_LOOT_GUARANTEED_GUNS` and
  `PARK_LOOT_GUARANTEED_UTILITIES` (one each) that are not left to the roll —
  five coin flips come up all one kind often enough, and a park with nothing in
  it worth carrying a gun for is a park nobody walks into twice. Every one has
  to be within `PARK_LOOT_COVER` of a bush — the point of putting loot in the
  park is that you go into the trees for it rather than spotting it from the
  road. Kept `PARK_LOOT_PATH_GAP` clear of the dirt path for the same reason:
  something lying on the one clear line through is not hidden at all.
  Measured over six cities: 7.0 per park, at least one gun and one utility in
  every one, 0 near the path, 0 out in the open.
- **A pair of rare things on the bank of the duck pond.** One gun and one
  utility, both out of `rarestOf` — the scarcest tier that still appears in the
  loot table, derived rather than hand-listed so a new rare is covered the day
  it exists. Currently that is sniper/heavyMg/flamethrower/cureGun and
  shield/gunner/sling/beacon/goggles/radio/pack.
  The pond was the one landmark with nothing to do in it: ornamental water, a
  flock of ducks, and no reason to walk over. The two are placed
  *independently*, so finding one is not finding both and you have to work
  round the water for the other. Positioned by bearing off the pond's centre
  and then out past `pondRadiusAt` — the edge is a radius-per-bearing, not a
  circle, so that is the only honest way to sit on the bank all the way round.
  Measured over eight cities: 2/2 every time, both on the bank, 0 in the water,
  0 unreachable, all within the band.
- **A second pistol is the other hand, not a gun.** It costs no slot: `collect`
  sets `inv.dual` and slot 0 becomes `dualPistols`. It fires **two rounds a pull
  down parallel lines** — `pellets: 2` with `parallel: 9`, which offsets each
  round sideways from the body's centre line rather than spreading it by angle
  the way a shotgun's cone does. The wobble is rolled **once for the pull** and
  both barrels take it; roll it per pellet and the two lines splay or converge,
  which is precisely what stops it reading as two guns. Still unlimited, and
  slot 0 stays undroppable either way.
- **`dualPistols` must never reach the floor as an item.** It is a real entry
  in `ITEMS` — it has to be, it is what slot 0 becomes — and `rarity: 0` keeps
  it out of the loot tables, but `TEST_DROP_ALL_ITEMS` walked the registry and
  dropped one anyway. Taken as an ordinary gun it lands in a slot with no
  rounds in it and never sets `inv.dual`, which reads exactly as "dual pistols
  don't work and don't replace the pistol on slot 0". Fixed at both ends: the
  debug pile drops a *pistol* — which is the thing actually worth testing,
  since you start with one — and skips `dualPistols`, and `collect` treats a
  `dualPistols` pickup as a second pistol so nothing downstream can end up
  holding one whatever put it there.
- **`kind` says what a thing is; `utilitySlot` says where it goes in the bag.**
  Two separate questions, and the **cure gun** is the case that proves it: it
  rolls on the gun loot table and fires through the gun path, but it rides in a
  utility slot, because it is medicine and should never be the reason you leave
  a rifle on the floor. Its doses count down in the one slot the way grenades
  and kevlar do (`inv.cureDoses`), and the slot clears itself when they run
  out. `heldGunSlot` is null for it, so `fireHeld` spends a dose rather than a
  magazine.
- **Bots knew how to use the cure gun all along and could never get one.**
  `cureTick` has been fully written the whole time — it ranks curing *above*
  shooting, since a cured neighbour is one fewer zombie a minute from now — but
  `lootWanted` scored the cure gun down the gun branch, where worth is damage
  per pull, and the cure gun's is zero. Every bot in the city walked past every
  cure gun in it. It is scored by hand now.
- **The sling and the pack are worn, not slotted.** They are flags on the
  inventory rather than entries in `utilities`, so they take no number key at
  all — a thing you have on, not a thing you select.
- **Slot counts are per-bag, not constants.** `gunSlots()` and `utilitySlots()`
  read those two flags, and the wire
  carries both so the HUD draws only the cells that bag can actually use. The
  numbering is **contiguous** — a gunsling shifts the utilities along by one and
  the HUD renumbers with them, so what is on screen is what the key selects.
  With both worn that is 13 slots against ten number keys; the scroll wheel
  already walks the bar, which is how the last few are reached.
  - **`inventory.gunSlots` is the count; `inventory.guns.length` is the array**,
    and the array is *always* the full `GUN_SLOTS + GUNSLING_SLOTS`. They agree
    only while a gunsling is in the bag, and the client's `heldItemId` was
    mixing them: without a sling the bar numbers the utilities from 4 while it
    read slot 4 as the fourth *gun* slot — the one the sling would open — found
    it empty and answered `null`. Everything the client gates on the held item
    then quietly stopped: **no beacon map, no scope reticle, no charge bars, on
    every bag without a sling in it**. The server never had it; `heldItem`
    there has always asked `gunSlots(inv)`. Anything indexing the bar must use
    the same arithmetic the HUD numbers it with, or it is right only by luck —
    and the luck here was a test player who happened to pick up a gunsling,
    which is why it survived a session of driving the real client.
- **Taking the pack off is refused rather than resolved.** Dropping a backpack
  while over the base capacity would have to spill something, and choosing what
  to spill on the player's behalf is worse than saying no.
- **A duplicate gun is ammunition, not a gun.** Picking up a second of
  something already in the bag strips it for its rounds rather than taking a
  slot — carrying two of the same is strictly worse than one loaded one, since
  you can only fire the one. Checked *ahead* of the free-slot case for that
  reason. Bots understand it through `lootWanted`, which scores a duplicate by
  how empty the copy they carry is (`BOT_REFILL_APPETITE`), so a bot with a
  full rifle ignores one and a bot down to its last few crosses the street.
- **Bots carry the belt too.** They value the radio highest (a van, a SWAT
  team, and two patrol cars after it, all of whom then stay with them), and
  `radioTick` works the handset the moment something comes into view — the
  radio fires on a *click* now rather than on pickup, and without that every
  bot in the city would carry one it never pressed. Then the sling and pack —
  worn, so free —
  then thermal, frags, mines and boots. A frag only goes at a cluster of
  `BOT_FRAG_MIN_TARGETS`, because a bot spending its last one on a straggler
  has nothing left when the street fills; a mine is only laid while `bolting`,
  since it is a thing you retreat over rather than a weapon.
- **Bots walk past the riot shield** (`BOT_IGNORES`). It already scored zero,
  having no damage figure; the set says so out loud so giving it one later
  doesn't send every bot after one.

### A sandbag wall is a thing to walk round unless you can eat it

Reported twice in one breath: *"civilians know how to navigate around sandbags…
if it is just a single sandbag go around it and not bump into it"*, and *"I'll
tell one to go to the other side of a barricade wall and they will just push up
against the wall instead of going around it."*

**The cause is a rule that was right when the only sandbags in the game were a
machine gun's.** The bags were given the doors' rule — out of the nav grid
entirely, routes planned as though they were not there, and whoever walks into
one deals with it — and that is *exactly* right for a zombie, because clawing a
wall down rather than strolling round the end is the entire point of building
one. It is exactly wrong for everybody else, who cannot take the thing apart and
has no business trying.

- **A second layer on the nav grid, not more entries in the first.** `soft` sits
  beside `blocked` and holds the destructible obstacles; `findPath` avoids it
  when asked and nothing else in the game sees it at all. The two are different
  questions — a wall is a wall to everybody, a sandbag wall is not — and
  answering them with one array means picking which half of the city to break.
- **`e.type !== 'zombie'`, in `headingToward`, and that is the whole rule.** One
  test in the one function that decides where a body walks. The dog is a zombie
  with a flag on it and is driven by hand anyway, so it needs no mention.
- **Two readers, not one, which the parked vehicle already paid to learn.**
  `headingToward` only asks the router when `hasWallClearPath` says the straight
  line is blocked — so a wall in the grid and not in that predicate is a wall
  every route is planned around and nobody ever asks for a route past. Measured
  on the van: 5 of 8 officers still failed to get by.
- **And `slideToward` is the third**, which the van did not need. That is where
  a body ends up when the search failed or the tick's budget was spent, and it
  fans out on `nav.isBlocked` — so without `isBlockedOrSoft` there it walks
  straight back into the wall the route was avoiding. The reported fault,
  arriving a second later by another road.
- **The string-pull has to know too.** It is what drops waypoints you can walk
  past, and asked without the soft layer it cheerfully cuts the corner the
  search had just gone round, handing back a straight line through the very wall
  being avoided.
- **Components are still labelled off `blocked` alone.** `isReachable` decides
  where a body may be spawned and where an order may be sent, and a wall
  somebody built across a street is not a decision about either — it is also
  gone the moment a zombie has finished with it.
- **The boxes are counted off the records rather than kept as a list**, the same
  shape as `buildSitesToWire`: a wall arrives when an officer stacks one and
  leaves when a zombie has finished with it, and a list somebody has to remember
  to strike from is a list that steers the whole city round a wall that is not
  there. `navDirty` is set at all four of those moments — built, torn down,
  emplacement deployed, its bags destroyed — and the tick coalesces it to one
  rebuild, which at a handful of walls a round is a handful of rebuilds.
- **Guarded on `size` in `hasWallClearPath`**, the way `speedAt` guards on
  `world.acid.size`. It runs once per walking body per tick and the ordinary
  case is a city with no sandbags in it at all; `Map.values()` allocates an
  iterator whether or not there is anything in it, and two of those five hundred
  times a tick is not nothing.

`server/sandbagnav.ts` is the harness — headless, no socket, no port.
`setSandbagsIgnoredByRoutes` is the gate and it is **kept**: the control is the
whole value of the run, and here doubly so, since half of what has to be shown
is that the horde did *not* change. Ten cities, one wall laid across a clear
lane with room round it, both behaviours on the same city:

| 340px lane, wall across the middle | OLD | NEW |
|---|---|---|
| commanded officer got to the far end | **0/10** | **10/10**, median 10.7s |
| …ticks spent pressed on the wall | 488 | **49** |
| civilian got to the far end | **0/10** | **10/10**, median 7.4s |
| …ticks spent bumping into it | 510 | **36** |

and the horde: a zombie's straight line is still clear through the bags
**10/10** while the route for anything alive goes round **10/10**, and a zombie
held at a wall still takes it from 900 to nothing.

*Three things about measuring this were the rig lying rather than the code
failing, and the third is the one worth remembering:*

- **Each kind arrives by its own rule.** `COMMAND_ARRIVE_DIST` is 26 and
  `RALLY_ARRIVE_DIST` is 46, so a civilian that had walked all the way round the
  wall and stopped exactly where a rally order tells it to stop scored **0/6**,
  at 44.7px against a 46px rule.
- **A zombie claws the bags from arm's length and never touches them.** A 4px
  contact test read *0 of 6 reached the wall* on runs that had taken it from 900
  health to nothing — the rig contradicting itself in the same table. It is
  `SANDBAG_REACH`.
- **A barricade is 52px long, so a zombie walking at prey on the far side
  slides round the end of it** — correct behaviour, and behaviour it has always
  had. An unpinned run therefore measures whether the zombie happened to clip
  the corner: the same code read 6/6 and 900 damage on one run and 2/6 and 0 on
  the next. **And the OLD/NEW comparison built on it was a dice roll**, because
  the two runs roll different zombie traits — CLAUDE.md's own rule about unpaired
  runs, with the traits standing in for the city. It read 900 against 816 on code
  that is identical for a zombie. The decision is checked exactly instead, on the
  two inputs that make it, and the behaviour is pinned.

### The pocket gunner

A utility that puts down a grey officer behind a machine gun and a wall of
sandbags, facing whichever way you were. `server/src/emplacement.ts` owns it.

- **The officer is an ordinary NPC entity.** It collides, it can be grabbed, it
  draws like any other. The emplacement record holds only what makes it a gun
  crew — which is why running dry needs nothing but deleting the record: what's
  left is already a grey officer with a pistol.
- **The bags are see-through and bullets go over them.** They are not in
  `hasLineOfSight` or in `fire`, only in collision — and in the nav grid's
  **destructible layer**, which is read by anything alive and not by a zombie:
  a zombie's routes are planned as though they weren't there and whoever walks
  into one deals with it, which is what makes them stand and tear at them
  instead of strolling round. See **A sandbag wall is a thing to walk round
  unless you can eat it**.
- **The bags are an oriented box**, not an axis-aligned rect, because they lie
  across whatever bearing the officer happened to be facing. `resolveCircleBox`
  and `closestOnBox` in `geometry.ts` are the whole of that.
- **The traverse is ±`EMPLACEMENT_ARC` from where it was planted.** A mount
  doesn't spin: anything behind it does not exist as far as the gun is
  concerned.
- It barely scratches anything. Its job is `EMPLACEMENT_SLOW_MUL` — holding a
  street, not clearing one.

### Being grabbed is a fight, not a cutscene

**A grappled officer can still work the trigger, at `GRAPPLED_COOLDOWN_MUL`
(5×) the cooldown** — an 80% cut to the rate. It is applied inside `fireHeld`,
against every cooldown in it, so a player, a bot and a grey officer all get it
from one place and no call site had to learn about it.

- **Everything else frozen still is.** `processShooting` and `updateAi` now ask
  `isInGrapple` rather than reading the `frozen` set alone: a zap mine is meant
  to put you out, and planting a bipod with something on your arm is not a
  thing anybody is doing. Only the grapple case is let through.
- **NPCs needed their own way in**, because `updateAi` skips a frozen entity
  outright. `pinnedOfficerTick` is that, and it is deliberately tiny — face
  whatever has hold of you and pull the trigger. No movement, no pathing, no
  looting, no turn rate: the arm is being held, so it fires where it already
  points. Measured over two seeds: 4 and 12 shots across 499 and 1008 ticks
  spent grappled, which is what a 5s cooldown buys.
- **It bailed out on the city's own officers for two years of code.** It opened
  with `const inv = ...; if (!inv) return;` — and a grey officer the city
  started with has **no inventory at all**: they shoot through `officerGrade`,
  not out of a bag. So every one of them stood mute and still while something
  ate them, and the only ones who ever fought back pinned were bots and the crew
  a radio sent. It falls through to the grade's own gun and cadence now, times
  `GRAPPLED_COOLDOWN_MUL` like everyone else. Measured with a dog latched on
  one: **2 rounds over 302 grappled ticks, taking the dog 90 → 40hp** — the
  anti-dog accuracy applies here too, which is exactly when it should.

### Turning

Being bitten and *turning* are separate things, and only the second one shows.
`TURNING_TELL_MS` (4s) before it happens the body bleeds from human green to
zombie red, and most of them say so.

- **The reddening is sent to everybody**, unlike `infected`, which only the
  zombie side and a cure-gun carrier ever see. The whole point of the tell is
  that whoever is stood next to them can read it and get clear, so a secret
  version of it would do nothing. It rides on `turning` (0..1) on the wire.
- **It is derived from the clock, not latched.** `toWire` reads
  `pendingInfections` and subtracts, so the ramp cannot drift out of step with
  the moment they actually turn.
- **The line is latched, because a line has to be said once.** `saidTurning`
  on the AiState, which is why a *player* turning says nothing — they have no
  AiState, and nobody narrates their own infection to themselves anyway.
- **Only an incubated turn gets a tell.** A grab that converts outright
  (`INSTANT_INFECT_BASE`) has no run-up to show, so most conversions in a busy
  round have none. Measured over two seeds: 76 and 59 conversions, of which 16
  and 19 incubated, and ~75% of *those* spoke — which is `TURNING_LINE_CHANCE`.
- **Going red makes you a threat, but never a target.** Anyone inside the tell
  window is fed into `state.threatPoints` by `senseThreats`, so the crowd runs
  from them, keeps clearance in `safestHeading`, and slams doors on them — they
  are treated as one of the dead. They are deliberately kept out of `nearest`,
  which becomes `targetId` and is what an officer aims and fires along. That is
  the same split thermal contacts use, for a stronger reason: nobody should be
  shooting somebody who has not turned yet. The rumour field is left alone as
  well — it records where *zombies* were seen, and they will stamp it
  themselves in a moment. Measured over two seeds: **0** ticks of any human or
  officer aiming at a body that had not turned, against 1278 and 3144 ticks of
  civilians fleeing with no zombie targeted at all.
- **A fresh one comes up slow, not stunned.** `FRESH_ZOMBIE_SLOW_MS` (1s) at
  `FRESH_ZOMBIE_SLOW_MUL` (0.65). A stun read as a bug — a thing standing
  frozen while you walked around it — where a body hauling itself upright
  reads as what it is. It rides the same `slowUntil`/`slowMul` every other
  stagger uses, set on the *fresh* AiState so nothing from its old life follows
  it over, which also means being shot on the way up stacks with it rather than
  arguing with it. Measured: every fresh zombie carries it, none are stunned.

### Aiming past your own screen

**The viewport is 1920×1080**, scaled by the page to fit the window keeping
16:9 — the backbuffer is how much *world* you see, not how big the window is,
and `input.ts` already maps client pixels back through `getBoundingClientRect`
so the scaling costs the mouse nothing.

**Raising it is not free, and the cost is not the pixels.** Everything derived
from the viewport grows: `CAMERA_PAN_Y` carries the difference between the axes
(580 now), and the three sight radii have to cover wherever the camera can put
the screen — **1540 / 1820 / 1950** against 860 / 1180 / 1500 at 960×600. That
is 3.1× the ground inside every viewer's fog, so roughly three times as many
entities are serialised to each of them every tick, on top of 3.6× the pixels to
paint.

**The fog paid for it, and `CAMERA_ZOOM` paid the fog back.** At 1080p with the
camera at 1:1 the polygon cost **6.4-16ms indoors with 15ms frame spikes**,
against 0.5ms at 960×600 — a rebuild at 12.5Hz costing 12-16ms blows a 144Hz
frame budget every time it fires.

- **Nearest occluder first, so a ray can stop looking.** Every wall contributes
  twelve rays and every ray was then tested against every wall — which is the
  square in "cost is roughly the square of the occluder count", and at a hundred
  walls it is 120,000 ray-rect tests and a **20ms+ tail that blows a frame
  outright**. A wall cannot be hit nearer than its own closest point, so with
  the walls ordered by that distance the loop finishes the moment one is further
  off than the best hit so far. Exact, not approximate: verified over **316,356
  polygon points with 0 mismatches and 0.00px drift** against the same file with
  the early-out removed. Measured head to head in one process: median **1.87 →
  0.57ms**, p99 **6.66 → 1.70**, worst **7.74 → 2.66**.
- **The fog cache has three inputs and the clock is not one of them.** Where the
  viewer is, how far they see, and what is in the way — and a door opening or
  shutting already bumps `doorEpoch`. The cache also expired every
  `FOG_UPDATE_MS` on top of that, which bought nothing and cost a full rebuild
  12.5 times a second: standing still, looking at a scene that could not have
  changed, was paying for an identical answer. Walking is unaffected, since
  `FOG_MOVE_EPSILON` is 21px and an officer covers that in about 77ms anyway.
- **Indoors is no longer the worst case, and that figure above is history.**
  The occluder clip is what fixed it: a room's walls and a street's walls are
  both culled to the same viewport box, so the polygon no longer cares much
  which you are standing in. Measured over 150 viewpoints of each: **indoors
  4.29ms median / 15.94 worst, outdoors 4.03 / 15.19.** Do not go looking for an
  indoor fog problem; there isn't one any more.
- **One visibility polygon costs more than drawing five hundred people**, and
  this is what makes a spectator *cheaper per frame* than a player — which is
  backwards from what anybody expects and was reported as such. A spectator
  computes no polygon at all (`drawFog` is skipped) and draws every body as a
  single dot below `ENTITY_DETAIL_SCALE`: **519 bodies for ~1.5ms and
  `fogpoly 0.00`.** A player draws a dozen bodies for well under a millisecond
  and then pays 2.5-8ms for the fog. What makes *spectating* expensive is
  nothing to do with drawing — it is the 56KB snapshot and 500 `copyInto` calls
  arriving thirty times a second.

**The lever is the zoom, not the pan.** Everything the fog costs is set by how
much *world* is on screen. Modelled across pan 50 to 90 the polygon's area moved
by three percentage points; going from 1.0 to 1.6 zoom took it to a third. So
the camera was pulled in rather than the pan cut back. Measured after, at three
spots including the same dense indoor block: **fog 0.90 / 1.18 / 2.48ms, spike
0ms**, and the sight radii fell out of it — 1540 → **970**, 1820 → **1240**,
1950 → **1380**, which is a third of the ground serialised per viewer as well.

- **The zoom multiplies the pan rather than fighting it.** What you feel is the
  camera moving in *screen* pixels, and those are world pixels times the zoom.
  `CAMERA_PAN_X` came down 160 → 100 → **80** as the zoom went 1.6 → 2.0, and the felt movement did not change at
  all: 100 × 1.6 is the same 160 screen px it was. The sideways pan was not sold
  to buy this.
- **`CAMERA_PAN_Y` is derived through the zoom too** — the 840px difference
  between the axes is a *screen* quantity, so in world units it shrinks with the
  zoom and the two axes still reach equally.
- **The fog mask needed the zoom and did not have it.** `drawFog` converts world
  coordinates onto a mask held at `FOG_MASK_SCALE` of the viewport, so the
  conversion is `FOG_MASK_SCALE * CAMERA_ZOOM` — while the *blur* is a screen
  quantity and stays on `FOG_MASK_SCALE` alone. Two scales that were the same
  number while the camera was 1:1, and are not any more.
- **The endgame is still not measured**: four hundred entities in view is what
  stalled this game once before (see the note on paint under performance).

**The camera is pulled in by `CAMERA_ZOOM` (1.6)** — the backbuffer stays
1920x1080 and you simply see less ground, larger: 960x540 world pixels rather
than 1920x1080. That is still more of the city than the old 960x600 build
showed, at nearly twice the fidelity.

**The camera pans with the cursor, and this is not a scope feature.** It exists
because the screen is wider than it is tall: without it you are aware of far
more street to either side than above and below. `CAMERA_PAN_Y` is **derived** as
`CAMERA_PAN_X + (VIEWPORT_WIDTH - VIEWPORT_HEIGHT) / (2 * CAMERA_ZOOM)`, so it
carries the difference between the two axes on top and evens them up. Derived
rather than written down so the two cannot drift apart if either the pan or the
viewport changes.

**But the pan must never carry you out of the frame, and the derivation alone
will.** Evening the axes up asks for 362 world px vertically, which at
`CAMERA_ZOOM` 1.6 is **580 screen px against a half-screen of 540** — so at full
vertical deflection the body you are driving sat 40px past the top edge, on any
ground the view clamp wasn't already pinning. The fog hole is centred on the
player and went off with it, leaving a screen of lit ground and the outer
falloff: no walls, no bodies, nothing. Reported as *"in different locations when
my cursor goes to a spot, everything but the floor and some fog stop
rendering"*, which is exactly what it looks like.

- **`PAN_KEEP_ON_SCREEN` (0.72) caps the vertical reach** at 243 world px. The
  derivation can go on asking for whatever it likes; the cap is what keeps the
  player in frame. The two axes no longer reach the same distance — 580 world px
  vertically against 700 sideways — and that is the trade.
- **The cap is on the pan only, never on `SCOPE_PUSH`.** An officer down a scope
  leaving the bottom of the screen is the intended Foxhole behaviour and
  `drawSelfMarker` exists for precisely that. A dog's `scopeReach()` is 0, so a
  dog can never leave the frame at all.
- **The view clamp is what hid this**, and it is worth knowing when re-measuring:
  near a map edge `cameraFor` pins `view.y` and the player stays put on screen
  however hard the pan pushes. Reproducing it live means standing well inside the
  map, which is why the honest measurement is the sweep below rather than driving
  a round and watching.
- Measured by replicating `updateScope` + `cameraFor` against the real constants
  and sweeping the cursor over a 41×41 grid of the frame, both pans in **one
  build**: uncapped, **28 of 1681** cursor positions put the player outside the
  frame, worst overshoot 40px, at the top and bottom edges. Capped, **0 of 1681**,
  and the player never comes closer than **151px** to an edge. Fog against what
  the server sends afterwards: 890/890, 1164 against 1180, 1294 against 1310.

**It applies to anything a person drives**, officer or dog. `updateScope` has no
branch on what you are at all — the pan is a property of the camera rather than
of what is in your hands. A dog's `scopeReach()` is 0, said outright rather than
left to fall out of the empty inventory the server sends it (which answers
"pistol", and so happens to have no scope — the right answer by accident).

**`CAMERA_PAN_X` went 60 → 160, and the reasoning behind 60 was wrong.** The
argument was that the screen is already wide so there is no *awareness* to win
sideways, which is true and still the wrong call: at 60 against a vertical 240,
running the mouse to the left edge moved the camera a quarter of a body width
while running it to the top moved half a screen. What you feel is the camera
moving, not the arithmetic behind it. The sideways-to-vertical ratio is 0.47
now, against 0.25.

**The three sight radii are derived from the pan, not chosen.** The fog has to
reach wherever the camera can put the screen and the server has to send entities
that far, so the pan and the zoom between them set all three. At 1920×1080,
`CAMERA_ZOOM` 2.0 and a pan of 80/194 the sampled corners are 704 / 996 / 1125,
and the radii are **720 / 1015 / 1145**. Move the pan, the zoom or the viewport
and re-derive them, or the far half of the screen goes dark. Note the zoom cuts
both ways: pulling the camera *in* shrinks how much world is on screen, which is
why it is the cheapest lever on fog cost and why these came down rather than up.

**`server/zoomderive.ts` is that derivation, so it never has to be done by
hand.** It replicates `cameraReach` and `fogRadius` exactly and prints, for a
range of candidate zooms, the world on screen, the pan, the three radii each
demands, and whether the current constants still cover the fog — validated
against the figures this section already quoted for zoom 1.6.

**The zoom went 1.6 → 2.0 to buy frames back, and it is the honest lever.**
Raising the viewport to 1920×1080 had put 1200×675 of world on screen against
the 960×600 the game shipped with, and the cost of that is not the pixels: a
bigger view is more bodies drawn, more ground for the fog polygon, and longer
sight radii, which is more entities serialised per viewer. At 2.0 the view is
**960×540** — back to roughly what it always was — at 1080p sharpness. Measured
over 200 viewpoints in a real city, the fog polygon **1.59 → 0.81ms median**,
p90 **3.21 → 1.40**, worst **5.66 → 2.70**, with ~36% fewer bodies in view on
top of that.
  - **It does nothing for a spectator.** `cameraFor` frames the whole city on
    `SPECTATE_FIT`, not `CAMERA_ZOOM`, and a spectator is sent every entity
    regardless of any sight radius. Watching is the expensive way to run this
    game and the zoom cannot help it.

- **The binoculars were already short before any of this**, which is worth
  recording. At the old pan the corner was 1036 against a sight radius of 980,
  so the client had been lighting fifty-odd pixels of ground the server was not
  sending entities for whenever they came up — the same fault raising the sniper
  once caused. It is invisible unless you go looking, because what it produces
  is an empty street rather than an error.
- **The check worth keeping** is `fogRadius(reach) <= sightRadius` for each of
  hip fire, binoculars and a scope. Measured after the pan cap: **890/890, 1164
  against 1180, 1294 against 1310** — no dark band on any of the three.

Fog cost, measured over 200 spots at the *old* pan of 60: hip fire **0.62ms**
median (still under the 0.87ms it was before any of this, because of the clip
below), binoculars 1.98ms, a scope 2.93ms median / 7.5ms worst. The worst case
is only paid while a scope is actually in hand and only on a rebuild (12.5Hz).
Those figures are from before the pan went to 160 and the radii with it, so they
are a floor rather than the current number — a live city with a dog on screen
reads **0.50ms** on the HUD at 144fps, so nothing has gone wrong, but the
200-spot sweep has not been re-run. If it ever needs trimming the knobs are
`SCOPE_PUSH` and `CAMERA_PAN_X`.

**The scope and the binoculars push the camera; they do not zoom it.** Zooming
was the first answer and the wrong one — it shrinks the officer, the city and
the thing you are trying to look *at*, and it re-frames the whole screen to
show you ground behind you that you never asked for. `SCOPE_PUSH` (430) and
`BINOCULAR_PUSH` (300) slide the camera off the officer toward the reticle
instead, at 1:1, the way Foxhole's does. `scale` for a player is 1 again,
always.

- **The push is measured from the screen centre, not from the officer.** He is
  no longer stood in the middle once the camera has moved, so referencing him
  feeds the push back into itself and it pins to the cap on the first twitch of
  the mouse.
- **And it is scaled by how far to the *edge* the cursor has got, not by raw
  pixels.** The screen is 960×600, so counting pixels gave aiming up and down
  barely half the reach of aiming along a street. Against any edge you get the
  whole of it.
- **Which means the officer leaves the bottom of the screen**, since 430 > 300.
  That is the Foxhole behaviour and the alternative is cutting the vertical
  reach back to the thing the scope exists to fix, so `drawSelfMarker` puts a
  ring and a chevron where he went. Drawn over the slot bar, and with a deeper
  inset along the bottom — a marker behind your own inventory is unreadable.
- **The client fog radius has to grow with the push, and did not.** The server
  was already sending entities out to `SNIPER_SIGHT_RADIUS` while the client
  kept punching a `PLAYER_SIGHT_RADIUS` hole in the fog, so raising the sniper
  darkened exactly the ground it was for. `fogRadius()` walks the furthest
  screen corner the push can produce and takes that, *sampled* over a quarter
  turn rather than bounded — the push follows a unit direction, so the two axes
  cannot both be at their maximum at once and the loose bound over-reaches by a
  fifth, which is a fifth more ground to light for nothing.
- **What pays for that is clipping the occluders to the frame.** Nothing
  outside the viewport can shadow anything inside it — the box is convex and
  the viewer is in it, so a ray that leaves never comes back and every shadow
  from an outside occluder falls outside too. `visibilityPolygon` takes
  `clipW`/`clipH` and the cost is roughly the square of the occluder count.
  Measured over 200 spots at the time it went in: hip fire **0.87 → 0.27ms**
  median, and a scope at r=1070 costing 1.98ms where unclipped it was 3.55ms.
  Normal play got three times cheaper as a side effect, which is what later
  paid for the camera pan.
  - The clip is sized off the item's *maximum* push, not the live one. A clip
    that moved with the mouse would throw the polygon cache away every frame.
  - The fog watchdog counts its "occluders in range" over the clip for the
    same reason. Counting the wider set has it cry off in open ground, where
    the buildings it can see were culled on purpose.

**A scope in a bot's hands is range, and nothing else.** It has no camera, so
`BOT_SCOPE_SIGHT` (1200) and `BOT_SCOPE_STANDOFF` (700) are the whole of what
one is worth to it. Two things were stopping that:
- `senseThreats` ran on `NPC_OFFICER_SIGHT` whatever was in the bag, so a bot
  stood at 420 with a gun good for 2200.
- `bestGun` ranks on damage per pull, and a shotgun's eight pellets beat a
  sniper round — so a bot that had crossed the city for the sniper never took
  it out. `gunForRange` picks the best gun that actually *reaches* the target,
  falling back to `bestGun`.

Measured with the old behaviour gated back in, same seeds: seed 99 the bot
carried the sniper the whole round with all 8 rounds still in it and fired it
**0** times; with the fix it emptied it, 16 shots, median 464px, longest
1076px. Seed 4711 fired it before but as a short-range gun (36 shots, median
401px — capped by its own 420 eyes); after, median **1057px**, longest 1458px.
Plain guns stay where they were, median ~350px.

### Fire

The flamethrower is not a hitscan weapon. `sprayFlame` walks a short thick
stream out to the first solid thing, sets light to whatever it crosses, and
drops overlapping patches of burning ground behind it. The stream itself barely
scratches — **burning is the weapon**: `BURN_DAMAGE_PER_SEC` while alight, and
`BURN_SLOW_MUL` on how they move while they are.

Caught in the stream burns for `FLAME_BURN_AFTER_MS` past the last lick;
walking through a patch burns for `FLAME_GROUND_BURN_MS`. Both go through
`ignite`, which takes the *later* of the two, so standing in fire while being
sprayed can't cut the burn short.

Patches are spaced rather than continuous (`FIRE_PATCH_SPACING`), and a new one
landing on an existing fire extends it instead of stacking — so sweeping the
stream down a street leaves a dozen fires rather than three hundred.

Officers don't catch. That is a deliberate early return in `ignite`, not an
oversight: a flamethrower you can kill yourself with is one nobody uses.

**It lands where the crosshair is.** `sprayFlame` takes the aim point and
throws to it, clamped to `[FLAME_MIN_THROW, FLAME_RANGE]`. Before this the
crosshair chose the direction and nothing chose the distance, so every burst
went its full length and aiming at something close put the fire well behind it.

**Nothing burns along the way — it all comes down in one place.** One patch at
the landing point, plus `FLAME_SPLASH_COUNT` in a cone thrown on past it. The
ground between the shooter and the crosshair stays clear. Earlier versions
walked the stream dropping patches every `FLAME_STEP`, which is why a held
trigger laid a carpet of fire across the shooter's own feet and read as
"landing way too soon" — the fire appeared under the *middle* of the arc, which
is its highest point. One pull is three patches.

**Nothing crosses a wall, in either the simulation or the drawing**, and those
needed separate fixes:
- `blocked` (the throw was cut short) suppresses the forward cone entirely.
  When a wall stopped the stream, that *is* where it stopped, and a cone past
  it would be putting fire through the wall.
- Each surviving cone spot is still checked against `nav.isBlocked` and
  `nav.lineClear`, because a ray through a doorway can put the cone inside the
  walls either side without the ray itself ever being blocked.
- The **drawn** splash in `drawFlameStream` fans *back* toward the shooter
  rather than on past the impact. This one is easy to miss: the endpoint is
  already hard against whatever stopped the stream, so anything drawn forward
  from it renders through the wall no matter what the server did. Splashback
  off the thing you just hit is the truer picture anyway.

**A heavy weapon is a `turnRate` on `ItemDef`, not a branch.** `steerAim` in
`combat.ts` eases the officer's aim toward the mouse at that rate; absent, the
aim snaps as it always did. The flamethrower's 2.6 rad/s puts a 180° swing at
1.2 seconds, and that lag is the whole of its weight — the crosshair runs ahead
while the body and the stream drag round after it.

It has to be **one** value. `steerAim` is called once per tick from
`updatePlayers`, before anything fires, and both `entity.facing` and the
direction passed to `fireHeld` read it. Compute it twice and the drawn facing
and the fired direction drift apart. The *distance* still comes from the
cursor, so sweeping throws the stream behind where you are pointing — which is
exactly the intended feel.

**`FIRE_PATCH_SPACING` is a look, not just a cost.** `dropPatch` merges
anything inside it, so widening it from 22 to 34 is what turns burning ground
from one continuous orange smear back into a scatter of separate fires. The
smear was the single biggest reason the real thing didn't match the mock — the
mess on screen was never the stream, it was the ground fire piling up.

**The stream is thrown, not fired.** Burning fuel leaves the nozzle and
travels: `FLAME_TRAVEL_MS` (300) is how long the front takes to reach the far
end of the throw, and `drawFlameStream` draws nothing past that front. Drawing
the whole length on the frame the trigger went down read as a laser. At 55ms
between pulls several streams overlap while it is held, so the composite is a
continuous jet with a leading edge that visibly runs out to the target. The
splash at the far end waits for the front to arrive — showing the impact on the
first frame was the other half of it looking instant.

**It was too fast at 170.** The front still crossed the whole throw in under a
fifth of a second, which the eye reads as arriving everywhere at once, and the
travel did no work. `FLAME_TRACER_MS` had to grow with it (320 → 560) to keep
the *ratio* — `front` is `age * FLAME_TRACER_MS / FLAME_TRAVEL_MS`, so leave
the tracer where it was and the tip reaches the far end at the exact moment the
tracer dies, and the impact is never drawn. Both were scaled by ~1.75, so the
stream's shape and the split between extending and burning out are unchanged
and only the speed moved.

**The burning ground waits for the fuel.** `sprayFlame` works out *where* the
patches go on the tick the trigger went — against the geometry as it stands,
with the wall tests and the cone's `nav` checks all paid there — and then
queues them on `world.pendingFires` for `now + FLAME_TRAVEL_MS`. `updateFires`
lays them when they land, ahead of its own sweep, so anybody stood in one
catches on the same tick rather than the next.

- **The merge into an existing fire happens on landing, not on queuing.** What
  is burning by the time the fuel arrives is not what was burning when the
  trigger went, and merging early folds a patch into a fire that has since gone
  out.
- **What is caught in the stream still catches on the tick it was fired.** That
  part is the picture catching up with the simulation rather than the
  simulation slowing down. Only the ground waits.
- Measured: on the firing tick, **0** patches burning and 4 in the air; first
  one catches at **333ms** (one tick past `FLAME_TRAVEL_MS`, which is the 30Hz
  granularity), 3 patches on the ground after the fourth merged.

**It is a cone, not a sausage.** `FLAME_MOUTH_WIDTH` → `FLAME_TIP_WIDTH`: thin
at the nozzle where the fuel is still under pressure, spreading and breaking up
as it slows. Fattest-in-the-middle read as a thrown blob. The three colour
layers now stop at different distances — the near-white core only reaches 40%
down the throw and the dull red runs the whole way — so the throat is white and
the tip is red and smoky, instead of a solid bar of light. The cross-line
wobble rolls with the tracer's age, so the jet churns rather than sitting.

**A pull is a parcel of fuel, not a line — and that is what makes it a hose.**

This is the single most important thing about the drawing. Each pull used to
draw its own full-length stream, nozzle to impact, as a straight chord of its
own. Hold the trigger and sweep and that puts six independent straight streams
on screen at six different bearings: a fan of ribs. Nothing about it could
*bend*, because every rib was straight by construction and none of them knew
about the others.

What is actually in the air at any instant is the fuel from the last few pulls,
each at a different distance and each launched on a different bearing. Join
those and you get a curve — newest fuel at the nozzle on the current bearing,
oldest out at the far end on the bearing from a third of a second ago. Sweep and
the stream trails the crosshair and bends the way water out of a hose does; hold
still and it straightens by itself. There is no "bending" code: the parcels
simply line up differently.

- **`flameStreamSpine` is the shape**, and it is exported so it can be measured
  without a canvas. Nozzle end first — the newest slug's *tail*, which sits at
  the muzzle while the trigger is down and advances once it is let go, so the
  stream detaches from the nozzle the way the last of the water does.
- **Fuel that has landed leaves the stream.** The first parcel to have arrived
  anchors the tip at the impact and everything older drops out — leaving them
  in would drag the tip round to wherever you were pointing half a second ago.
  They keep drawing their splash, so a sweep still leaves an arc of impacts,
  which is right: that is where the fire actually went.
- **It is splined, not joined with straight lines.** Four or five parcels is
  four or five vertices, and joining those with segments puts a visible kink at
  every pull. Catmull-Rom, resampled every `FLAME_STREAM_STEP`.
- **`who` on `Shot` exists only for this.** One shooter's pulls are one stream,
  and two officers stood together must not have theirs spliced into each other.
  Sent for `flame` and nothing else.
- **Continuity now costs something it didn't.** There is one body of fuel rather
  than six ribs laid over each other, so nothing is covering the gaps any more:
  `FLAME_STREAM_STEP` has to stay under the *narrowest* blob the stream draws,
  which is at the throat, and `FLAME_MOUTH_WIDTH` went 0.3 → 0.5 because a 4px
  thread that was fine under six overlapping ribs is not fine alone.

Measured by counting how many separate lit bands cross a circle round the
nozzle — one continuous stream gives 1, a fan gives one per rib, which is the
complaint itself rather than a proxy for it. Old drawing at the flamethrower's
full 2.6 rad/s sweep: **up to 6 bands**, and only 16 of 86 cross-sections showed
a single one. New: **one band in 96%** of cross-sections at the same sweep, and
100% holding still. Reproduce it with a page under `client/` that imports the
real `drawTracers` and drives frames by hand — rAF is throttled to nothing while
the browser pane isn't compositing, so it must not drive itself.

**Drawing it is `drawFlameStream`, not three strokes.** Ruled lines read as a
laser sight. It is a row of overlapping circles every `FLAME_STREAM_STEP` along
the spine, widening from the throat to the tip, lifted off the ground by
`FLAME_ARC_LIFT` on a sine so it rises and comes back down, with a flattened
black ellipse tracking it along the *unlifted* line — without the shadow the
lift reads as the stream being aimed off to one side rather than as height.
Every blob wobbles across the stream so the edge is ragged, and the wobble is
taken from the **local tangent**: the stream is a curve now and has no single
direction to be across.

**The arc is screen-space, so it has to shrink when you fire up or down.** The
lift only reads as *height* when it is across the line of travel. Fired north
or south it is along that line instead, where the same arc stops looking like
height and starts looking like the stream falling short.
`FLAME_ARC_VERTICAL_MIN` keeps 28% of it at the vertical, scaled by
`|dx| / len`.

**Napalm needs its own tracer clock.** `TRACER_LIFETIME_MS` is 90ms, which is a
blink — that is what made it blip out of existence. `FLAME_TRACER_MS` is 320,
and both the radius and the alpha fall off across it, so at 95% of its life it
is still 48% of its original size at 1.5% alpha. Fading alone still ends on a
visible edge; shrinking as well is what makes it die away. `main.ts` culls on
the same per-kind clock — culling flames at 90ms would cut the fade short.

**Burning ground needs the same treatment, and didn't have it.** The old curve
bottomed out at 45% size and a quarter opaque and *then* the patch was deleted,
which is a fire vanishing rather than a fire dying. `FIRE_FADE_FRACTION` gives
the last 45% of a patch's life over to going out, and the curve reaches
genuinely nothing: 0.34 alpha down to 0.000, 1.0 scale down to 0.30.

**Clean civilians cannot be burned to death, by construction.** `ignite` caps
them at `HUMAN_BURN_MS` (700ms) rather than extending, they take
`HUMAN_BURN_DAMAGE_PER_SEC` (2) instead of 26, and `updateFires` clamps them at
`HUMAN_BURN_FLOOR`. All three are needed: the cap alone still lets a civilian
parked in a fire be re-lit every tick, and 2/s is still a kill given a minute.
Verified — two solid minutes stood in a fire leaves them on exactly 25hp and
alive. This is a rule about the game, not about fire: without it the
flamethrower is a tool for clearing a street of the people you are there to
save, and burning the uninfected is a cheaper way to stop an outbreak than
fighting it. Same shape as kevlar's absolute "can't be infected".

**The infected are the exception, and they are what the weapon is for.**
`burnsLikeTheDead` is the one test: somebody already carrying it burns with no
cap, no floor, and `FLAME_INFECTED_DAMAGE_MUL` on top. The protection is a rule
about the *uninfected* and it lifts the moment they are bitten — they are going
to turn, everyone can see it coming, and this is the crowd-level answer to an
outbreak where the charge rifle takes one carrier at a time and the cure gun
saves one at a time. Verified in the same fire, side by side: two minutes leaves
a clean civilian on 25hp and burns a bitten one down.

**And it comes with the sight to aim it.** A flamethrower **in hand** picks the
infected out of a crowd — the same narrow hole in server-enforced fog the cure
gun punches, for the same reason: a weapon that answers a problem nobody can see
is a weapon nobody uses. Held rather than merely carried, unlike the cure gun's,
because it is a thing you raise and look down; walking around with one slung
does not open the fog.

### The zombie dog

Team 2's seat, and the first thing on the outbreak's side a person can drive.
`server/src/dog.ts` owns it.

**It is a zombie with a `dog` flag, not a type of its own.** That is the whole
reason it needed so little code. `type: 'zombie'` means bullets find it
(`fire` only ever considered zombies), the crowd runs from it (`senseThreats`
takes zombies as threats), the danger field is sourced from it, `countZombies`
includes it so victory cannot fire while one is alive, and officers and bots
target and shoot it. **None of that is written down anywhere.** It is the same
shape `bot`, `swat`, `soldier` and `squadLead` already use to make four grades
of officer out of one type — what is different about a dog is drawn, not
declared. `EntityType` still has an unused `zombieMaster` for the other half of
team 2; a separate type there is a bigger question, because a zombie master
probably *shouldn't* be shot like an ordinary zombie.

- **Which seat you took is the entire choice.** `seatedDogs` reads the lobby,
  `spawnPlayer(id, asDog)` branches once, and a dog gets none of the officer
  kit — no inventory, no rally charges, no debug heap. `world.dogs` is keyed by
  connection like `playerIds` and deliberately survives `resetWorld`, so
  restarting a round does not turn a dog player into an officer.
- **`DOG_RADIUS` is what it collides with; `DOG_ART_RADIUS` is what it looks
  like, and they are deliberately different numbers.** The collision circle is
  capped by the narrowest doorway in the city and cannot grow: `CLEAR` in
  `mapgen` is 46px, so a 38px body gets through with four pixels either side,
  and much past 20 the dog snags in doorways — a hunting animal that cannot
  follow people indoors is no use at all. How big it *looks* is an art decision
  and has no business being held hostage to that, so the drawing is measured in
  its own unit (23). Measured over six cities: narrowest 46px, **0** doorways
  too tight. Anything geometric that has to line up with the *picture* — the
  muzzle, and so the bite — measures in art radii too.
- **`DOG_MUZZLE_OUT` keeps the jaws where the teeth are drawn.** The bite was
  measured from the body centre while the head is drawn 1.25 radii forward, so
  it landed a quarter of the animal behind where you can see it. The two have
  to move together.
- **It comes in at the breach**, with the rest of the outbreak — and **out in
  the street**, which for a long time it did not. See **Nothing on the
  outbreak's side starts indoors**.

**The horde is its lives.** Shot down, the dog comes back **out of a shambler**:
one somewhere on the map stops being a shambler and stands up as the dog, at
that body's position, on full health. Run out of shamblers and the next death
is the end of it — no entity, out of the round, and the HUD says so.

**Dying is something you watch.** The body stays exactly where it fell for
`DOG_DEATH_MS`, greyed and sprawled — cutting straight to the new one gives
being killed no weight at all, you would simply find yourself elsewhere. The
screen holds on the body for the first `DOG_FADE_FROM` of that window and then
goes to black. Measured: flagged dead for **2400ms of a 2400ms window**.

#### And being born is something you watch too

**The screen comes back up on the shambler you are about to come out of.** It
vibrates, its arms twist out of their sockets, and then it bursts and the animal
is standing where it was. `DOG_BIRTH_MS` (1.5s) after the death window, and
`server/birthcheck.ts` is the harness.

The old respawn did all of this in one instant at the end of the death window,
with the screen still black — so the one moment that explains where a dog comes
from happened where nobody could see it, and the black frames were dead time
rather than a held breath.

- **Choosing the host early is the entire mechanism.** `beginDogBirth` picks it
  when the screen goes dark and `finishDogBirth` spends it a birth window later;
  everything in the second half was already written, and only the *when* moved.
- **The camera is aimed by moving the dog's own body onto the host**, and there
  is no camera override anywhere on the client. It follows the entity you are
  driving, so parking that entity on the host's back is all of it. It costs
  nothing on screen because the body is still `dead` and the entity loop skips
  those — the corpse it left is a separate, permanent record and stays where it
  fell. Zero distance also puts the host inside the dog's own fog with nothing
  said about births in `visibleTo`. Measured: **0.0px apart**, against **1857px**
  from where the body actually died, which is well outside a 945px view — that
  gap is the control, and it is where this used to happen.
- **The host is frozen through it**, folded into `computeFrozen` beside the
  stunned. A body coming apart is not walking anywhere, and one that wandered
  off mid-convulsion would take the burst — and the animal — out of frame.
  Measured: **0 ticks moved** across the whole window.
- **The convulsion is on the wire as `birthing` (0..1) on the *shambler***, not
  on the dog, because the dog does not exist yet and the thing being drawn is
  what is happening to somebody else. Sent to everybody who can see it: a body
  shaking itself apart in the street is the only warning the officers get that
  a dog they killed is about to be back.
  - **Vibration, not thrashing**, and the difference is entirely the frequency —
    a grapple shakes at 0.028 because two people wrestling is something you can
    follow, where this is too fast to track and reads as a thing failing rather
    than struggling. The two axes run at rates that are not multiples of each
    other, so it never settles into a line. It ramps on the *square*: linear
    reads as fully broken from the first frame and then has nowhere left to go.
  - **`DOG_BIRTH_TWIST_FROM` (0.42) is where the arms go**, and the two halves
    do different jobs. Vibration alone is ambiguous — a fit, a stun, anything.
    Arms rotating out of the line of the shoulders and folding back at an angle
    no elbow makes is the moment the body stops reading as a person, which is
    what has to happen before the burst for the burst to be an ending rather
    than a surprise. The two sides are deliberately **not mirrored**: equal and
    opposite reads as a pose being struck.
- **Nothing about the burst comes down the wire.** The host simply stops being
  in the snapshot and the client — which has been watching it convulse and knows
  how far through it was — throws the gore itself, exactly as blood is derived
  from `Shot.hit`. `spawnBurst` is `spawnBlood` called at six bearings round the
  circle, so it inherits the decals, the droplet physics, the cap and the
  `settings.blood` switch without a line of any of them being written twice.
  - Gated on `BIRTH_BURST_AT` (0.9), because a host can leave a snapshot for the
    ordinary reason too — some *other* viewer across the street losing sight of
    it half way through. The dog it belongs to cannot, its body being parked on
    the thing, and that is the cost of sending the flag to everybody.
- **A birth is interruptible, and deliberately not defended against.** The host
  is an ordinary zombie in an ordinary street and the garrison can shoot it out
  from under you; that costs a life exactly as any other shambler does, and the
  answer is to start again on another body. With none left, that was the last of
  them and the dog is out. Both paths are checked.
- **Two dogs cannot come out of the same body**, checked by `isBirthHost`.
- `dogHudFor` reports `birth` alongside `dying`, and the two are **mutually
  exclusive by construction** — `updateDogs` deletes the death before it begins
  the birth. That is what lets the client fade out on one and back in on the
  other without deciding which half of a single ramp it is looking at. Measured:
  **0 ticks with both running**.

*One thing about measuring this is worth not rediscovering.* `toWire`'s third
parameter is **`revealInfected`, not `now`** — passing the clock there leaves
`now` defaulting to `Date.now()`, which in a headless harness barely moves. That
read the birth as 0.00 on every tick of it and looked exactly like the ramp
never starting.

- **The body it leaves is permanent, and "permanent" means for the round.**
  `world.corpses` is never trimmed, so four deaths leave four bodies for the
  rest of it — the only lasting mark the officers get for having killed one.
  Sent unfogged: a handful in a whole round, and a corpse should not blink out
  because you turned round.
  - **It is cleared by `resetWorld`, and for a long time it was not.** What a
    corpse holds is a *coordinate*, and a coordinate means something only on the
    map it was made on — so a restart drew the last round's bodies onto a
    freshly generated city, in streets that no longer existed. Measured with the
    clear gated back out: two bodies survived a restart, one of them at
    **4767,2959 on a map that need not even be that big**, and the next death
    stacked to three.
  - **It was the one piece of dog state neither reset path caught**, which is
    why it lasted. `dogsOut`, `dogDeaths`, `dogState` and `dogBirths` are all
    dropped per id by `spawnDog` — which only runs for a seat somebody is
    actually sitting in — and this is a plain array on the world that no seat
    owns. Anything else added to the world that is neither keyed by id nor
    cleared beside its neighbours here has the same trap waiting for it.
  - **The client needed nothing.** It reassigns `corpses = msg.corpses` on every
    snapshot and `drawCorpses` holds no state between frames, so an emptied list
    self-corrects on the next tick. That is *not* true of the blood, which
    accumulates client-side and is why `clearBlood()` exists on the same path.
- **`world.dogDeaths` is on the world, not on `DogState`, and that is the whole
  bug.** It started on the dog's own state, which is created lazily on the first
  tick and *deleted* on every respawn — so a dog shot in either of those windows
  had nowhere to record that it had died. It dropped a body, kept its entity,
  and could be killed again on the very next round. Measured before the fix: six
  rounds on one body left **six corpses**; after, one.
- **Whether it gets back up is settled when the clock runs out**, not when it
  dies. The horde it needs to rise out of can be shot down — or turned up —
  while it is lying there.
- **A corpse is drawn by the same code as a live dog**, through `drawEntity`
  with `dead` set: one `filter` on the context greys it, the legs are thrown out
  at odds with each other, the head lolls, and the eyes go out. Baking a second
  set of grey sprites would be cheaper per draw and would drift out of step with
  the live ones the first time anything changed; at a handful of bodies a round
  the filter is the right trade.
  - **A body is drawn once, and it is the corpse that draws it.** A killed dog
    keeps its entity for `DOG_DEATH_MS` so there is something lying there to
    watch, and `killEntity` pushes the corpse at the same instant and the same
    coordinates — so both were drawn, one over the other. The corpse is the
    permanent record and holds the pose it died in, so the entity loop skips
    anything `dead` and nothing on screen changes at the moment the animal gets
    up and leaves.
  - **A corpse has no health to report.** The bar is drawn whenever health is
    below the maximum, and a body is on zero, so every corpse wore an empty bar
    — which reads as something still in the fight.
  - **A corpse in view used to wipe the camera transform for the rest of the
    frame, and this was the big one.** The "eyes are out" branch in
    `dogHeadHalves` read `if (dead) { ctx.restore(); continue; }` — and there is
    no `save` anywhere in that loop. It ran once per side, so **two** pops per
    corpse it never pushed: the first took `drawDog`'s greyscale filter off
    early, the second took **the world transform** off the stack. Everything
    drawn after that in the frame — walls, doors, bodies, tracers, fog — landed
    in raw canvas pixels.
    - **It explains both of the reports it produced.** The ground, park, pond
      and blood are drawn *before* `drawCorpses`, so they alone stayed put:
      that is *"everything but the floor and some fog stop rendering"*. And the
      rest, drawn at 1:1 world coordinates with no camera offset, is *"the dog
      was small and off to the right, almost like a mini map, and half a
      building was being rendered"*.
    - **It reads as cursor-dependent without being cursor-dependent.** The pan
      moves the camera, the camera decides whether a corpse is on screen, and
      the corpse is what breaks the frame — so it fires at a different cursor
      position everywhere you stand.
    - **Verified by counting the stack rather than by looking.** Monkey-patch
      `save`/`restore` on a scratch context, call the real `drawEntity`, and
      read the depth and `getTransform().e` afterwards. A live dog leaves depth
      1 / min 0 / translate 10; a corpse left depth **-1**, min **-2**,
      translate **0**. After the fix a corpse matches a live dog exactly, in
      all of grappling, zoomed-out-simple and several-in-one-frame.
    - The lesson: `ctx.restore()` with no `save()` beside it does not fail
      loudly — it silently steals the caller's state, and canvas ignores a pop
      on an empty stack, so the damage shows up far away from its cause.

- **That makes every zombie the officers put down worth something to both
  sides**, which is the whole reason for it. It also closes the loop with the
  win condition for free: a dog that is out holds no entity, so it stops being
  counted by `countZombies`, and victory can fire the moment the last shambler
  goes with it.
- **Never out of another dog, and never out of itself.** Two dogs in a lobby do
  not feed on each other.
- **The entity is *moved*, not rebuilt**, so nothing keyed to its id anywhere
  else has to be rebuilt with it, and it materialises in where the shambler was
  — the swap is something you can watch rather than a body teleporting.
- **`hosts` on the wire is counted, not kept.** Zombies are created and killed
  all over the map by things that have no idea a dog exists, so a running total
  would go stale; walking the entities once per snapshot for the one viewer who
  needs it is cheaper than keeping it correct everywhere.
- **`killEntity` in `world.ts` is where all of this lives, and pulling it out
  fixed a real bug.** Bullets, fire and blasts each had their own copy of "this
  body died" — and `heli.ts` deleted *any* zombie it dropped, which would have
  removed a player's dog from the map outright, no respawn and no ending. Fire
  had the mirror-image fault: it skipped players entirely, which was harmless
  while only officers were players and officers cannot catch, and would have
  left a burning dog sat at zero health forever. One function, three callers.
- **`updatePlayers` skips it entirely.** Not one line of walking an officer
  round applies: no weapon to steer the aim with, no boots, no bipod, and a body
  that turns at its own rate rather than snapping. `processShooting` skips it
  too, because it is not an officer, so left-click reaches `dog.ts` untouched.

**The head leads and the body swings after it.** Both ease toward the mouse and
the head simply gets there first (`DOG_HEAD_TURN_RATE` 13 rad/s against
`DOG_BODY_TURN_RATE` 6.2). What stops it being a turret on a chassis is
`DOG_HEAD_MAX_YAW`: past 60° the neck is out of travel and the head can only go
where the body takes it. Measured, whipping the aim through 180°: the head is
ahead of the body on 15 of 40 ticks and settles at tick 10 against the body's
15. Movement stays WASD world-relative like an officer's — a dog you had to
steer like a tank would be unplayable, and being able to back off while still
looking at somebody is most of what the neck is *for*.

- **There is dead space before the shoulders stir at all.** Inside
  `DOG_BODY_DEADZONE` (~10°) the head turns on its own and the body does not
  move — which is what a dog watching something looks like, and it is the whole
  difference between a neck and a swivel mount. Past it the body chases the
  *edge* of the dead space rather than the mouse, so it comes to rest exactly
  that far behind and a sweep always leaves the head leading; chasing the mouse
  itself closes the last ten degrees on arrival and undoes the point of it.
  Measured: a flick of 0.126rad moves the body **0.00000rad**, and a swing to
  1.400rad settles the body at 1.220 — trailing by exactly the dead space.
- **Turning is ground covered, so the legs step through it.** A body pivoting on
  the spot moves no distance at all, and a gait driven by displacement alone
  left the dog rotating with its feet welded to the road. What the paws actually
  travel is the arc their own radius sweeps, so that arc is simply added to the
  distance walked and one gait handles walking and turning alike.
- **The tail does not wag.** A wagging tail is a happy dog, and it was the last
  thing on the animal still reading as a pet. It trails with a fixed kink, and
  swings out behind a turn only because the second segment lags the first —
  which is a thing a dead weight does rather than a mood.

**The bite is held, not snapped.** Left click holds the mouth *open* for
`DOG_JAWS_OPEN_MS` (2s) and the first body to walk into it is taken; let go, or
run the window out, and the jaws shut and have to recover for
`DOG_BITE_COOLDOWN_MS` (1.8s). Holding through the recovery opens them again, so
a held button is a rhythm of open, shut, wait, open with no clicking.

It used to snap on the click, which made the whole move a timing test against a
30Hz tick and reduced the animal to a mouse button. Holding the jaws open puts
the skill where it belongs — getting the dog into the right place with its head
pointed at somebody — and is also simply what a dog charging you looks like.
Measured: jaws open **2033ms** of a 2000ms window then shut with the button
still down, **1833ms** shut against a 1800ms recovery, then open again; and
somebody walked into an already-open mouth is taken with **no click at the
moment of contact**.

- **Tapping is how a door is chewed, holding is how a person is caught**, and
  the same button does both with no mode. `DOG_DOOR_DAMAGE` lands once per
  open-and-shut rather than per tick — chewing continuously while the mouth is
  held open would take a door off its hinges in about a second. Measured: a
  `DOOR_HEALTH` 1600 door down in **5.7s over 4 taps**.
- **The HUD needs both readings.** "How long can I hold this open" and "when may
  I open it again" are opposite questions, and one bar answering both gets read
  wrong in the half-second that matters — so the open window drains in its own
  colour and the recovery fills in another.

**A bite is a latch, and shaking is what resolves it.** The jaws reach
`DOG_BITE_REACH` past the *muzzle*, inside `DOG_BITE_ARC` of where the head is
pointing — so the dog has to be looking at somebody rather than merely stood
next to them. Measured: somebody at its tail is never bitten.

- **`DOG_BITE_MS` is 3.6s, far longer than a shambler's two seconds**, because
  unlike a shambler the dog has something to *do* about it. Hang on doing
  nothing and it is the slowest bite in the game; worry at it and it lands in
  under a second (`DOG_BITE_MIN_MS`). Measured: 3633ms held still, 933ms shaken,
  with 75% of the clock torn off.
- **A shake is a reversal, not travel.** Banking raw angular movement would let
  somebody who spun the mouse in one direction shorten a bite as fast as one
  worrying at it — and since the head is capped off the spine anyway, a
  sustained sweep just drags the whole body round. The run in one direction is
  banked only when the head comes back the other way, and a run under
  `DOG_WIGGLE_MIN_RAD` is a twitch rather than a shake. Measured: spinning the
  mouse one way held for 3633ms of a 3600ms bite — no credit at all.
- **The floor is measured from when the bite started, not from now.** Written
  the obvious way — `now + DOG_BITE_MIN_MS` — every credit shoves the deadline
  three-quarters of a second into the future, so a player who keeps shaking
  keeps renewing it and **the bite never lands at all**. Measured before the
  fix: 400 ticks latched and still going.
- **The jaw point sits at the two bodies' own separation, not inside it.** Held
  any closer, the drag and `resolveCollisions` spend every tick undoing each
  other — the drag hauls the victim in, collision shoves them apart, and the
  pair slides bodily down the street with nobody driving. Measured: 106px of
  travel over a bite where the mouse never moved. Now 0.0px/tick held still
  against 13.5px/tick shaken, which is the throw doing its job and nothing else.
- **A snap that catches nobody bites the door.** A dog that follows people
  indoors and then stops dead at the first thing they pull shut is a dog beaten
  by a door handle — and the shamblers have been tearing at doors since long
  before it existed. A body always wins the jaws over a slab, so this only runs
  when the snap found no one, and only for a shut door inside the same
  `DOG_BITE_ARC` a throat has to be in. `DOG_DOOR_DAMAGE` is heavier per hit
  than `DOOR_ZOMBIE_DAMAGE` because the dog pays the full jaw cooldown for each
  one where a pack does not. Measured: a `DOOR_HEALTH` 1600 door off its hinges
  after **8.4s** of biting — a delay, not a wall.
- **Everything about whether a grab is *allowed* is `attemptGrab`, shared with
  the shamblers.** Pulled out of `updateZombie` when the dog needed it: kevlar,
  the riot shield, `world.grappleImmune` and `MAX_GRAPPLERS` have to mean the
  same thing to both, and written twice they would drift into "the vest doesn't
  work on dogs" a month later. `shielded` and `immune` are deliberately
  different results — a shield spent turns the attacker away for that tick,
  where a vest's breather leaves it still coming. Measured both ways round:
  kevlar spends a use and denies the infection for a zombie *and* a dog; the
  shield refuses both before any grapple exists at all.
- **The grapple resolves through `resolveGrapple` like any other.** Escape roll,
  instant turn, pending infection — a dog bite infects exactly as a grab does,
  with no second code path.

**Rounds knock it about, but not the way they knock a shambler about.** A
shambler taking a rifle round is meant to be stopped in its tracks; a dog is the
thing that gets away, and a full stagger on a body somebody is *driving* reads
as the controls being taken off you rather than as being hit. So it takes a
shorter stagger at part strength (`DOG_STAGGER_TIME_MUL`,
`DOG_STAGGER_STRENGTH`) — a bolt action drops a shambler to 0.35 of pace and the
dog to **0.545**, for **675ms** of a 900ms slow. It has no `AiState`, so the pair
live on `DogState` and `moveDog` reads them; `hit` calls `staggerDog` and needs
to know nothing else.

**Both were raised (0.55/0.5 → 0.75/0.7), and the old figures are worth keeping
for scale.** At 0.5 strength the dog came out at 0.675 of pace — close enough to
untouched that being shot was information rather than a cost, and a dog stood in
the open trading fire with the garrison never had to think about where it was.
The sprint measurement quoted here before (408px clean against 231px staggered
over 1.33s down a pinned lane) was taken at the *old* constants and has not been
re-run; the pace and duration figures above are derived from the constants
themselves, not measured.

**Its health came down to 90.** The dog's real durability is its lives — it
comes back out of the horde — so the body itself does not also need to soak a
magazine. One that can stand in the open trading fire with the garrison never
has to think about where it is.

**The dog's camera is pulled out to `DOG_CAMERA_ZOOM` (1.5), and it is a balance
fix rather than a rendering one.** Reported as *"dog needs more pov, I am getting
shot by swat I cant see"*, and the complaint was exact.

- **It was never the fog — it was the viewport.** At `CAMERA_ZOOM` the screen
  holds 960x540 of world, so **270px above you**, while `SWAT_SIGHT` is **560**.
  A SWAT team directly above or below could see the dog and open fire from 290px
  beyond the top of its screen, and even at full vertical pan they still
  out-ranged the frame by 96. The sight radius of 720 is derived from the screen
  *corner*; along the vertical axis you see far less than that, and the circle
  the server serialises has nothing to do with the rectangle you can look at.
- **An officer has the same geometry and it does not matter to them.** They
  shoot back at range and can carry binoculars or a scope; a dog has no ranged
  attack and **no inventory at all**, so it was pinned at the minimum view while
  everything shooting it was not.
- **The rule is *anything that can shoot you is something you can look at*** —
  deliberately not "see it all without moving the mouse", which needs a zoom
  below 1.0 and hands the dog the whole street. 1.6 was the loosest zoom that
  cleared it: 675 world px vertically, 337 at rest and 580 with the pan against
  SWAT's 560.
- **It went to 1.5, which is that rule with room to spare rather than by 21px.**
  Asked for as *"slightly more top down vision"*, and the case for it is that
  clearing SWAT by a hair means a dog that is *technically* able to look at
  whatever is shooting it, provided it happens to be pointing the right way at
  the time. **720 world px vertically, 360 at rest and 619 with the pan.** The
  cost is real and is paid by one connection: ground on screen sets both the fog
  polygon and how many entities are serialised per viewer, and 1.5 is ~113% of
  1.6 on both.
  - **`DOG_SIGHT_RADIUS` went 890 → 945 with it, and that is the half that is
    easy to forget.** The camera and the radius are one change: pulling the
    camera out without the radius is a dog lighting ground the server sent
    nobody for — an emptier street seen further, which is the exact opposite of
    what widening the view is for, and which shows up as nothing at all rather
    than as an error. `server/zoomderive.ts` now sweeps candidate *dog* zooms
    the way it always swept officer ones, and prints what each demands: at 1.5
    the furthest corner is 923 against the 945 sent, and **1.7 is already short
    of SWAT**.
  - **It was paired with the garrison hitting harder** — see
    `CITY_OFFICER_DOG_DAMAGE_MUL` under **The garrison is spread evenly**. More
    warning of the deterrent, and a deterrent that costs more when it is
    reached; widening the view on its own is a straight buff to the seat that
    already wins every flat-out chase.
- **`panYFor(zoom)` replaced the written-down pan.** Both terms depend on the
  zoom — the equal-awareness one because it is in world pixels, the
  `PAN_KEEP_ON_SCREEN` cap because it spends a fraction of the half-screen — so
  with two cameras it had to become a function or the two would drift.
- **Every use of the zoom goes through one `cameraZoom()` helper, and there are
  five**: the camera, the pan, the fog radius, the occluder clip, and the fog
  mask's world-to-mask scale. Miss one and the halves disagree about how much
  world is on screen, which is the shape of every fog bug this file has had.
- **`world.dogs.has(id)`, never `viewer.dog` — and this one compiles.** The
  server's `Entity extends EntityState`, so the wire's `dog` flag is in the
  server type and a check on it typechecks perfectly. **Nothing server-side ever
  sets it**; it is added in `toWire` off `world.dogs`. So the client sees a dog,
  the server sees `undefined`, and the feature silently does nothing. Measured
  before the fix: ceiling 719.9px, i.e. no change whatsoever.
- **It is not free**: ground on screen sets both the fog polygon's cost and how
  many entities are serialised per viewer, and 1.6 is ~152% of 2.0 on both. That
  is one connection, and the dog is the seat where it buys something.
- Measured A/B in one build with the old behaviour env-gated, 900 snapshots each
  driving a real dog seat over a socket — furthest entity sent: **ceiling 720.1px
  with 0 samples past 720**, against **889.6px with 1092 past 720 and 0 past
  890**. `DOG_SIGHT_RADIUS` is 890 against the 869 that 1.6 demands, and
  `server/zoomderive.ts` now checks both that and the SWAT rule.
- **The client half was checked by eye, not by rig.** rAF is throttled to
  nothing in a non-compositing browser pane, so no frame could be put on screen
  at 1.6 offline and the five zoom sites were confirmed by arithmetic alone.
  Driving a real dog in a real client afterwards, the picture is right — no dark
  band, no offset fog hole, which is what a mismatched `FOG_MASK_SCALE *
  cameraZoom()` would have produced. The server half is measured; this half is
  somebody looking at it.

**Sprint is free, because a dog is a player.** `world.stamina` and
`world.exhausted` are per-id and the HUD bar already reads them; `dog.ts` just
maintains them. It wins a flat-out chase (328 px/s sprinting against an
officer's 272) and pays for it — `DOG_STAMINA_DRAIN_PER_SEC` 62 against 46, and
a slower refill. That is the whole chase: a handful of seconds, then a decision.

**The HUD is two bars and a count, and they answer different questions.** The
jaws say *can I bite yet*; the hold says *how much longer must I stay on this
one*, with the part shaking has already torn off drawn as ground taken beyond
the live bar — without that second reading, worrying at somebody is
indistinguishable from waiting. Beside them is how many shamblers are left to
rise out of, which is the only number on the screen that only ever goes down,
so it sits *next to* the bar rather than in it: it is not a thing that fills.
Everything an officer's HUD does — the slot bar, the E prompt, the Q wheel, the
scroll — is simply not drawn for a dog. In the opposite corner is the one thing
an officer does *not* get: the corner map, below.

**Above them is the ability bar: four hexagons on Q, E, R and F.** Three are
filled — the roar, the acid and the transformation — and R is an empty outline
drawn anyway, because a bar that grew a hexagon at a time would shift the keys
already on it every time one was filled, and the whole value of a fixed row is
that a key is always in the same place. An outline says "there will be something
here"; a gap says nothing at all. **That claim has now been tested twice by the
thing it exists for**: E was filled in after Q and nothing moved, then F after E
and nothing moved. `roarcheck.ts` asserts the count and the two positions
either side of the gap, so a third filling cannot quietly shuffle the row.

- **The three rows are stacked, not squeezed.** An officer's stamina bar sits
  just above their slot row; a dog's has a taller row of hexagons under it, so
  the whole stack goes up together — `DOG_HUD_STAMINA_LIFT`, passed *into*
  `drawStamina`, which is shared with the officers and has no business knowing
  what a hexagon is. Measured off the canvas, in pixels up from the bottom:
  stamina **103-113**, hexagons **54-90** (down to 45 with a charge badge on
  one), jaws **20-36**. That is 13px and 9px of daylight, and `DOG_HEX_UP` is
  set against the *badge* rather than the hexagon because the badge hangs below
  it and cleared the jaws bar by two pixels at the first value tried.
- **Three readings per hexagon, and they are deliberately separate.** The key
  letter is what you press; the recharge fills it from the bottom in amber;
  running fills it the same way in red. Same direction, different colours,
  because "the two seconds are passing" and "it is recharging" are opposite
  states and one treatment for both is read wrong in the moment that matters.
- **The charge count is a badge, not a bar.** It is the only number on a dog's
  HUD that goes *up*, and a bar implies a ceiling it does not have. It is drawn
  only when there are charges: a nought on every hexagon every round is noise,
  and the badge appearing is itself the news that the ability now does more.
- **`client/roarrig.html` is the rig for all of that** — it imports the real
  `drawDogHud`, `drawStamina` and `drawEntity` at the true 1920x1080 and hands
  back row occupancy, so "the rows clear each other" is a measurement. Driven
  off `setInterval`, like `dogpose.ts`, because rAF is throttled to nothing
  while the browser pane is not compositing.

#### The roar (Q)

Two seconds of standing still with the head tracking the cursor, and then the
street comes. `server/src/dog.ts` owns it; `server/roarcheck.ts` is the harness
— headless, no socket, no port, so it leaves a game on 8080 alone.

- **Two halves, and they cost different things.** The **nearest twenty**
  shamblers are told to go where the cursor is pointing, and they cost nothing:
  the price of that half is the two seconds of a rooted animal in a city with a
  garrison in it. The **summons** walks one body in at the breach per person
  this dog has personally turned, and it spends the lot.
- **The order rides `lastSeen`, and that is the whole of the implementation.**
  The branch that walks a zombie to a place it saw somebody already exists, sits
  *below* the live chase and drops the order on arrival — so an order is an
  **attack move for free**: anything met on the way is chased instead. Exactly
  the trick `followTheChase` uses. Not one line of the zombie AI mentions
  roaring.
- **`targetId` is deliberately left alone.** Pulling a zombie off prey it can
  see would be undone by its own next perception tick a tenth of a second later,
  so it is churn that buys nothing — and a zombie already eating somebody is
  doing what the roar wanted anyway.
- **`DOG_ROAR_ORDER_MS` is 30s against `ZOMBIE_LAST_SEEN_MS`'s 9**, because a
  body summoned at the map edge may have four thousand pixels to cover. The cost
  of a long one is real and is already written down under `lastSeen`: that
  branch sits above every check that would notice a zombie getting nowhere. So
  `roarTarget` spirals out from the cursor until it finds a cell that is both
  unblocked *and* in the map's main walkable component, and orders that instead
  — measured, an aim into a wall comes out 26px away on open ground.
- **Two things here were added rather than asked for**, and both are one
  constant: `DOG_ROAR_COOLDOWN_MS` (8s) and `DOG_ROAR_RANGE` (2000). Without a
  cooldown the nearest-twenty half is free and a held Q herds the whole horde on
  a two-second loop, and the hexagon has nothing to fill. Without a range,
  "the nearest twenty" is a summons the whole city hears, which makes the horde
  one object with no geography and makes the summons pointless. Set either to 0
  / `Infinity` for the ability exactly as it was described.
- **The tally is *turned*, not *bitten*.** `world.dogConversions` is banked in
  `convert` — the one place a body actually becomes a zombie — so the grab that
  turns on the spot and the one that takes a minute both credit through one
  line. `world.infectedByDog` carries the claim across an incubation and is
  cleared by a cure, by death, and by the victim leaving the round; without that
  last part, somebody a dog bit, a medic saved and a shambler later finished off
  would still bank a charge. It lives on the world rather than on `DogState` for
  the same reason `dogDeaths` does — that state is deleted on every respawn, and
  a tally that reset itself each time the dog was shot would be a tally of
  nothing.
- **A mine cancels it.** Being dropped is meant to stop you doing anything at
  all, and a roar carrying on out of a body lying stunned in the road would be
  the loudest possible statement that the stun did nothing.
- **The tell is sent to everybody** (`roaring` on the wire, and it is in
  `ENTITY_FIELDS` — a dog is always already tracked by the time it roars, so
  left out of that list the flag could never arrive at all). The mouth rides the
  same `split` the jaws use, because a roaring dog's mouth is open and it is the
  same mouth. The rings are **arcs, not circles**: a closed circle expanding out
  of an animal is a blast, where nested open arcs facing one way is the shape
  everything from a speaker icon to a comic book uses for a noise going in a
  direction — and the ability is aimed, so the drawing has to be aimed. No
  per-frame state: each arc's position is its index plus the clock, modulo its
  own life, hashed off the id so two dogs roaring side by side do not pulse in
  lockstep.
- **It is the only sound in the game, and it is synthesised.** There is no audio
  anywhere else in the project, so a sample would have meant an asset pipeline,
  a loader, a preload and a format question for one two-second noise.
  `client/src/sound.ts` is oscillators and a noise buffer: two detuned sawtooths
  through a low-pass for the growl (detuned rather than one, because two close
  frequencies beat against each other and that beating is what stops a
  synthesised note sounding like a note), an LFO on a gain node for the guttural
  rattle, and a band-passed slice of noise swept down for the hiss. It ends on a
  downward pitch bend — everything alive runs out of air. The context is made
  **lazily**, inside the keypress, because a browser will not start one before a
  gesture. It is heard off the entities rather than off `dogHud`, so somebody
  else's dog is heard too, and on the *edge* of the flag — the wire carries it
  true for two seconds at 30Hz, so played off the flag directly it would start
  sixty overlapping copies of itself.
- **`ROAR_EARSHOT` is deliberately not `DOG_ROAR_RANGE`.** One is how far the
  sound reaches the horde, which is a rule about the game; the other is how loud
  it is in your headphones, which is a rule about the mix. Tied together, a
  balance change to one silently rewrites the other.

**A dog shot mid-roar kept the roar, and only a live socket found it.**
`updateDogs` bails out before `dogTick` for a dog that is down, so nothing was
left to notice the two seconds running out: the clock stayed set, the hexagon
reported it running for the rest of the round, and `roaring` stayed on the wire.
It is cleared in `killEntity` now, beside the corpse. Two things about it are
worth keeping:

- **The headless harness could not have found it**, because it calls
  `startDogAbility` and ticks — it never had a garrison shooting at anything.
  What found it was `server/roarlive.ts` driving a real dog over a real socket,
  where the city killed the animal *because it was standing still for two
  seconds*, which is the entire cost of the ability. It reproduces in roughly
  one live run in five.
- **It is now checked deterministically** rather than by chance: `roarcheck.ts`
  starts a roar, calls `killEntity`, and asserts the bar and the wire both come
  off it, that it rises again, and that no order is ever given. Gated back in
  behind a temporary env var, that is **2 FAILED against 0**.

**`server/roarlive.ts` is the socket harness**, and it exists for exactly the
gap above: it makes an offline lobby, sits in a dog seat, starts the round, and
sends `{"type":"dogAbility","slot":0}` as the keydown handler does. Point it at
a **second** server (`PORT=8090 npx tsx src/index.ts`), never the one somebody
is playing on. Two things it got wrong first, both the harness lying rather than
the code failing:

- **Counting snapshots measures the snapshot rate, not the roar.** It expected
  60 broadcasts at 30Hz and got 43 at ~21.7Hz — the two seconds are a fact about
  the server's clock, so it is measured as the longest unbroken wall-time spell
  the bar spent claiming to be running. Live: **1947-1957ms of a 2000ms window**.
- **Rooted means its legs stop, not that nothing can move it.** `moveDog` is
  skipped for the whole roar but `resolveCollisions` is not, so a shambler
  walking into a stationary dog shoves it a pixel — exactly as it shoves a
  planted bipod. Measured over five live runs: **0.00px on four and 1.64px on
  the one where something bumped into it**, against ~6px a step walking.

**The row is Q, E, R, F — not Q, W, E, R — because `KeyW` walks the dog north.**
It was built as Q/W/E/R and moved before anything went in slot 2, which is the
only cheap moment to move it: with W bound, every stride forward would have
fired the second ability, and that is unplayable rather than merely untidy.

- **It moved down one rather than dropping W and closing up.** The hexagons are
  a fixed row and the whole value of one is that a key is always in the same
  place, so shifting the lot keeps left-to-right reading order and keeps the
  roar on Q where it already was.
- **`KeyE` is free for a dog, and not by luck of layout.**
  `processInteractions` walks `world.playerIds` and bails on anything with no
  inventory — a dog has none — so E never reaches a door or a pickup for one.
  `input.ts` still latches `interact` on it; nothing on the dog's side reads it.
- **Which keys they are is the client's business.** The wire carries a slot
  *index* and nothing else — no key name, no cap — so a rebind is one array in
  `main.ts` and its twin in `render.ts`, and the server never learns about it.

Measured by `roarcheck.ts`, 65 checks: rooted **0.00px over the full 60 ticks**
with W held down (against 48.5px of free walking either side of it), the HUD
running on 60/60 of them; **20 of 40** shamblers in earshot sent and **0 of 6**
out of it, and the twenty are the nearest twenty; one body per charge walked in,
all on the outbreak's own edge, none in geometry, 270px apart at the widest; and
on the tally, **111 charged against 111 turned of 120 bitten** by a dog, against
**0 charged of 114 turned** by a shambler — which is the check that says it
counts bodies rather than bites.

#### The acid (E)

**It spits, and what it spits is cover.** A gobbet arcs to the crosshair and
leaves a cloud that slows anybody caught in it, that nobody can see through, and
that anybody standing in it cannot see out of **at all** — while the horde and
the dog itself see straight through the stuff as though it were not there.
`server/src/acid.ts` owns it, `shared/acidshape.ts` is its shape;
`server/acidcheck.ts` is the harness and `server/acidlive.ts` drives the message
path over a real socket.

It answers the same problem the roar does from the other end. A dog has no
ranged attack and nothing in its hands, so every fight it takes is one it has to
cross open ground to reach — and the garrison is spread evenly across the city
precisely so that crossing open ground is expensive. The roar brings the street
to you; this takes the street's line of sight away.

**Almost none of it is new code, and that is the design.** A cloud is a
**cluster of circles**, which is exactly the shape `Bush` has seven of:

- `hasLineOfSight` gets a dozen lines beside the foliage test, and the client
  hands its clouds' lobes to `visibilityPolygon` **as `Bush`-shaped circles** —
  so "acid is a line-of-sight blocker" needs no new occluder kind and no second
  code path on either side, and inherits the near-first ordering and the
  viewport clip that make the polygon affordable for free.
- `AcidState` carries the same `{x, y, r}` a `Bush` does — `r` being the
  *bounding* radius — plus a seed the lobes are derived from and an `a` and a
  `t` the fog path simply ignores.
- **The flight is a grenade** — the same `bouncesOff`, the same `GRENADE_BOUNCE`,
  the same axis-at-a-time reflection, exported from `heli.ts` rather than
  written twice. See **A gobbet bounces** below.
- **It lands where the crosshair is**, clamped to `DOG_SPIT_RANGE` and floored at
  `DOG_SPIT_MIN_THROW` — the rule the flamethrower needed, for the same reason: a
  direction with no distance puts every cloud at maximum range.

**A cloud is a cluster of lobes, not a disc, and lumpy had to mean *more
circles*.** `shared/acidshape.ts` is the whole of it: seven circles — a core and
six petals — at bearings, distances and radii hashed off one seed.

- **A circle is the only occluder shape both halves of this game know how to
  handle.** The server's `segmentCircleT` and the client's `rayCircle` are what
  a `Bush` already goes through, and a radius-per-bearing outline like the
  pond's would have needed new ray maths written twice and kept in step. Seven
  circles needed neither.
- **It is derived from a seed rather than sent as geometry**, the way the park's
  lamp posts come off the path polyline and the dog's saliva comes off its id.
  Three separate places need the identical shape — the server's sight lines and
  slow, the client's fog polygon, and the client's drawing — and the drawn rim
  has to sit exactly where the occluder edge does, or there is a ring of ground
  you can neither see through nor see anything in. A shared pure function is the
  only arrangement in which those three cannot drift apart. The wire cost is one
  integer.
- **No lobe reaches past `r`.** That radius is what the wire carries, what the
  fog cache keys on and what every cheap rejection in front of the lobe walk
  uses, so a lobe bulging past it would occlude ground the rest of the code has
  already decided is outside the cloud. The clamp is on the lobe's own radius,
  which is what leaves the silhouette *short* of `r` in places — the notches —
  rather than pulling it in everywhere.
- **The petals are knocked off their even bearings** (`ACID_LOBE_JITTER`). Left
  even, the notches between them are evenly spaced too and the thing reads as a
  flower — the same lesson as five evenly bright ribs on the dog and the park's
  edge fade.
- **The lobes are written once a tick by `updateAcid`, into the array the cloud
  already holds.** Same reasoning as `AcidCloud.r`: `hasLineOfSight` takes no
  clock and must not allocate, so it reads a number somebody else wrote rather
  than evaluating a growth curve of its own.

Measured over six seeds, walking in from beyond the rim along 90 bearings: the
gap between the deepest notch and the furthest bulge is **0.21 to 0.40 of the
radius** depending on the seed, where a disc's is exactly zero; nothing reaches
past the bounding radius; two seeds are two different clouds and one seed is the
same cloud twice. On the client's own canvas, the same sweep against the drawn
pixels puts the edge at **0.78 to 1.00 of `r`**.

**What it costs is coverage, and the honest figure is 81.7%** — equivalent to a
disc of 118px against the 130 it replaced. That is the trade a scalloped edge
makes and it is smaller than it sounds, because occlusion is not an area
question: what stops somebody seeing across the road is whether *a* lobe sits on
the line. Swept as parallel chords over the cloud's whole width, **45 of 48** are
still stopped, and the three that thread a notch are at the very edge; over eight
seeds and four rotations the worst any of them managed was 88%. If a cloud ever
plays small, `ACID_CLOUD_RADIUS` is the knob — the shape constants trade
lumpiness against coverage roughly one for one, and the current values sit at the
best of both, a sweep of six alternatives putting every lumpier one at 76-79%
coverage and 81-85% of chords.

**The slow is in `speedAt`, which is the one function every mover in the game
already goes through** — civilians and zombies through `ai.ts`, the dog through
`moveDog`, a player through `updatePlayers`. Written instead as a sweep over
bodies in `updateAcid` it would be a *second* place that knows what a cloud is,
and the first new kind of mover added afterwards would silently walk through the
stuff at full speed. `speedAt` took an optional `EntityType` for it, so anything
that can be exempt has to say what it is.

- **Zombies are exempt, and the dog is a zombie.** It comes out of one of them,
  and an ability that slows your own horde and yourself is one nobody spends a
  cooldown on. Measured: a human in a cloud does **19.3 px/s against 35**, the
  garrison the same, and the horde **35.0** — untouched.
- Guarded on `world.acid.size` so the ordinary case, no acid anywhere, is one
  integer compare in a function called for every body every tick. Same guard in
  `hasLineOfSight`, which is the hottest predicate the server has, with the
  cloud's **bounding radius** in front of the lobe walk so a cloud across the
  city is rejected by one `hypot`. Neither uses a broadphase: clouds are single
  figures and short-lived, so one would cost more to keep than to skip.
  Measured over 4000 sight lines in a 700-wall city, **8 clouds cost nothing
  measurable** — 1.34us a line against 1.11 with none, where three consecutive
  no-acid runs in the same process spread 0.93 to 1.24. It is below the noise
  floor, not merely small.

**Gunfire still goes through it, and that is unchanged.** `fire` never asked
`hasLineOfSight` about walls in the first place — it runs its own hitscan — so
the acid has never stopped a round and does not now. It is cover you cannot see
through rather than cover you can hide behind, the same trade the sandbags make
from the other side. Shooting blind into a cloud works exactly as well as it
ever did; knowing what to shoot at is the part it takes away.

**A cloud you are standing in blinds you outright, and that is the bush rule
deliberately broken.** A bush you are inside does not blind you — you see out,
others cannot see in, and that is what makes hiding work. A cloud of acid is the
opposite of hiding: you are in the middle of the stuff with your eyes streaming
and there is nothing to see in any direction. So a viewer inside one fails every
sight line they ask about — no entities, no loot and no tracers sent, and
nothing perceived by an NPC standing in it either. It is *not* exempted by
`seeThroughBushes` either: that flag means an officer is trained and looking for
this, and training is not a defence against a chemical.

**What keeps that an ability rather than a liability is `eyesOf`, and it is the
only thing `hasLineOfSight` gained.** Walls, doors and bushes are geometry —
they stop a sight line whoever is asking, and they stop a blast wave asking
whether it reaches. A chemical cloud is not geometry; it is something you cannot
*see* through. So it applies only when somebody is actually looking, and only
when that somebody is not what it came out of. Three cases, two of which ignore
the acid:

- **a zombie's eyes** — ignored. The dog is a zombie with a flag on it, so the
  animal sees in its own cloud and straight out through everybody else's, and so
  does the horde. One line covers both.
- **anybody else's eyes** — the cloud occludes, and standing in one is zero
  vision.
- **no eyes at all**, which is the default — ignored. A blast asking whether it
  reaches a body is not looking at it, and under the other default a grenade
  thrown into a cloud would quietly do nothing at all. That case is what decided
  which way round the default goes; every perception and every fog test passes
  one explicitly, and the list is short and enumerable.

Measured on the harness, staged on a lane the rig *finds* rather than assumes: a
600px line across a cloud is broken for an officer as well as a civilian, a
zombie has the same line, and somebody stood in the middle of it sees out on **0
of 32 bearings** — against a dog on the same pixel seeing out on **17 of 17**,
which is every bearing the city itself left open. That control is load-bearing:
without it, "the human saw nothing" is satisfied just as well by a rig that
staged its cloud inside a building. Live over a socket, a dog stood in its own
cloud for 230-242 snapshots and the city kept arriving on every one.

**Its client half is `ACID_INSIDE_SIGHT` (46), and it is a hole rather than a
closure.** The rule is enforced on the server, so the screen is genuinely empty
whatever the client does; this is only how "nothing" is *drawn*. Closing the fog
outright is the one thing not to do — a visibility polygon with nothing in it
collapses onto the viewer, and that collapse is exactly what both of this game's
worst rendering faults looked like from the outside. `drawAcidMurk` puts the gas
over the top of it, so being blind reads as being blind rather than as the
renderer having given up. **The fog watchdog is stood down while you are in
one**: the radius is 46px, so open ground fills nearly all of a very small
circle and the visible fraction jumps hard on the way in and out — both of its
tests fire, and both would be crying wolf. This is now the second known cause of
that, after walking from a street into a room.

**Being unable to see is a real effect, and it is the splash that hands it out.**
`ACID_IMPACT_RADIUS` (62) is much smaller than `ACID_CLOUD_RADIUS` (130), and
that gap is the whole ability: the cloud is an area everybody works around, where
the splash is a wet moment that catches whoever was standing exactly there. Make
them the same number and it stops being aimed at anything — it becomes a stun
grenade with a nine-second tail.

- **They look around and they do not move.** `blindedTick`, its own branch in
  `updateAi` rather than an entry in `frozen`, and the difference is the point:
  frozen skips an entity outright, where this one still turns. Somebody stood
  dead still on a bearing reads as the game having stopped paying attention to
  them, which is exactly what standing about looked like before `settledTick`.
- **The sweep is latched against the deadline, not against a flag.** A second
  gobbet landing on somebody already blind pushes the deadline out, which is a
  different number, which re-centres the sweep on wherever they are facing now —
  so nothing has to clear anything up when the blindness lifts and there is no
  stale bearing for the next one to find.
- **Not zombies, and not players.** Zombies because it comes out of one; players
  because "looks around but does not move" is a description of an AI, and the
  honest translation for somebody holding a mouse is having the controls taken
  away — which a mine already does, and which the dog's own stagger was
  deliberately softened to avoid being. A player in the splash gets the cloud's
  slow like everybody else and keeps their legs.
- **Rarely, they say why** (`ACID_BLIND_LINE`). Rolled once, at the moment the
  acid lands, rather than per tick while they are blind — everything with a
  chance on it here has to be, or a "rare" reaction evaluated thirty times a
  second always happens. Measured over 200 spits: **32 said it**.
- Measured on the rig: the body under the splash is blinded and moves **0 of 40
  ticks** while sweeping **0.6-1.2 rad**; a body 141px out, inside the cloud but
  outside the splash, is not; a zombie under it is not; and the control — a
  civilian nobody threw acid at, in the same city over the same window — plainly
  walks.

#### It is earned, it is slow, and it does not go far

Three numbers, and they move together: **fifteen conversions to unlock it, an
eighteen-second cooldown, and 380px of throw** against a 945px view. A cloud you
have to earn, place close, and then wait a long time for is a thing you site;
one that is free from the first tick, thrown across the street and available
every eleven seconds is a thing you spam.

- **`DOG_SPIT_UNLOCK_AT` (15) reads `world.dogTurned`, and that is a *second*
  counter beside `world.dogConversions` on purpose.** They are incremented on
  the same line in `creditConversion` and they are not the same kind of number:
  `dogConversions` is a **balance** the roar spends whole and sets to nought,
  `dogTurned` is a **total** nothing spends. Gate the unlock on the balance and
  the roar takes the acid away again — turn fifteen, the hexagon opens, roar,
  and it locks itself with fifteen to go. `acidcheck.ts` checks exactly that
  sequence, with the roar's own badge emptying in the same run as the control.
- **The hexagon says how many are left, in the badge's place.** A locked
  ability that says nothing is indistinguishable from a broken one, and the
  count *is* the instruction: it says the thing exists, that biting people is
  what earns it, and how much further there is to go. Drawn cold and dashed
  rather than with the amber recharge fill — a cooldown comes good on its own,
  and this one only moves when you bite somebody, so one treatment for both
  would be read wrong.
- **`DOG_SPIT_COOLDOWN_MS` is 22s**, and it is *longer* than the roar's now
  where it used to be shorter. Without a cooldown at all a held key lays a wall
  of the stuff across the map with no decision left in it.
- **And it survives being killed**, which at this length it has to: a death and
  a birth together are under four seconds, so the cheapest way to have the acid
  back was otherwise to go and get shot. See **A cooldown outlives the body**.
- **`DOG_SPIT_RANGE` is 380**, down from 620, and still deliberately far shorter
  than `DOG_SIGHT_RADIUS`: it must not be possible to lay a cloud on ground you
  cannot see, or the ability becomes a way of editing the map at a distance.

#### A cooldown outlives the body

**`World.dogCooldowns` is where an ability's next-ready deadline lives**, keyed
by connection and by ability slot. It used to be a pair of fields on `DogState`,
and `finishDogBirth` *deletes* that — which is right for everything else in it
(the neck, the jaws, a bite in progress, a roar in progress all belong to the
body that just died) and wrong for a cooldown. At 22 seconds against a death and
a birth of under four, the cheapest way to have the acid back was to go and get
shot.

This is the same fault, and the same fix, as `dogDeaths`, `dogConversions` and
`dogTurned`: **anything about the dog that is not about its current body has to
live out on the world**, because the state keyed to the body is deliberately
rebuilt from scratch every time one dies.

- **Cleared by `spawnDog`, not by `finishDogBirth`.** Those are the two ways a
  dog gets a body and only one of them is a new dog: `spawnDog` is a fresh
  round or somebody joining one, `finishDogBirth` is the same animal getting up.
  A fresh round starts with everything ready; dying is not a way to have it back.
- **An array by slot, not a field per ability.** The bar is a fixed row and the
  whole value of one is that nothing shifts when a slot is filled in — a third
  ability should need a constant and a branch in `startDogAbility`, not another
  map on the world.
- **`readyAt` and `coolDown` are two lines each and exist so nothing else knows
  the shape of the map** — which is exactly how the deadline came to be on
  `DogState` in the first place and stayed there unnoticed.
- **The roar's cooldown moved with it**, and that was not separately asked for.
  It is the same mechanism and the same exploit, only smaller — an 8s cooldown
  against a 3.9s death is a partial refund rather than a full one — and storing
  one of the two out here while leaving the other on state that gets deleted
  would be a bug waiting to be rediscovered. Trivially separable if the roar
  should keep resetting.
- **`roarStartedAt` deliberately stays on `DogState`.** A roar *in progress*
  genuinely does belong to the body carrying it, and being shot out from under
  one is meant to cost it — see the note about a dog shot mid-roar under
  **The roar (Q)**.

Measured in `acidcheck.ts`, and the strong form of the check matters: "still
refused" would pass just as well for a cooldown that had been reset and merely
restarted, so what is asserted is that the **time remaining matches the clock**.
Spit, get killed, ride out the death and the birth, come back up: **18000ms
left against 18000ms expected after 4000ms spent dead** — and it still comes
good on its own clock afterwards, which is what says it did not simply stop.

#### A gobbet bounces

*"The projectile will bounce off walls if it hits it before landing, like the
grenades in the game."* It is the grenades' code, not a copy of it — `bouncesOff`
is exported from `heli.ts` and `GRENADE_BOUNCE` is shared, because they come off
the same walls, the same intact glass and the same shut doors and two copies of
that set would drift the first time one of those three changed status.

**What had to change is that the landing point is no longer known at launch.**
The flight used to be `sprayFlame`'s trick — work it out on the tick the key went
down, against the geometry as it stood, then wait. That is right for a
flamethrower, whose stream is stopped dead by the first wall. A gobbet comes off
the wall, so the position is integrated instead and `spitsToWire` sends where it
*is* rather than a fraction of the way to where it was going. A client drawing
the chord would show it passing through the wall it had just come off.

Two things about that are not obvious and both were measured:

- **It is substepped, and it has to be.** 380px in 420ms is about 30px a tick
  against a `WALL_THICKNESS` of 10 — stepped whole it jumps clean over an
  interior wall and lands on the far side. Measured that way the rig read **1 of
  8 landing past the wall**, intermittently, which is what tunnelling looks like:
  it depends where in the step the wall falls. Half a wall's thickness is the
  step now, which is five or six extra point tests per tick on one short-lived
  object. *The grenades have the same shape of risk and are not substepped* —
  they cover a comparable distance over `GRENADE_FLIGHT_MS` (850) so their step
  is less than half of this one's, but it is worth knowing if either number
  moves.
- **The last step is charged only for what is left of the flight**
  (`AcidSpit.flownMs`, not a `firedAt` against the clock). A tick is 33.3ms and
  the flight is 420, so running until the *age* passes the flight takes fourteen
  whole steps for thirteen ticks of travel and lands ~3% long — visibly past the
  crosshair on a clear throw. Measured after: **0.00px off**.

Measured, staged against a wall the rig finds rather than assumes: **0 of 8 land
past it**, **8 of 8 rebound** rather than sticking to it, and a clear throw is
still exactly on the crosshair.

*One thing about measuring this was the rig lying rather than the code failing,
and it is the usual one.* `acidcheck`'s rig stood the dog at a fixed (2000, 1500)
— safe only while a gobbet passed through walls. Bouncing, that spot is inside a
shop on some cities and against a party wall on others, and the failures moved
from run to run: one run lost the splash tests, the next had the cloud 465px from
the crosshair. `openThrow` finds ground with a clear throw east of it, sampled
with **`bouncesOff` itself** rather than `nav.isBlocked` — those are not the same
set, a shut door being solid to a thrown thing and deliberately not in the nav
grid.

#### And a blue officer gets out of it

*"Blue officer bots need to stay away from the zombie dog's spit cloud and if
they get caught in it need to get out ASAP."*

**Standing in a cloud is the worst place an officer can be, and nothing about it
feels urgent from the inside.** The slow is the small half. The real cost is the
fog: `hasLineOfSight` fails every line for a viewer inside one and zombies are
exempt, so a bot in acid has an empty `threatPoints`, no target, nothing to shoot
at and no reason it can perceive to move, while the horde walks in at it. It
cannot notice, because noticing is exactly what the cloud takes away.

- **`acidBoltTick` is a branch of its own above everything**, including the
  post-grapple flight — which decides it is clear by reading `threatPoints`, and
  inside a cloud that list is empty, so a bot would call itself safe standing in
  the middle of the stuff.
- **Straight out, on the bearing off the cloud's centre**, sprinting, with the
  gun still up. Not `escapeDestination`: that reads the danger field and is a
  question about zombies, where a cloud is a piece of ground and the shortest way
  off it is the way you came.
- **Clear is `BOT_ACID_CLEAR` past the bounding radius**, measured from the
  centre rather than by asking `acidCloudAt` again — the lumps mean the real rim
  sits inside the bounding radius in places, and a bot that stopped the instant
  `acidCloudAt` came back null would stop in a notch with the cloud all round it.
- **A blinded bot still gets out**, and it is the one exception to
  `blindedTick`. It is still blind while it does — no perception, no target, no
  shooting, walking a bearing it did not choose — which is what "get out ASAP"
  has to mean for something that cannot see, and is deliberately much narrower
  than lifting the blindness. Civilians and grey officers keep the old behaviour
  whole. Without this a bot caught by the splash stands in the middle of the
  cloud sweeping its head for the whole of `ACID_BLIND_MS`.
- **And it will not walk into one**: `botPatrolTarget` refuses a sample in a
  cloud and `lootWanted` refuses a pickup lying in one. A cloud lasts
  `ACID_CLOUD_MS` and the rifle will still be there afterwards.

**The obvious control does not discriminate, and that cost a measurement.** "The
bot left the cloud" is satisfied just as well by a bot that was walking somewhere
anyway: against a bot dropped on the same pixel of the same city with no acid on
it at all, clearing the same 190px took **1.2-1.7s either way**, because a
patrolling officer covers that in about a second and a half regardless.
`setBotIgnoresAcid` is the gate and it is kept for that reason. Both behaviours
over the same staged cloud, eight runs: **got clear in 1.2-1.3s against 2.6-3.0s**,
8 of 8 out inside three seconds, and a civilian dropped on the same pixel has
moved **17-28px** when the bot has gone.

**The hexagon carries no badge**, unlike the roar's. `charges: -1` rather than 0:
the badge is for an ability that banks something, and a nought under a hexagon
every round is noise — the badge *appearing* is itself the news that the roar now
does more. Nothing runs in it either (`active: -1`), because spitting is over on
the tick the key goes down; what happens afterwards belongs to the gobbet and
then to the cloud, neither of which is the dog.

**The fog cache needed a fourth input.** Its three were where the viewer is, how
far they see, and what is standing in the way — and a cloud boiling out is a
change to the third exactly as a door swinging is. Without `acidEpoch` beside
`doorEpoch`, a polygon computed a moment before one landed would go on lighting
ground straight through it for as long as the viewer stood still, which being
cached could be the whole nine seconds. It is keyed on the **rounded** radius the
server sends, so the epoch is stable for the most of a cloud's life it spends at
full width and the rebuilds are confined to the half second it grows. **The lobe
offsets do not drift for exactly that reason** — only the scale grows. Written
the obvious way, with each lump orbiting slowly over the cloud's life, the epoch
would move every snapshot and the polygon would be thrown away thirty times a
second for nine seconds. The churn is in the drawing, where it is free.

**The row is Q, E, R, F, so this needed no keybinding work at all** — `KeyE` was
already slot 1, and `KeyE` is free for a dog because `processInteractions` bails
on anything with no inventory. Which keys they are stays the client's business:
the wire carries a slot *index* and nothing else.

**The drawing has a defined rim, unlike the smoke it is otherwise built like.**
Smoke fades to nothing all the way round; this cannot, because it is an occluder
and the fog stops exactly where the lobes do — so a cloud that faded out before
its own occluder edge would have a ring of ground you can neither see through
nor see anything in. The churn rides inside the rim, hashed off the cloud's own
age (`t` on the wire) and its seed, so there is no per-frame state and two clouds
side by side do not boil in lockstep.

**Nothing in it is clipped, and everything is drawn inside a lobe.** Clipping to
the union was the obvious way to guarantee the rim and it measured **1.56ms a
cloud against 0.54** — the clip itself is nothing (0.006ms), but every fill made
through one pays, and a whole scene at 1920x1080 paints in about 4.9ms. Filling
each lobe's own arc gets the same guarantee for free: a fill bounded by a circle
cannot land outside that circle, and every circle *is* the cloud. The union
`Path2D` went with it — one flat fill of a seven-arc path measured **dearer than
all seven gradient fills together** (0.33ms against 0.26), because the cost is
the path rather than the pixels. Final: **0.31ms for one cloud, 0.85ms for
three.**

- **One highlight over the core, not one per lobe.** Each lump carrying its own
  bright centre reads as seven bubbles stuck together rather than as one mass
  with lumps in it. The highlight is drawn inside the core lobe alone, which is
  what lets it exist without a clip.
- **The churn is attached to a lobe** and kept well inside it, which is how it
  moves without needing to be clipped either.

**`drawAcidMurk` is the picture of standing in one**, and its still half is
baked once and blitted — the same trick and the same reason as the vignette and
the grime tile. Two full-screen alpha fills measured **4.6ms**, which is most of
a frame for something that never changes; baked, with only three drifting blobs
live, it is **1.9ms**, and it is only ever drawn while somebody is actually
stood in the stuff, on a frame that by definition has almost nothing else on it.

**`client/acidrig.html` measures the drawing**, for both this and the birth.
rAF is throttled to nothing while the browser pane is not compositing, so no
frame of a live round can be put on screen from here — but `getImageData` needs
no compositing at all, which is what turns "it looks right" into a number. It
imports the real `drawAcid`, `drawAcidMurk`, `drawSpits` and `drawEntity` and is
driven off `setInterval`, like `dogpose.ts` and `roarrig.ts`. Measured: **ink at
the centre of a cloud and none past its bounding radius** (that is where the fog
stops, so ink beyond it would be a cloud claiming ground it does not occlude),
green the dominant channel, the murk green over the whole frame including the
corner, the gobbet and its shadow both down, **11 of 11 sampled birth frames
rendering differently** with the vibration half plainly unlike the arms half —
and the control, an ordinary zombie over the same clock steps, identical on all
11, so the movement is the birth and not the clock. Nothing threw.

**How lumpy it is comes off the same canvas as a number**, walked in from beyond
the rim along 48 bearings: the drawn edge starts anywhere from **0.78 to 1.00 of
the bounding radius**, where a disc answers the same figure at every bearing.
Two seeds also have to draw two different clouds, or the shape is a texture
rather than weather. Note `cloudInkInside` comes off that sweep rather than off
one sample — a fixed bearing 8px inside the rim is solid on a bulge and empty in
a notch, and which one it lands in is the seed's business.

**`server/acidlive.ts` throws it at the animal's own feet, and that is the whole
design of the live run.** `DOG_SPIT_MIN_THROW` is a floor as well as
`DOG_SPIT_RANGE` being a ceiling, so a crosshair on yourself still puts the
gobbet 90px out — and the cloud is 130 wide, so the dog is stood *inside* its own
acid the moment it lands. That is the one claim only a socket can settle: the fog
is server-enforced, so "a dog sees in the acid" means the entities keep arriving
on its own snapshots. Walking to a cloud thrown the full 300px was the first
version and it is the *city's* decision whether that works — measured over three
runs it arrived once and came up 79 and 120px short on the other two, against a
garrison shooting at a stationary animal. Two further things the live rig had to
learn:

- **It throws inwards, toward the middle of the map.** The dog comes in at the
  breach, which is on an edge, so a fixed bearing put the cloud through the
  boundary wall as often as not.
- **The claim is that it does not go blind, not that the count holds up.** "No
  fewer inside than out" was tried and a live city does not support it: the dog
  stands still for eight seconds while the crowd walks in and out of an 890px
  radius, so the figure drifts on its own and it read 13 against 16 and failed on
  the weather. Going blind is exactly 0. Measured: **230-242 snapshots stood in
  its own cloud, 8-27 entities still arriving on every run**, and a run where the
  city had nobody in sight either way is reported rather than passed or failed.

*Two things about measuring this were the rig lying rather than the code
failing*, and both are the staging:

- **Aiming at the dog's own feet does not put a cloud on them.**
  `DOG_SPIT_MIN_THROW` is a floor as well as `DOG_SPIT_RANGE` being a ceiling, so
  a crosshair on yourself throws it 90px out on whatever bearing you were facing.
  The first sight-line test staged its geometry around the dog and was measuring
  a cloud 90px from where it thought it was.
- **The splash is 62px across, so everything staged inside it is within arm's
  reach of everything else staged inside it.** A zombie put under the splash to
  prove the horde is exempt promptly grabbed the civilian whose stillness was
  being measured; `frozen` swallowed them a branch *above* the blinded one and
  the head stopped sweeping. It read as the sweep barely working — 0.28 rad
  against an expected 1.25 — rather than as a rig feeding one subject to another.
  The horde check runs in a rig of its own now.
- And the map is not seeded, so the sight-line test **finds** a clear lane rather
  than assuming one. Staged at a fixed spot its *control* failed on roughly half
  of all cities, which is a test reporting the city rather than the code.
- **`speedAt` also knows about bushes, and roughly one city in ten puts one
  under the landing point.** Every pace in the harness is therefore measured
  against the *same ground with the cloud lifted off it*, never against
  `HUMAN_WALK_SPEED`. Measured the flat way it read **10.6 px/s where 19.3 was
  wanted and a horde "slowed" to 19.3 where 35 was wanted** — a bush multiplier
  stacked on top of everything, failing five checks at once and none of them
  about the acid. The one-point version got away with it for as long as it did
  by only ever sampling due east of the cloud; a 64-bearing sweep walks into a
  hedge sooner or later and reported **10 of 64 bearings slowed past a rim
  nothing reaches**.

#### It tears itself open (F)

Two seconds of vibrating on the spot while tentacles rip out of the body, then
twenty seconds of something six times as tough and much slower — throwing those
tentacles at whatever the cursor is on — and then it bursts into a toxic cloud
and a scatter of its own parts. `server/dog.ts` owns it; `server/morphcheck.ts`
is the harness, and `client/lashrig.html` measures the drawing.

**The whole ability is a trade of speed for presence.** Everything else the dog
has is about arriving somewhere before the street is ready. This is about being
somewhere the street cannot deal with, for twenty seconds, and paying for it
with a life and four minutes.

- **It is earned by the outbreak, not by this dog.** `DOG_MORPH_UNLOCK_CONVERTED`
  (101) reads `world.totalConverted` — one shared counter, incremented once in
  `convert`, the single function every human-to-zombie conversion in the game
  passes through however it got there. A shambler finishing an incubated bite
  on the far side of the map counts exactly as much as this dog's own jaws do,
  which is the whole of what "by other zombies and yourself" means. The
  mechanism this replaced (forty personal infections, or one blue officer down
  anywhere) rewarded either a dog's own tally or a death that need not involve
  a conversion at all; this is explicitly about turning, and only turning.
- **Deliberately not per-dog.** `dogConversions` and `dogTurned` stay a
  particular dog's own balance and total, for the roar; `totalConverted` is the
  city's, shared by every zombie in it. A second dog with nothing of its own to
  show for the round — no bites, no lashes fired — gets the ability the instant
  the shared tally crosses the line, because the threshold belongs to the
  outbreak rather than to any one animal. Measured on the harness: refused with
  its own tally at zero, and taken the moment `totalConverted` alone is moved
  to 101.
- **Only a genuine conversion moves it — a kill does not.** Shooting somebody
  dead outright never touches `world.totalConverted`, staged and checked
  directly against `killEntity`. A round can therefore go badly — a garrison
  cut down, buildings lost — without the ability opening a moment sooner than
  the city's own dead have actually started walking.
- **101 rather than a round number.** It reads as a threshold the outbreak
  crosses almost by accident partway through a bad round, not a target a
  player is chasing turn by turn the way `DOG_SPIT_UNLOCK_AT`'s fifteen is.
- **Rooted for the wind-up, at a tenth of the damage.** Two seconds standing
  still in the open is the whole vulnerability of a four-minute ability, and
  without `DOG_MORPH_DAMAGE_MUL` the counter to it is "shoot it while it stands
  still" — it would never once complete in front of anybody worth using it on.
  The form that follows takes rounds like anything else; what it got instead is
  the health. Measured through the real `fire` path with a bolt action: **41hp
  before, 5hp during, 43hp after**.
- **`DOG_MORPH_RADIUS` is 21 and cannot be much more, and the first value
  written here was wrong.** `DOG_RADIUS` is 19 — a *radius*, so a 38px body —
  and the tightest opening a city cuts is 46px. 42 was written on a misreading
  of that as a diameter, which would have been an 84px body squeezing through a
  46px gap: a monster locked out of every building in the city and locked
  *into* one if it transformed indoors. The **drawing** nearly doubles instead
  (`DOG_MORPH_ART_MUL`), which is the same `DOG_RADIUS`/`DOG_ART_RADIUS` split
  the animal already makes. The harness asserts the doorway sum rather than the
  number, so the next person to raise it is told why they cannot.
- **The sprint is the cost that is felt.** An ordinary dog's sprint is what wins
  it every flat-out chase in the game; at this size it is barely quicker than
  the walk. The *walk* is untouched — a monster that could not cross a street
  would spend its twenty seconds where it stood. Measured on the same pixel of
  the same city, transformed against not: **93px against 189px over 0.67s.**

**F does two things and which one is not a mode anybody sets.** Out in the world
as the thing, it strikes; anything else, it begins the transformation. The row is
Q, E, R, F and W walks the dog, so there is exactly one free key and this
ability wants both halves of it — and nothing has to be learned, because while
you are the monster, F is what the monster does. The strike is therefore checked
*above* the transformation's own cooldown, or F would be dead for the twenty
seconds it is most wanted.

##### The strike is the arms on its back, and it is telegraphed

Reported as *"right now pressing F spawns a tentacle that comes from the middle
of the dog and I would rather the ability use the tentacles in the screenshot. I
want the ones that are on his back to recoil back and then launch in the
direction of the cursor"*, with a red warning circle *"that PLAYERS can use to
dodge"*.

The old lash was a hitscan drawn as a line: `startDogAbility` picked the nearest
body along a 26px corridor, infected it, and pushed a curve onto `world.lashes`
for 220ms of decoration. Nothing about it could be dodged, because nothing about
it took any time, and the drawing came from the middle of the animal because
there was nothing else for it to come from.

**Three phases now, and the first one is the whole feature.**
`DOG_LASH_WINDUP_MS` of coiling, `DOG_LASH_STRIKE_MS` of going out,
`DOG_LASH_RECOVER_MS` of coming home — and nothing is resolved until the arms
arrive. `startDogAbility` locks a landing point and starts a clock; `updateLashes`
lands it.

- **The aim point is locked at the keypress and never re-read.** A ring that
  tracked the cursor would be a warning of nothing: whatever it showed you, the
  strike would still land wherever the mouse had got to. Locking it is what turns
  the ring from decoration into information.
- **It is a circle, not a corridor.** `DOG_LASH_IMPACT_RADIUS` (48) around the
  landing point catches everybody standing in it, where the old lash took the
  first body on a line and stopped. A line has nowhere safe to stand and nothing
  a warning could usefully show; a *place* can be stepped out of, which is what
  the ring is drawn around. It also means siting the thing is a decision — a
  crowd standing together loses the crowd.
- **420ms is derived from the dodge, not picked by eye**, and the first value
  tried was 340 because 340 *looks* like a telegraph. Clearing the circle from
  dead centre means putting your own centre past 48 + a 12px body = **60px**,
  which at `PLAYER_SPEED` (160) takes **375ms** walking and 221ms sprinting. At
  340 a walking player covers 54px — six short — so being caught in the middle
  could only ever be answered by a sprint, which is a telegraph most people
  cannot answer while they are also being shot at. At 420 a walk clears it with
  7px to spare. A **civilian** covers 15px and cannot dodge at all, which is
  correct rather than a shortfall: they are the crowd the ability is *for*.
- **The landing point stops at the first wall on the way**, walked in
  `WALL_THICKNESS / 2` steps for the same reason the gobbet is substepped. A ring
  drawn inside a building the dog is stood outside of promises an impact that
  `hasWallClearPath` then refuses for everybody in it — a warning that costs
  whoever obeys it their position for nothing.
- **`DOG_LASH_COOLDOWN_MS` went 650 → 850**, which now covers windup + strike +
  snap-back (790) with room to spare, so one strike is fully back on the animal
  before the next coils. 650 fired again mid-recovery — fine while the lash was
  an instant line and wrong now that the limbs are the drawing.
- **A strike still coiling dies with the animal.** `killEntity` filters
  `world.lashes` beside clearing the roar, and for the same reason: the windup is
  the officers' whole answer to this ability, and a strike that landed anyway out
  of a dog that had been shot would be that answer doing nothing. Filtered rather
  than flagged, so nothing downstream has to learn that a strike can be orphaned.

**Armour gates the infection and nothing else.** Everybody caught is shoved and
bleeds; only somebody with nothing on turns.

- **Shield, then vest, then the infection** — the order `attemptGrab` and
  `resolveGrapple` already use between them, and it is not arbitrary: a shield is
  held out in front and stops the thing before it reaches you, where a vest is
  what is left once it already has. Written the other way round, a player
  carrying both would spend the vest they cannot replace while holding a shield
  that was covering the very bearing it came in on.
- **The shield's arc is measured to the *thrower*, not to the landing point**,
  and that was a real bug. Written the obvious way it is nonsense for the person
  actually standing on the spot, whose bearing to it is whatever rounding left
  them, and close to a right angle for anybody beside them. The blow arrives
  along the line the limb travelled. Measured with the wrong one: a shield held
  directly at the dog blocked **0 of 1** and the vest underneath it was spent
  instead.
- **No `grappleImmune` window, unlike a blocked grab**, and that is a deliberate
  difference rather than an omission. That window means "nothing can lay a hand
  on you" and exists so a vest is not stripped three times in a second by a crowd
  that keeps re-grabbing. A strike is not a grab: there is nothing to break off
  from, the cooldown already stops one animal landing two inside it, and granting
  the window here would quietly make being hit by a tentacle a *defence* against
  being grabbed.
- **`LashHit.blocked` is on the wire** so the client can draw a deflect ring
  rather than only blood. Without it, armour working and armour not working are
  the same picture.

**`World.knockbacks` is the shove, and it is on the world rather than on
`AiState`** — the things that can be knocked about are not all AI: a player has
no `AiState` at all, and neither does a dog. One map covers every body in the
game without any of them being asked to know that a shove exists.

- **An impulse that decays, not a displacement.** 30 pixels applied between two
  ticks is a teleport; the same 30 over `DOG_LASH_PUSH_MS` is a body being
  knocked off its feet. Exponential (`KNOCKBACK_DECAY`) rather than linear, so it
  leaves hard and settles — a linear one stops dead at its deadline, which reads
  as the shove being switched off rather than running out.
- **Not a stun.** They keep walking through it, which is what lets somebody
  already running out of the ring go on running out of it.
- **Applied in `updateDogs`, above `resolveCollisions`**, so a body shoved into a
  wall is pushed back out of it in the same tick — the same deal the dog's own
  drag gets, and the reason it needs no wall test of its own.

**The arms are drawn with the dog, by `drawTentacles`.** They are the same limbs
that idle on its back, and two bits of code drawing them would be two bits of
code to keep in step. `setLashes` in `render.ts` is how it knows — module state
rather than a seventh parameter threaded through five call sites that have no
idea what a tentacle is, which is how the file already holds the blood decals and
the baked sprites.

- **`DOG_LASH_STRIKE_ARMS` (3) of `DOG_MORPH_TENTACLES` (8) go**, picked off the
  *strike's* id so it is a different three each time and the drawing does not
  develop a favourite side. Not all of them, for the same reason
  `ZOMBIE_SPREAD_SHARE` is not 1: a body that throws its whole silhouette at one
  spot has no silhouette left, and stops reading as a mass of limbs.
- **`DOG_LASH_COIL` is 0.9, not the 0.35 first written, and the rig is what said
  so.** A *gather* — the arm shortening to a third of itself while turning away —
  is what a limb loading actually does, and at this size it is invisible: the five
  arms that are not striking still fan out in every direction and bury it.
  Measured as the shift in where the mass of the drawing sits along the axis to
  the landing point, a 0.35 gather moved it **+0.3px** — nothing, and the wrong
  way. Drawn back to nearly full length *pointing away from the target*, three
  arms make a bundle behind the animal that is plainly a thing being loaded.
- **The segment taper has to be normalised, or the arm never reaches the ring.**
  Segments get shorter toward the tip, which is what makes a limb taper rather
  than read as a chain of equal links — but the weights (`1.15 - s * 0.09`) sum
  to 4.40 across five segments, not 5. Divided by the segment count the arm lands
  at **88% of its own reach**, and since that reach at full extension is the whole
  span to the landing point, the tip came down a ninth of the throw short of the
  red circle everybody had been told to dodge. Measured off the canvas: **0.91 of
  the span before, 1.02 after.** The idle arms have the same shape and it does not
  matter there — how long an idle arm looks is an art decision with nothing to
  agree with — so the normalisation is not shared.

**The ring is drawn on the ground, under the bodies**, with `drawBlood` and the
tyre marks. The officer standing in it is the one person who most needs to read
it, and a ring painted over the top of them would hide the very thing it is
warning about. Three readings, answering different questions: the **rim** is
where the edge of the impact is, so "am I in it" is about your own feet rather
than judging a distance; the **sweep** filling round it is how long there is
left; and the **wash** inside comes up as the sweep closes, so it reads as
loading even at the edge of vision where the rim is a couple of pixels.

**A miss has to have happened.** `LASH_GOUGE_*` and `LASH_CHIP_*` — a scuff in
the road and three chips of it thrown up, with a rising arc and a shadow under
each, the same trick the flamethrower's stream and the thrown tentacles use and
for the same reason: on a top-down map height only reads if something on the
ground stays put underneath it. It is the smallest thing that turns "the ability
did nothing" into "it missed", and the reason a dodge is worth making rather than
merely surviving.

**Nothing thrown by the client is on the wire.** The blood, the chips and the
gouge are all derived from the strike landing, exactly as blood is derived from
`Shot.hit` and the gore from a birth host leaving the snapshot. **`LashState.id`
is what makes that once-per-strike rather than once-per-frame** — a strike is on
the wire for the whole of its snap-back, so anything done off the flag rather
than off the transition would be done twenty times. Same trap as the roar's
sound, solved the same way, on the edge.

- **It reads `hasWallClearPath`, not `hasLineOfSight`**, and that mattered in
  both directions. A sight line waves *glass* through — that is the point of
  glass — and a tentacle does not go through an intact window; and it stops at
  *foliage*, which a tentacle very much does go through, exactly as a blast
  does. `hasWallClearPath` is the one predicate in the game that asks whether a
  physical thing can get from here to there. Asked from the **landing point**
  rather than from the animal, because that is where the limbs actually came
  down — somebody round the corner from the ring is behind a wall from it
  whatever the dog can see.
- **The infection is still an infection.** Somebody already incubating is passed
  over, the same rule `resolveGrapple` follows, and a completed one credits
  `infectedByDog` so it feeds this dog's roar balance and the shared
  `totalConverted` exactly as a bite does.

`server/morphcheck.ts` covers all of it and `client/lashrig.html` covers the half
it cannot. Measured server-side: **nothing is infected on the tick the key goes
down** (the control for every dodge claim — without it "they got out of the way"
is satisfied by a strike that never worked), **8/8 caught standing still and 8/8
dodged walking out at `PLAYER_SPEED`**, a civilian at 35px/s covers 15px of the
48 it would need, **3/3 in the circle and 0/1 outside it**, shield and vest each
spend exactly one charge and neither turns, **carrying both spends the shield and
leaves the vest at 3/3**, four bodies caught and three of them blocked, the shove
is **23.7px against a 0.0px control** and goes away from the impact, and a strike
out of a dog killed mid-coil never lands while the same strike left alive does.

Client-side, off the canvas: reach toward the landing point **0.22 idle → 1.02
out → 0.24 home** (an idle arm cannot pass 0.27 of the span by construction, so
anything past that is a striking arm and nothing else), the drawing's mass shifts
**-1.1px coiling and +26.7px going out**, arm-ring ink holds at **431 of 448**
across eight strike ids with **7 distinct drawings** out of those eight — so some
arms always stay and which three go genuinely varies — and the ring, the flash,
the deflect ring, the gouge and the chips all put ink down, with the gouge laid
**once** across two frames of the same strike.

*Three things about measuring this were the rig lying rather than the code
failing.*

- **`HUMAN_WALK_SPEED` is a civilian and the claim is about players.** Staged at
  35px/s the dodge read **0/8**, which looks exactly like the telegraph not
  working and is in fact asking a body that moves at 35px/s to cover 60 in under
  half a second.
- **`nav.isBlocked` carries `NAV_INFLATE`, so a "wall" found in it may not be
  there.** The wall test picks its slab off the nav grid, and a blocked run in
  that grid can be *pure skirt* — inflation near a corner with no geometry on the
  line. `lashOut` stops at the first thing `hasWallClearPath` refuses, which is
  real geometry, so on such a city it does not stop at all and the check fails
  having staged nothing. It leaked **2 of 6** and moved run to run, because the
  map is not seeded. The staging now confirms with `hasWallClearPath` that the
  dog genuinely cannot reach the victim, and skips cities where it can. The
  comment already in that function had learned this lesson once for the victim's
  *position*; this is the same lesson for the wall's *existence*.
- **One `getImageData` per sample hangs the page.** The rig's ring probe was
  ~2,300 single-pixel readbacks per ring and nine rings a run — 21,000 forced GPU
  round trips, and the tab stopped responding. Exactly the trap `paintbench.ts`
  documents: batch the work behind one readback, or measure the readback.

**What is not measured is what it looks like**, and that is the same standard
`DOG_CAMERA_ZOOM` and the resolution row are held to: rAF is throttled to nothing
while the browser pane is not compositing, so no frame of a live round can be put
on screen from here and `computer{action:"screenshot"}` times out. `getImageData`
needs no compositing, which is what the figures above come off. Open
`/lashrig.html` on the dev server to look — it draws the four phases as a panel
one under the other at the real sizes.

**The burst is a death, and that is one ending rather than two.** The clock
running out calls `killEntity`; so does a rifle. Without that, shooting the
thing is the anticlimax and the form has a second way to end that has to be
written, drawn and remembered. So it drops a body, costs a life and rises again
out of a shambler like any other death — and with no shamblers left, that was
the last of them.

- **The cloud is `layCloud`**, exported from `acid.ts` so `dog.ts` never learns
  what a cloud's seed, lobes or growth curve look like. `AcidCloud.full` is new
  and is why: a burst leaves a much bigger one (`DOG_BURST_CLOUD_MUL`) and the
  growth curve is shared.
- **The tentacles are the gobbet's physics**, which are the grenades' — the same
  `bouncesOff`, the same `GRENADE_BOUNCE`, substepped against `WALL_THICKNESS`
  for the same reason. Measured: **0 of 8 come to rest inside a wall.**
- **`world.pendingBursts` is a queue rather than a call**, because `killEntity`
  lives in `world.ts` and the cloud belongs to `acid.ts` and the tentacles to
  `dog.ts` — neither of which that file may load. `updateDogs` drains it on the
  next tick, the same arrangement `pendingFires` already uses, and it costs one
  tick nobody can see.
- **The grey corpse pieces are not on the wire at all.** The client throws them
  itself off the body leaving the snapshot, exactly as it throws the gore when a
  birth host bursts and exactly as blood is derived from `Shot.hit`.
- **`maxHealth` and `radius` are put back in `killEntity`.** `DogState` is
  deleted on the way up so the flags clear themselves; those two do not, and a
  dog reborn six times as tough would keep the whole ability for the rest of the
  round.
- **And the cooldown outlives the body**, like the acid's — see **A cooldown
  outlives the body**. At 250s against a four-second death this is the one where
  it matters most. Measured: **224s left against 224s expected after 26s.**

**One wire number, not a ramp and a flag.** `EntityState.morph` runs 0 to 1
across the wind-up and then holds at 1 for the whole form, so the client scales
the drawing and grows the tentacles off it with no branch and there is no moment
where a ramp reading 1 and a boolean reading false could disagree about what is
on screen. `morphing` says which half it is in, which is the one thing the ramp
alone cannot — the two want different drawings, rooted and vibrating against
moving and writhing. **Both are in `ENTITY_FIELDS`**; left out, a dog that has
been on screen since it spawned would grow for one frame and then stand there at
its old size for twenty seconds, which is the fourth time that list has caught
exactly this.

**The tentacles are drawn live rather than baked**, unlike everything else on
the animal — the dog's parts are painted once because they are rigid shapes that
only need posing, and a tentacle is a curve whose whole point is that it moves.
Eight at four segments each is about thirty line segments on the one body in the
round worth it, with no per-frame state: every bearing, length and phase comes
off the dog's own id and the clock, exactly as the saliva strands and the acid
churn do.

`server/morphcheck.ts` is the harness — headless, no socket, no port. Three
things in it were the rig lying rather than the code failing, and all three are
the staging:

- **The rig stages on open ground, which defeats the wall test.** `rig()` finds a
  spot with several hundred pixels clear in every direction — right for every
  other check and exactly wrong for "a wall stops the lash", which reported
  **0 cities staged**. It has to move the dog off it.
- **`nav.isBlocked` is inflated, so a victim "behind a wall" can be in front of
  one.** The first blocked sample walking east is several pixels before the
  slab, and a line can graze that skirt without crossing anything solid. Staged
  that way it leaked on **1 city in 3**, and then on 1 in 6 after a
  point-test fix. The body has to go past the *far* face of the solid run, with
  cities where that lands outside the reach skipped rather than measured.
- **Two rigs are two cities, and `speedAt` reads bushes.** The sprint comparison
  put the plain dog and the heavy one in different worlds, and a hedge under one
  of the runs failed it 1 run in 5 — with the *plain* dog slowed rather than the
  heavy one quick. Same dog, same pixel, same city, stamina refilled before each
  window.
- **The dog can eat its own test subject.** Checking that a lash's incubation
  actually turns somebody means waiting out `TURN_DELAY_MAX_MS` (45s), which
  outlasts the transformed form itself (`DOG_MORPH_MS`, 20s) — so left alone the
  dog's own clock runs out mid-wait, it bursts, and `respawnDogFromHorde` looks
  for a shambler to rise out of. In a city deliberately emptied down to the dog
  and its one victim, the victim — now the only zombie anywhere — *is* that
  shambler, and `finishDogBirth` removes the entity outright. It read as the
  conversion having worked and the entity having vanished in the same run,
  which is correct game behaviour caught next to the wrong test. The form's own
  deadline is pinned past the wait before it starts, which is the incubation's
  business and not the dog's lifecycle.

#### The corner map, and what it refuses to show

A dog has no radio, no beacon handset and no binoculars — it is the one seat in
the game with nothing in its hands — so it had no way at all to know where the
city was defended from. That is a balance problem rather than a comfort one: an
animal that outruns everything will always find the empty quarter, and it should
be *choosing* to rather than stumbling into it. Bottom left, 190px on the longer
axis, drawn only for a dog that is up. `server/dogmapcheck.ts` is the harness.

**The rule is that the horde sees for you, and nothing else does.** An officer
appears only while a zombie is within `DOG_MAP_CONTACT_RANGE` of them — which is
`ZOMBIE_SIGHT_RADIUS`, not a number picked for the map, because the rule *is*
"something of yours could have laid eyes on them". So the map shows where your
outbreak is making contact. It rewards having sent the horde somewhere and it is
useless for finding a quiet officer in a quiet street, which is exactly the
cheating a map must not enable.

- **What is refused is refused on the server.** An officer out of range is not
  greyed out or filtered client-side — they are never put on the wire at all, so
  there is no flag to ignore and no position to leak however the client is read.
  `DogHud.contacts` is the whole of what the map knows beyond the dog itself.
- **It is geodesic, off the danger field.** A shambler on the other side of a
  wall has not seen anybody, and straight-line distance says it has. That is the
  same reason `danger.ts` exists at all — and it makes the check one array
  lookup per officer against a spatial query per officer. Measured with a pair
  either side of a building wall: **60px apart in a straight line, over 900px to
  walk, and not listed.**
- **The list is live, not latched.** Kill the zombie and the contact goes with
  it on the next scan. A map that remembered where somebody *was* would be the
  cheating this exists to stop, arriving a few seconds late.
- **Officers only.** Not civilians, not the horde, not loot. Measured with all
  three stood together: the list is exactly one long.
- **It is built four times a second and shared by every dog**, cached on the
  world — the answer does not depend on who is looking, and a round with no dog
  in it never builds one at all. Rebuilding faster than the danger field under
  it (160ms) would buy a fresher copy of the same answer.
- **So it is up to `DOG_MAP_REFRESH_MS` stale, and that is a property rather
  than a bug.** The scan is exactly right at the instant it runs, and a cached
  list is then handed to every snapshot until the next one. What is bounded is
  its **age**, in milliseconds — measured, **233ms against the 250ms throttle**,
  which is the last cached tick before a rebuild and is the figure by
  construction rather than by luck.
  - **Pixels are the wrong unit for that staleness, and reaching for them cost
    a wrong measurement.** The harness used to allow 150px of "overshoot" on
    the reasoning that two bodies walk about 60px apart in a refresh window.
    They do — but walking is not the dominant term. **The zombie that made the
    contact dying is**, and that removes a source from the danger BFS outright:
    the reading jumps to the next-nearest zombie, or to unreachable, in one
    rebuild and however far off that happens to be. No bound in pixels can
    describe that, and the one that tried failed on its own clock at roughly
    1-4 samples in 40-95.
  - **`Infinity | 0` is `0`, and that is what hid it.** `distanceAt` answers
    `Infinity` for a cell the BFS never reached, and the failure detail
    formatted its worst reading with `| 0` — so the check reported "were up to
    **0px** stale, against 150px of slack", which is self-contradictory and
    names neither the size nor the cause. Nothing in that harness formats a
    distance by hand now; `px()` prints `unreachable` and the same trap was
    waiting in two other details beside it.
  - **The check is split in two now, and neither half carries a slack figure.**
    On a **rebuild** tick the list and the field are the same age, so the rule
    holds exactly and is checked in both directions — nothing listed that
    should not be, nothing missing that should. Measured: **0 wrong across 263
    rebuilds and 2100 samples**, every run. On a **cached** tick what is
    measured is the age above, plus how much of the list has gone stale inside
    it: **2.7-4.3% of readings**, of which **0 were officers killed**, 4-27
    turned, and 30-213 were officers still stood where they were with the
    horde gone — having moved **25-54px**, which is what says it is the zombie
    leaving rather than the officer walking.
  - **And it sampled every sixtieth tick, so it had never once read a cached
    list.** The refresh is 250ms and the harness looked every 2000ms, so every
    look rebuilt — it was measuring the scan and reporting the figure as though
    it described the cache. It samples every tick now, which is also what a
    real snapshot does.
- **An officer the coarse field cannot answer for is not shown, and it fails
  closed.** `DANGER_CELL` is 28px and a cell counts as blocked when its
  *centre* is in a wall, so a body standing in the open a few pixels off a
  frontage can sit in a cell the BFS never reached — `distanceAt` answers
  `Infinity` with a shambler 30px away and `refreshDogContacts` declines to
  list somebody it cannot measure. For a feature defined by what it refuses to
  show that is the safe direction, so it is left alone; it is a property of
  reading a coarse field rather than of this rule. **It is also a trap for the
  harness**, which is where it actually bit: two staged checks settled their
  officer into such a cell — **3 runs in 12** of one and about **1 in 16** of
  the other — and reported "0 contacts" as though the rule had broken.
  `stageInContact` states that precondition rather than assuming it, and
  engages on ~7.5% of stagings.

**The city is painted once and blitted after that.** Drawn live it is ~90
building footprints, a park, a pond and a border — a couple of hundred
`fillRect`s and a 48-segment path — every frame, on the one connection that
already pays the most per frame. Baked into an offscreen canvas the per-frame
cost is one `drawImage` and a few two-pixel dots. Same trick as `grimeTile` and
the vignette, and the same reason: nothing in it moves. It is keyed on the
`MapData` object itself rather than its seed, because a restart hands the client
a new object and identity catches that for free.

- **Contacts go into one path filled once**, not a fill and a stroke per dot —
  the lesson `drawBushes` and the blood decals both learned, in blue.
- **You are a ring, not a dot.** At this size a second blue-ish blob among the
  contacts is one more thing to pick out rather than *the* thing to pick out.

Measured, 90 footprints at 1920x1080, three runs: bake **0.36-0.84ms once**,
then **0.031-0.096ms a frame** against **0.48-0.59ms** with the bake thrown away
each frame — 5-16x. Against a fog polygon at 0.8-2.5ms and walls at 2.15ms, the
map is under 1% of a frame. Server side, at 522 entities: a forced rebuild is
**0.014ms** and a snapshot pays **0.006ms**. Over a live round it shows **5-22%
of the garrison** on average, which is the balance property stated as a number —
quote the range and never a single run, the map not being seeded.

*The first cost figure taken read 39ms for the bake and was nonsense* — that is
the `getImageData` readback's own fixed cost plus a cold canvas, counted as if
it were the drawing. It is the exact trap `paintbench.ts` documents: batch the
work behind one readback and divide, or measure the readback.

Layout measured off the canvas: the map occupies **x 14-203, y 925-1065**, and
the leftmost ink of the rest of the dog's HUD is at **x 722** — a 519px gap, so
nothing overlaps. Projection checked at three world positions: a contact lands
blue ink on the predicted map pixel every time, and those pixels are empty
without it.

**The horde is deliberately not on it.** Three hundred dots would be the
expensive part on both the wire and the frame — the thing that was asked to be
avoided — and it is a bigger design question than a readout: knowing where every
one of your zombies is at all times is a different game from commanding them by
roaring. Easy to add as a coarse density layer if it turns out to be wanted.

**Its ending is its own, not the city's.** `#dog-out` is a separate panel from
`#game-over`: the round carries on around a dog that is out, and with no entity
it falls through to the spectator path and keeps watching. Telling it "every
survivor has turned" when the opposite happened would be simply wrong.

### Bot officers

Blue body, grey head — a separate `bot` wire flag, not the ambient grey `npc`
one. They stand in a player's slot, so they move at **player speed**
(`BOT_WALK_SPEED`, `BOT_SPRINT_SPEED`) and carry their own stamina; this is
deliberately outside the NPC speed scale, which is tuned so civilians *lose*
races with zombies. A bot is meant to win them.

- **Bolting is latched and judged on the nearest zombie in sight, not the one
  being shot at.** Those are often different, and a bot trading fire across the
  street shouldn't ignore the one at its elbow. `state.threatPoints` is already
  line-of-sight filtered and refreshed on the perception tick, so it costs a
  short list walk rather than a query. The `BOT_BOLT_DIST` → `BOT_SAFE_DIST`
  gap is hysteresis; one threshold makes them dither on the line.
- **Running is goal-directed**, like every other flight here — it reuses
  `escapeDestination`. A raw bearing away parks them on the wall behind.
- **Patrol targets must be outdoors**, and that is what walks them out of a
  house once they've stripped it: the test is whether the *target* is indoors,
  not where they're standing, so it fires once instead of re-rolling every tick
  they spend inside.
- **Giving ground and running away are different things.** Above
  `BOT_BOLT_DIST` (120) a bot *kites*: it backs off with the gun still up and
  the shot already fired that tick. Only inside that does it turn its back and
  run.
- **Kiting is a sprint.** It used to back off at a fraction of a *walk* — 86
  px/s against a zombie's 94-133 — so the gap it was trying to hold closed
  anyway and the kite was a slower way of standing still. It spends the reserve
  like a bolt does and drops to a walk when winded. Closing *in* stays a walk,
  because walking toward something is not urgent. The reserve is ticked exactly
  once per tick: the fight branch's refill stands aside on a kiting tick, or the
  two calls fight each other and a sprint drains at the difference between them.
- **A bot never turns its back on the dog.** Bolting works against a shambler
  because a jogging officer outpaces one; a dog is faster than a sprinting
  officer, so running from it is presenting your back at the exact moment it
  catches you, and every bolt is a free bite. With one in view inside
  `BOT_SAFE_DIST` the bolt latch is held off and the bot gives ground facing it
  instead. Measured with a dog 70px away: **0 of 90 ticks bolting**, gun on it
  for 86 of 90 — against **87 of 90 ticks bolting** from an ordinary zombie at
  the same 70px, which is the control that says the rule refuses *that threat*
  rather than refusing to bolt at all. The bolt distance came down from
  165 and `BOT_SAFE_DIST` from 400, because an officer that breaks off at the
  first sight of one is an officer that never fights. The kiting band is wide
  for a rifle and narrow for a shotgun, which is right — a shotgun wants to be
  close.
- **Reach first, damage second.** `longestGun` holds the loaded gun with the
  greatest `botReach`, so an officer keeps the fight at arm's length and only
  takes out a close-quarters weapon when it *has* to — which is when the long
  one runs dry. Ranking on damage per pull alone (`bestGun`) put a shotgun's
  eight pellets above a rifle, so a bot carrying both walked into shotgun range
  to use it. It also killed the flip-flop outright: the choice no longer
  depends on how far away the target is, so there is no boundary for a drifting
  target to cross and nothing to latch. `bestGun` survives only as the
  fall-through to the pistol, which never runs out.
- **Running out of breath ends a bolt.** This is not a refinement: a winded bot
  drops to `BOT_WALK_SPEED`, which is *slower than a zombie*, so `closest`
  never grows and it can never satisfy `BOT_SAFE_DIST`. It would jog away from
  something faster than it, never firing, for the rest of the round. Out of
  sprint now means turn round and kite.
- **Hunting reads the danger field** — they steer toward `BOT_HUNT_STANDOFF`
  from the nearest zombie, one O(1) lookup per sample instead of a search. Keep
  the standoff inside `NPC_OFFICER_SIGHT`: at the edge of their own vision they
  hover where they can neither see nor be reached, and never fight. At 420 they
  engaged 0% of the time; at 260, 12-27%.
- **Smoke is cover, not a weapon.** It goes to either flank or straight behind
  (never at the zombie) — putting it on the target only blinds the bot to the
  thing it is watching.
- **The pistol is the fallback of last resort, not an option.** `bestGun` ranks
  only guns with rounds left and falls through to the pistol when there are
  none. Ranked on damage it beats a machine gun on paper, so bots were putting
  a loaded MG away to plink with a sidearm.
- **Bots don't tidy up after themselves.** `closesDoors`, `locksDoors`,
  `slamsDoors` and `barricades` are cleared when a bot is spawned. Every one of
  them is a civilian's business — shutting one behind you, bolting it, walking
  back across a room to see to it — and every one is a bot standing in a
  doorway instead of fighting. Cleared as *data* at spawn rather than branched
  on in `doorTick`, so nothing downstream has to know bots are different.
  Opening a door they need through is untouched, and so is drawing the bolt on
  a locked one. Measured over two seeds *before* the boot was taken away: the
  only door action a bot performed was `kick`; it is `unlock` now, and neither
  is a tidying-up job. **A rig has to clear these by hand** — one that stages a
  bot with a bare `newAiState` gets a bot that rolls `closesDoors` like a
  civilian and spends the round shutting doors after itself, which is 144 jobs
  across eight cities and not one of them a thing a real bot would do.
- **A bot opens a door instantly, the way a player does.** For a player,
  opening is a *tap* and a tap resolves the moment it is released; the 1.1-2s
  in `DOOR_OPEN_MIN_MS`/`MAX` is a civilian fumbling with a handle in a panic,
  which is not what an officer clearing a building is doing. `beginDoorWork`
  hands a bot a zero duration and `doorTick` finishes it in the same tick
  rather than surrendering one, or it still pauses at every doorway. Only
  opening: bolting a door and kicking one down are deliberate acts and take a
  bot as long as anyone. Measured over two seeds, `bot:open` went from ~1.5s a
  door to never appearing as a spell at a handle at all.
- **A locked door is not a wall to an officer, and it is not a door to be
  kicked in either.** Where a civilian can only draw a bolt back from the side
  it is on — which is what makes finding a bolted front door a real refusal for
  the crowd — an officer works the lock from whichever side it is on, so
  `canWorkLockFrom` is simply not asked of a bot. It used to take the door off
  its hinges instead, which reads as an officer wrecking the house he is there
  to clear; **the boot is being kept for barricades**, when there are some.
  Measured on a rig with every way into the corner complex bolted, eight to ten
  cities, with the old behaviour temporarily gated back in: **kicked 8/8 →
  0/10**, drew the bolt **2/8 → 9/10**, and still got inside — median 8-13s
  against the kick's 9.6s, since an unlock is `DOOR_NPC_UNLOCK_MS` and that is
  a quarter of `DOOR_KICK_MS`.
  A door a *player* bolted (`playerLocked`) is still left standing: a bot is on
  that player's side and reroutes rather than undoing their work.
  **Kicking is unreachable rather than gone** — `beginDoorWork` and
  `finishDoorWork` still know the action, `DOOR_KICK_MS` still exists, and
  `server/botkite.ts` still stages one directly to measure a bot dropping slow
  door work when something walks up behind it. That measurement is unaffected,
  because the drop applies to any job at a handle and an unlock is one.
  The alert fires **after** the door comes open, the opposite of a slam —
  shutting a door blocks the very sight line the alert needs, so that has to go
  first; opening one is what lets the room beyond hear it at all.
- **A dry gun in the bag counts as a free slot** in `lootWanted` — they ditch
  it on arrival. Otherwise a bot holding three empty rifles is "full" and walks
  past every gun in the city. On arrival they drop the dry one *then* collect,
  and `collect` takes an optional pickup id because at that instant the nearest
  pickup is the empty gun at their own feet.
- **A full bag is measured against its *worst* gun, and swaps that one.**
  Measuring against `bestGun` asked the wrong question twice: it refused a
  rifle that would plainly beat the pea-shooter in slot three, and when it did
  accept something it handed over the best gun it owned, because `collect`
  swaps whatever is in hand. Two officers at the same heap therefore traded
  their best weapons for marginal upgrades and each put down something the
  other then wanted. Against the worst slot every swap strictly improves the
  bag and strictly lowers what is left on the floor, so a pile settles.
- **Three more things keep it settled**, and all three were needed:
  `BOT_SWAP_MARGIN` (a couple of points of damage is not worth a shuffle),
  `BOT_LOOT_SNUB_MS` (a swap leaves the gun you gave up under the *same*
  pickup id, so without it the next scan finds a brand new upgrade at your own
  feet — and it also stops anything `collect` refuses being retried forever),
  and re-checking on arrival that the pickup still holds the item it set out
  for. Two refusals were outright infinite loops before this: a second pistol
  with `dual` already set, and an ammo box with nothing in hand that takes
  rounds. `lootWanted` now excludes both, and the bot puts the emptiest gun in
  hand before collecting a box.
  Measured over three seeds, 120s each, zombies removed so the runs are
  comparable — swaps of a single pickup id: **223/0/242 → 0/0/0**; time a bot
  spends stood on loot: **20.9/0/22.2% → 2.2/0/3.2%**; and they finish
  shopping, one bot going from three guns and a radio to four guns and eight
  utilities on the same seed.

#### Fighting is how a bot survives

**This is the finding, and it is worth not re-litigating.** The obvious way to
make bot officers last longer is to have them break off sooner — a bolt
distance that grows with the size of the pack, and an outright rout when
surrounded. Both were built and both were measured, ten paired seeds at 180s
with the old behaviour gated back in and the runs alternated in one shell loop:
bots alive **23/40 → 22/40**, grabs 66 → 72, and the median city finished with
**263 zombies rather than 229**, worse in eight of the ten.

Four officers are most of what holds the outbreak down. Stop them fighting and
the city is lost, and a bot in a lost city dies anyway — a little later, having
contributed nothing. What kills a bot is not the zombie in front of it now, it
is the state of the street in forty seconds' time.

So none of the changes below make a bot fight less. They fix the mechanics of
not dying and leave the decision to engage exactly where it was. Measured over
**twenty paired seeds**, 180s each, alternated in one shell loop:

| | bots alive | bots bitten | grabs | zombies (median) | survivors (median) |
|---|---|---|---|---|---|
| before | 44/80 | 41 | 169 | 211 | 245 |
| after | **56/80** | **26** | **111** | 216 | 231 |

Better in 9 seeds, worse in 3, level in 8, and rounds where all four came
through clean went 2 → 5. **Grabs are the clean signal** — a third fewer hands
laid on them, which is the mechanism rather than the outcome. The city figures
are a wash either way, which is the point: this buys bot survival without
costing the outbreak, where breaking off sooner bought nothing and cost plenty.

- **Twenty seconds of blind running was killing them.** A grabbed officer gets
  `fleeUntil`, and a bot ran the grey officer's version of it: `OFFICER_FLEE_MS`
  (20s) on a raw bearing away from where the threat was, at `HUMAN_FLEE_SPEED`
  — **slower than a zombie** — with no pathing, no unstick and no shooting. It
  could not outrun the thing that had just let go of it, walked into the first
  wall behind it, and every grab it survived made the next one likelier to turn
  it outright (`INSTANT_INFECT_PER_PRIOR_GRAPPLE`). It is goal-directed now,
  like every other flight here — `escapeDestination`, `unstickTick`, sprinting,
  and the `ESCAPE_BOOST_MS` burst it was being handed and never spending — and
  it **ends when the bot is actually clear** rather than at the end of a clock.
  `BOT_SHAKEN_MS` (3.5s) is only the ceiling.
- **Sprint is a reserve, not a speed.** Two seconds of it (`STAMINA_DRAIN_PER_SEC`
  46) and eleven of walking to earn it back, and a bolt spent the lot in its
  first two seconds — measured, **27% of all bolting ticks were spent winded**,
  at walking pace, with the pack still coming. Inside `BOT_SPRINT_TRIGGER` it
  sprints; beyond it a bot jogs, which already outpaces a zombie (115 against
  102), so the reserve is there for the moment something is actually on it.
- **Combat boots did nothing at all for a bot.** `BOOTS_SPEED_MUL` and
  `BOOTS_STAMINA_MUL` are applied to a *player* in `updatePlayers`, and a bot's
  legs never went through that — so a bot that crossed the city for a pair got
  neither the pace nor the cheaper drain and was carrying a slot of nothing.
  `botStaminaTick` and `botWalkSpeed` read them now, which is also what takes
  its sprint from two seconds to three and a half, and they are scored to match.
- **Running somewhere is not the same as running there in a straight line.**
  `escapeDestination` scores a bearing at its far end and at its midpoint on
  the danger field and *nothing in between*, and `headingToward` then routes
  around walls — which a body is not. So a zombie sixty pixels along the chosen
  line cost that line nothing and the bot sprinted into it with the whole
  street open beside it. `dodgeThreats` is the near field: the closest thing
  inside `DODGE_RANGE` that the running line points at, gone round on
  whichever side has more room, swinging wider the closer it is. It returns the
  heading **unchanged** when neither way round is walkable, which is exactly
  the cornered case — pressing on is right there. It was a bot's alone at
  first; `skirtThreat` was the civilian version, read only the one tracked
  threat, and is gone — see **Running from one zombie into another**.
- **Giving ground is scored against every zombie it knows about.** Kiting
  stepped on `atan2(-dy, -dx)` — directly away from the one being shot at, which
  is how you back into the second one or into the wall behind you.
  `giveGroundHeading` samples like `safestHeading` does, requires
  `nav.lineClear`, and keeps a strong pull toward "away" so it still reads as
  giving ground rather than wandering off sideways.
- **Nothing on the floor is worth walking into a crowd for.** `lootWanted` had
  no idea where the zombies were, and `BOT_LOOT_RANGE` is 1400 — so a bot would
  cross most of an overrun city for a marginally better rifle and be eaten in
  the front room it was lying in. Measured before this: bots bitten indoors with
  **35 and 61** zombies in sight. `BOT_LOOT_MIN_CLEARANCE` is read off the
  danger field at the pickup *and* at the halfway point, the same way
  `escapeDestination` reads it and for the same reason — the thing may be
  somewhere perfectly safe on the far side of a horde. A floor, not a
  preference.
- **The vest and the shield are the only things that stop an infection.**
  Kevlar was scored 30 — below a smoke grenade — and the riot shield was in
  `BOT_IGNORES` on the grounds that a bot cannot work right-click. That was the
  wrong reason: **the shield is worn**. It goes up when it is picked up and
  turns a grab away from the front arc while the bot gets on with its guns;
  bashing and slinging are the parts a bot can't do and neither is why you
  carry one. Both are utility slots, so neither costs a gun. `collect` refuses
  the shield alongside the heavy MG, so `lootWanted` now declines to walk to
  either while holding the other rather than making the trip to be turned away.

#### A bot never has to face where it is running

Two reports, one root: *"make sure Bot player officers can always kite and
don't ever NEED to face where they are running"*, and *"Bot player officers
stick to kicking a door down even if a zombie is approaching them"*. Both are
the same mistake in different clothes — a bot that has committed to one thing
had no way to be an officer at the same time.

**`e.facing` is the gun and `state.heading` is the legs, and for an officer they
are only the same thing while it stands still.** `step` ended by tying them
together, which is right for a civilian — somebody running for their life looks
where they are going — and wrong for a bot, which stands in a player's slot, and
a player sprinting away from something still has the mouse on it.

- **A bolt is a kite now, not a rout.** It keeps the gun on the target, takes
  the shot, and runs on the same scored escape line at the same speed as
  before. The fight branch has always worked this way — "backs off with the gun
  still up and the shot already fired that tick" — and there was never a reason
  for the *urgent* case to be the one that stops shooting.
- **It has to be a parameter on `step`, not a fix-up after it**, and that cost a
  whole measurement to learn. Overwriting `e.facing` after the call only ever
  survives to the next one, so a bot correcting its aim by `BOT_TURN_RATE * dt`
  was dragged back the other way just as fast: measured that way it sat a flat
  **14.3° off its own feet and got the gun onto the zombie on 0 of 998 ticks** —
  which reads exactly like the change doing nothing. `keepFacing` says the caller
  owns the facing, and only the two bot flight branches pass it.
- **The shot is one function now** (`botTakeShot`), called from the fight branch,
  the bolt and the post-grapple flight. Written three times it would have drifted
  into a bolt that fires launcher shells at its own feet.
- **The fight branch swings the aim from `e.facing`, not from `state.heading`.**
  Those are the same number on any tick following another fighting one, and they
  are not on the first tick after giving ground — by then `state.heading` is
  where the legs were going. Seeded from the legs, the gun snapped back down the
  street the bot had been running along and swung round again from there, which
  is a whole turn thrown away at the worst possible moment.
- **`BOT_KITE_SPEED_MUL` (0.75) still does not apply to a bolt**, and that is
  deliberate rather than missed. Holding a range you chose should not be free;
  breaking contact is the case where the officer has already lost that argument.
  Three quarters of a sprint is inside the band a zombie runs at, which is the
  "a bolt that cannot outrun what it is bolting from" fault already recorded
  against a winded bot. The bolt keeps its pace and gains the gun; what it pays
  is the sprint reserve it was already paying.
- **The post-grapple flight gets it too.** Whatever had hold of you is right
  there and is the easiest shot an officer ever gets, and turning your back on it
  is how the same zombie got a second grab.

**And a door is a job you can put down.** `DOOR_KICK_MS` is 4.2 seconds, and
`doorTick` is called *above* the fight branch with a mid-handle case that returns
before it — so a bot that started a kick could not change its mind, whatever
walked up behind it.

- **`pressed` is `nearestThreat < BOT_SAFE_DIST`**, which is already the figure
  that means "I am not clear of it" everywhere else a bot uses one — the bolt
  hysteresis, the charge-rifle gate, the dog rule. A second number here would be
  a second opinion about the same question.
- **It refuses to *start* slow work as well as dropping work in progress.**
  Otherwise the kick simply begins again on the next tick and nothing changes.
- **Opening a door is deliberately still allowed**, because for a bot it is
  instant — and a door is very often the way *out* of the fight rather than a
  distraction from it. Only the kick and the unlock are refused, which are the
  two that take time.
- **The claim goes back with the boot** (`releaseDoor`, in `doors.ts`, which owns
  door state). `doorBusyForOthers` would drop it eventually, a claim carrying a
  deadline for exactly this reason, but "eventually" is `DOOR_CLAIM_GRACE_MS`
  past the end of a kick nobody is making any more, and meanwhile the door reads
  as busy to everyone who could have opened it.
- **Half a kick is not banked.** It starts again from the top once the street is
  clear, which is both simpler and right: banking it would let a bot chip a door
  down for free between engagements.
- **Civilians get none of it.** Hearing something and carrying on anyway is most
  of what makes a civilian a civilian, and a civilian at a handle has no gun to
  reach for.

`server/botkite.ts` is the harness — headless, no socket, no port, so it leaves
a game on 8080 alone. Both behaviours run in one process and
`setBotDropsTheGun` is the gate, kept rather than deleted because the control is
the entire value of the run. Six staged runs each way, 180 ticks apiece:

| | OLD | NEW |
|---|---|---|
| bolting ticks measured | 1066 | 1070 |
| gun off the zombie, median | 170.7° | **0.0°** |
| gun off its own footsteps, median | 0.0° | 174.3° |
| gun on target (within firing tolerance) | 0/1066 | **1039/1070** |
| shots fired while bolting | 0 | **31** |
| ground made, median | 561px | 728px |
| door: let go of the kick early | 0/6 | **6/6** |
| door: held on for | 4.23s of 4.20s | **0.13s** |
| door: claim handed back | 6/6 | 6/6 |
| door: shots fired in that window | 0 | **16** |

**"0.0° off its own footsteps" is the old behaviour stated exactly** — the gun
was welded to the legs — and 0/1066 on target is what that cost. Read the ground
made as "no slower" rather than as an improvement: the bolt's speed and bearing
are untouched by construction and six unseeded cities is not a sample.

Three things about measuring this were the rig lying before they were ever the
code, and the first is new:

- **The harness clock has to start where the world's does**, and this is not the
  usual version of that warning. `resetWorld` takes no `now` and stamps every
  fresh `AiState` with `Date.now()` — so a rig starting its own clock at 10000
  leaves `nextSenseAt` about fifty-six years in the future and the bot never
  perceives anything at all. Nothing errors: it reads as a bot standing beside a
  zombie doing nothing, which is indistinguishable from the bug under test.
  Measured that way the rig reported **0 bolting ticks in both modes**.
- **"It let go of the door" is not the same claim as "it let go early."** The
  kick simply finishing satisfies the first just as well, which is why both modes
  first read 6/6 at a median of 4.20s of 4.20s. The reading has to be against the
  deadline.
- **The bot is staged on open ground rather than at the door it is kicking**,
  which looks wrong and is not: the mid-handle branch reads a clock and nothing
  else. Planted on the slab, the zombie lands wherever the far side of that door
  happens to be — as often as not inside the building — and the bot could not see
  the thing it was supposed to react to. Measured that way it saw it on **4 of 6**
  runs one way and **0 of 6** the other, which is the city talking rather than the
  code. `sawIt` is on the report so that cannot quietly happen again.
- And the chaser is **unkillable**. Left mortal it is shot dead by the only mode
  that can shoot, that run ends early, and the ground made reads 441px against
  604px — which looks like the kite escaping *worse* when all it says is that the
  run was shorter.

#### An officer listens before it opens a door

A shut door is a room you cannot see into, and walking through one is how a bot
meets a pack at arm's length with no room to give. So `doorTick` asks
`heardBehindDoor` first, and if something is there the bot doesn't go in: it
backs off `BOT_DOOR_STANDOFF` and covers the door (`doorWatchTick`), which is
the one place it can meet a pack one at a time. After `BOT_DOOR_WATCH_MS` it
gives the door up, snubs it for `BOT_DOOR_SNUB_MS`, drops whatever loot it was
walking to and picks somewhere else to be — whatever is in there may never open
the door, and standing at a handle is not a plan. Bolting or shaken, it skips
the standing-around part and just reroutes.

- **It is an ear at the handle, not a look through the wall.** A short radius
  around the slab, counting only zombies on the face the bot is *not* standing
  on. `world.rooms.zombiesIn` was the tempting version and is the wrong one:
  exact, omniscient, and it would have a bot know about something at the far
  end of a landmark it has never been inside.
- **Civilians get none of it.** Hearing something behind a door and going in
  anyway is most of what makes them civilians.
- **It is rare in a live city, like room-to-room barricading.** Over ten 180s
  rounds, four bots reached the listening point **140 times and heard something
  on 0 of them**; another batch turned up 1-3. Most doors have nothing behind
  them, so this is a handful of moments a round at best.
- **Which is why it is verified with a rig rather than by watching.** Stand a
  bot in front of a shut door with a zombie right behind it, thirty times:
  before, it walked in **13/30**; after, **2/29**. The control — the same door
  with an empty room behind it — is untouched at 14/30 and 13/30, so it is not
  refusing doors, it is refusing *that* door. It set a watch and covered the
  slab in 8 of the 29.

#### A charge rifle is how a bot sees the infected

`chargeInfectedTick`. It is the one gun in the city that can shoot somebody
already bitten, and a weapon that does a job nobody can *see* the need for is a
weapon nobody uses.

- **Carrying one is the vision.** `CHARGE_INFECTED_SIGHT` (900) around a bot
  holding one, reading `world.pendingInfections` directly. Everywhere else, an
  infected body is invisible until the last four seconds of the tell
  (`isVisiblyTurning`), and even then `senseThreats` deliberately keeps it out
  of `targetId` so that nobody shoots a person who has not turned yet. This is
  the one thing that makes it a decision instead of an accident, and it is the
  same shape of hole in the fog thermal goggles punch for zombies.
- **Server-side only, for now.** Nothing about it reaches the wire, so it
  changes what a bot does and nothing about what a player sees.
- **It winds the gun up properly**, to `BOT_CHARGE_BARS` (the top bar), rather
  than firing at full charge the instant the trigger is touched the way bots do
  with everything else. A bot lining a shot up on a civilian has no reason to
  settle for a lesser round.
- **Reached below the fight, not above it.** A live zombie is a fight now; an
  incubating civilian is a fight in twenty seconds. So the branch runs only
  with nothing inside `BOT_SAFE_DIST`, gated on `closest` rather than on the
  target's distance — those are routinely different, and nobody spends a second
  and a third of a second charging a rifle with something at their shoulder.
  `cureTick` still ranks above it: a dose costs the patient nothing.
- **Civilians only, and the lane is checked.** An infected *officer* is a
  teammate and the answer there is the cure gun — and one who wanders into the
  lane calls the shot off, since a top-bar round pierces four bodies and
  "behind the target" is no protection from it.
- **`BOT_CHARGE_GIVE_UP_MS` is the only thing that clears a stale wind-up**,
  and that is deliberate: the branches that interrupt this one — bolting,
  fighting, looting — shouldn't have to know it exists. A claim past its
  deadline is dropped on re-entry and started again from the top.

Measured over two 120s runs with the bots handed a charge rifle each, against
the same runs with nothing in the slot: wind-ups **2 and 1 bots** against 0 and
0, ticks spent charging **1714 and 160** against 0, peak charge **4/4 bars**,
and infected removed before they turned **5 and 2** against 0 and 0.

### Pickups carry ammo

`PickupState.ammo` absent means a full magazine — loot that spawned in the
world always is. A gun that was **dropped** keeps what was left in it, and one
at zero draws grey with a bar through it. Swapping used to hand back a full
magazine, which made swapping a way to manufacture ammo.
- **The pond is a radius per bearing, not a polygon.** Containment is one
  comparison and pushing a body out is a slide along the same ray; nav grid,
  collision and the drawn bank all read `pondRadiusAt`, so what you see is
  exactly what you cannot cross.

### Art direction: grim and dirty

The beginning of the final look, not the end of it. Three things went in with
the dog, and all three are built the cheap way on purpose.

- **The road is a hashed tile, not a per-frame scatter.** One 256px tile of
  blotches, cracks and grit is built once and repeated as a canvas pattern, so
  the ground costs **one fill** at any zoom — the rasteriser only touches what
  is on screen. Scattering blobs over the viewport every frame is the obvious
  way to write it and is the expensive one; that is `drawBushes`'s lesson again.
  It is kept at *very* low contrast, and not for taste: at any strength where
  you can make out an individual blotch you can also make out where the tile
  repeats, and the city turns into a grid of identical stains.
- **Blood is derived, not sent.** `Shot.hit` already says a round found a body
  and `x2,y2` is exactly where it stopped, so the wire carries nothing new. A
  hit throws droplets along the round's line for half a second and leaves marks
  on the road. Every visible *live* decal of a given age goes into **one path
  filled once** — four alpha bands — which is the park's mistake avoided again,
  in red. `kind` gates it, so a cure and a flame draw none.
  - **A mark dries and then it stays.** `BLOOD_DECAL_MS` (40s) is the dry-down
    now, not the whole life: for those forty seconds a mark fades wet → dull in
    the live list, and then — with PERMANENT BLOOD on — it is stamped **once**
    into `stainLayer` and dropped. `stainLayer` is a shared offscreen canvas at
    `BLOOD_BAKE_SCALE` (0.5) of the world, blitted each frame for just the
    sub-rect on screen, so a whole round's worth of blood costs one `drawImage`
    plus only the marks still drying. Same bake-it-once trick as the grime tile
    and the minimap. Sized off the *live* `WORLD_WIDTH`/`HEIGHT`, so it is built
    lazily and rebuilt when the city size changes — never at import, for the
    reason `TRACKER_RANGE` became a function. With the setting off it fades to
    nothing and is culled, exactly as before, and turning both PERMANENT BLOOD
    *and* ZOMBIE CORPSES off wipes the layer.
  - **The bake happens before the blit, in the same `drawBlood` call.** A mark
    crossing into the layer on the frame it leaves the live list would otherwise
    be drawn nowhere for one frame — culled from the bands, missed by a blit
    that already ran. A settling corpse has the same trap and `drawZombieCorpses`
    dodges it by drawing the body one last time, an exact match for what the
    blit shows next frame.
  - **More variety, and pistols barely bleed.** A rifle hit is 3–7 ellipses
    streaked downrange, sometimes a round pool, and a little fine cast-off flung
    well past the body; sizes are `rand()**2`-weighted so most are small and a
    few are not. A pistol (`Shot.light`, set server-side by weapon id, not
    damage — a shotgun pellet is low per hit and still tears) is 1–2 small marks
    and 40% of the spray. `BloodDecal` is an ellipse (`rx`/`ry`/`rot`) now
    rather than a circle.
- **Zombie corpses.** A shot shambler ragdolls `CORPSE_SLIDE_PX` along the
  round over `CORPSE_SLIDE_MS`, its green lerps to `CORPSE_COLOR` over
  `CORPSE_GREY_MS`, and then it settles into `stainLayer` beside the dried blood
  and stays for the round. Off (ZOMBIE CORPSES, or BLOOD entirely) it just fades
  out over `ENTITY_FADE_MS` as before.
  - **`World.deaths` is a transient list exactly like `world.shots`** — cleared
    right after the snapshot, a handful of entries at most and a burst of them
    at the endgame. `killEntity` pushes `{id, x, y, a}` for a **zombie** death
    only (`a` = the round's travel direction; the dog path returns before this).
    The client throws the corpse off it and `tracked.delete(d.id)` kills the
    160ms fade ghost so the two don't both draw. Dogs keep their own
    `world.corpses`, which is on the wire and fog-exempt — a handful a round.
  - **Drawn as a cheap flat sprawl** (`drawSprawled`), not through `drawEntity`
    — `dead` there is dog-only, and a dedicated shape is cheaper to bake. Under
    the walls, beside the dog corpses.
  - **It has four limbs, and for a long time it had three.** See **A corpse has
    four limbs and no two fall the same way** below.
#### A corpse has four limbs and no two fall the same way

Reported off a screenshot, *"zombie corpse missing arm"*, and the drawing said
exactly that. It was three strokes at deliberately mismatched angles — `a + 2.5`,
`a - 1.7` and `a - 2.7` — which is a left leg, a right arm and a right leg, and
leaves **the whole forward-left quadrant empty**. From above that does not read
as a body flung about; it reads as one with an arm torn off. The asymmetry the
comment beside it was after belongs in the lengths and angles, not in the count.

- **The arms come off the shoulders and the legs off the hips**, rather than
  three of the four coming off the middle. It costs nothing and it is what makes
  an arm reach forward of the torso like an arm, instead of coming out level
  with the hips and reading as a third leg.
- **Every limb is hashed off the corpse's own seed, never rolled**, the same
  rule and the same reason as the dog's saliva strands and the acid's churn.
  `drawSprawled` runs on every frame the body is on screen *and* once more when
  it is baked into `stainLayer` — a `Math.random()` anywhere in it is a corpse
  whose arms twitch until it settles and then jump as it is baked.
- **The seed is on the record, not derived from where it is drawn.** A corpse
  *slides* `CORPSE_SLIDE_PX` along the round before it settles, so limbs hashed
  off the live `x, y` would rearrange themselves every frame of that slide.
- **The arms swing about twice as far as the legs** (`CORPSE_ARM_JITTER` 0.55
  against `CORPSE_LEG_JITTER` 0.26, and the same ratio on length). Arms are the
  loose end of a dropped body and land wherever they were thrown; hips are held
  together by the pelvis, and two legs that fell in wildly different directions
  read as a doll rather than as a person. Much beyond this the arms start
  crossing the head and the legs start crossing the arms.

`client/corpserig.html` is the rig, under `client/src` so unlike the harnesses
at `server/` root it is covered by `npx tsc --noEmit`. rAF is throttled to
nothing while the browser pane is not compositing, so no frame of a real round
can be put on screen from here; `getImageData` needs none. It sweeps **reach per
bearing** out of the body's centre — the same sweep `acidcheck` walks round a
cloud — and looks for each limb's peak in its own sector.
`setThreeLimbedCorpse` is the gate and it is kept.

| | OLD | NEW |
|---|---|---|
| limbs found, per body | **3** | **4** |
| the left arm | **null on 4 of 4** | found on 9 of 9 |
| widest bare run, median | 121° | **83°** |
| arm swing across seeds | — | **48°** |
| leg swing across seeds | — | **20°** |
| distinct drawings from 6 seeds | — | **6** |
| same seed drawn twice | — | identical |

*Two things about the rig were the rig lying rather than the code failing, and
both are the sort that read as an off-by-one in the drawing:*

- **The head is not a limb.** It sits at 0° and reaches `1.49r` on its own,
  which clears the limb threshold — so counting runs of long reach gives limbs
  *plus one*, and the rig first reported "4 limbs, not 3" of the old drawing and
  "5, not 4" of the new. The claim is made on the per-limb peaks instead, which
  come back `null` for a limb that is not there.
- **A flat ±42° window round each base overlaps for the two legs**, which are
  only 62° apart across the back — so one leg's search found the *other* leg's
  tail and the rig reported a leg that had swung 41° on a drawing whose legs
  cannot move more than 15. It read the legs as swinging exactly as far as the
  arms. The sectors are the midpoints between neighbouring limbs now.

*And one figure is worth reading correctly.* The **worst** bare run barely moves
— 125° to 110° — because an arm thrown well forward leaves a wide span between
it and the leg behind it. That is a limb in an unusual place, not a limb that is
missing, which is why the check is on the limb count and the run is compared on
medians.

- **The vignette is one cached image.** Built at viewport size and blitted,
  under the HUD and over the fog, so it frames the world without dimming
  anything you have to read.
- **The cursor is a warm-amber gunsight** (`AIM_AMBER`), not a UI green or a
  sci-fi cyan — a phosphor colour, deliberately. Every mark is stroked
  **twice**, a dark underlay then the amber, so it holds on a white wall as
  well as on the road; the old crosshair was pure white and vanished on light
  buildings. `drawCrosshair` is four ticks, a broken ranging ring and a centre
  pip; `drawReticle` (scope) and `drawTargetCursor` (armed order) were recoloured
  to the same amber so the whole family reads as one.

#### A dot has to be tellable from the road

Reported as *"swat don't really stand out on the mini map… when you are all the
way zoomed out and everyone is just dots"*, and the numbers say it flatly:
`SWAT_COLOR` is `#1c1f26` and `GROUND_COLOR` is `#1b1d20`, which is **(1, 2, 6)
apart per channel**. Below `ENTITY_DETAIL_SCALE` a body is one filled arc of its
own colour, so at the fully zoomed-out 0.29 a SWAT dot puts down **0 pixels you
can tell from the road it is standing on**, against 44-52 for every other kind
at 95-212/255 of contrast. They were not hard to see; they were not visible.

- **A mark, not a colour.** Repainting the dot was the obvious fix and is the
  wrong one: the colour is what says SWAT everywhere else, and a body that
  changes colour as you scroll the wheel is a body you have to learn twice. The
  ring is drawn wholly *outside* the dot — centred a half-width past the gap —
  so the body keeps its own size and its own colour. Measured: the centre pixel
  is still `#1c1f26` on 4 of 4 of a stack.
- **`SIMPLE_RING_PX` and `SIMPLE_RING_GAP_PX` are screen pixels, and that is the
  whole of why `drawEntity` gained a `scale`.** `lineWidth` and the radius are in
  world units under the camera transform, so a ring written down as 2 lands at
  0.58px of screen at 0.29 — a grey smudge on a black dot, which is the exact
  fault it exists to fix. Measured at both ends of the range this drawing is
  ever used at: at 0.292 (a full 5000x3700 city) the dot edge is 4.1px, the mark
  5.1-6.7 and the outer edge 7.4; at 0.486 (the smallest city, just under the
  detail threshold) 6.8, 7.9-9.6 and 10.1. **Gap 1.0 → 1.1px and thickness 1.6 →
  1.7px across a 1.67x change of scale** — constant, which is the claim. The
  ring's *radius* does grow, because it hugs a dot that grows.
- **The gap is not decoration.** A white stroke laid straight onto near-black
  gear reads as one fatter pale dot rather than as a body with a mark on it.
- **It stays on through a turn, unlike the helmet.** The reddening tell is
  carried by `color` and the ring is carried by who they are, and one of your own
  going over is the last body on the map you want to lose track of.
- **Only SWAT.** Every other kind already differs from the road by 95-212 of one
  channel, so a second ringed thing would cost the first one its meaning.
  Soldiers are the nearest call at 95 and are still plainly green.
- **It costs nothing, because there are never many.** A radio sends one van and
  `ITEM_CITY_CAP` holds radios at 2, so this is a stroke on a handful of bodies
  against four hundred filled arcs.
- **Only a spectator ever sees it.** `CAMERA_ZOOM` is 2.0 and `DOG_CAMERA_ZOOM`
  1.5, so no seat in the game reaches `ENTITY_DETAIL_SCALE`; `simple` is where
  the ring lives, and the full drawing measured **0 white pixels** either way.

`client/swatring.html` is the rig — a canvas and nothing else, no socket and no
port, so it leaves a game on 8080 alone. It draws through the real `drawEntity`
on the real `GROUND_COLOR` at the real fully zoomed-out scale and reads the
pixels back, because "does it stand out" is a claim about pixels and a
screenshot cannot settle it — least of all from a browser pane that is not
compositing, where rAF is throttled to nothing and `getImageData` is the only
thing that works. It lives under `client/src`, so unlike the harnesses at
`server/`'s root it is covered by `npx tsc --noEmit`.

*One of its figures was the rig lying before it was ever the code.* "Visible
pixels that are not white" looked like the right before-and-after and is not: it
counts the ring's own antialiased skirt as body, and read 36 where the body puts
down 0. What the body puts down has to be counted *inside the dot's own radius*.

### The dog is baked, not drawn

`client/src/dogsprite.ts` paints the dog's parts **once** into offscreen
canvases; `render.ts` only poses them. This is the seam to reach for if
anything else ever needs to look better than live shapes will allow.

- **Baking buys finish, not detail.** The look stays what the rest of the game
  already is — bold flat shapes, strong silhouette, the same family as the
  officers and the crowd. What a bake buys is the *finish* on those shapes:
  supersampled edges and soft form shading that no per-frame budget would
  cover. Painted fur and per-pixel grain were built first and thrown away —
  they read as a different game pasted into this one. **The reference photo is
  for silhouette and the top-down read, not for the rendering style.**
- **It is parts, not a picture.** One baked sprite of a whole dog is a dead
  sprite: the head has to swing, the halves have to come apart, the legs have
  to walk. So the body, *one* head half, *one* limb segment and one paw are
  baked, and the poser assembles them — ordinary 2D cutout animation, which is
  what buys finished parts and articulation at once. Both bones of all four
  legs are the same limb sprite.
- **The legs are two-bone IK, and nothing less will do.** The knee started as
  the midpoint of hip-to-paw nudged sideways, which keeps the two bones in a
  fixed relative pose — so the whole leg simply *rotated* about the hip as the
  paw swung, and it read exactly as a stick on a pivot. Solving the joint
  against two fixed bone lengths makes the leg **fold and extend** instead: a
  paw out at the front of its stride is further from the hip than one underneath
  the dog, so the leg gathers and straightens over the cycle on its own. Fixed
  bones also make the sprite stretch a constant, where before every frame drew a
  slightly different-length limb.
  - **Front and rear must fold opposite ways.** A dog's elbow points back and
    its stifle points forward; give all four the same bend and it walks like a
    table.
  - **The foot is down for most of the cycle.** `max(0, sin)` has it airborne
    half its life, which is a paddle rather than a walk — raising it to a power
    narrows the lift into a short event and leaves the rest of the stride
    planted.
  - **Paw first, then the leg over it.** Drawn last it sits on top of the shin
    like a blob stuck on the end. From above the leg comes down *onto* the foot,
    so the lower bone overlaps the ankle and only the toes show past it — and
    the upper goes over the lower at the knee for the same reason.
- **Supersampling is most of the win.** Everything is painted at `DOG_SS` (6)
  times final size and drawn back down; the downscale is a free high-quality
  antialias. At a body barely forty pixels long, clean edges are most of what
  "looks good" means.
- **Mirroring, so the two sides cannot disagree.** One head half and one limb
  are baked and drawn flipped, via `drawSprite`'s `flip`.
- **`roundOff` is the trick worth knowing**: a *blurred dark stroke laid on a
  shape's own outline, inside a clip of that shape*. It turns a flat blob into
  a rounded one, and a blur is unaffordable per frame and free once.
- **The head splits; it is not a jaw on a hinge.** A dog opening its mouth is a
  dog. Two half-skulls peel apart about a hinge at the neck, each taking an eye
  with it, throat open between and strings of saliva still bridging the gap.
  Each half is baked with its inner edge flat along y=0, so at rest the pair
  meet exactly on the centre line and read as one head with a seam — **there is
  no separate "closed" drawing.**
  - **They pull apart as well as swinging** (`DOG_SPLIT_SPREAD`). Rotation alone
    is a jaw on a hinge however wide it goes, because the two pieces stay joined
    at the back; sliding each one out from the hinge opens the seam along its
    whole length, which is the difference between a mouth and a skull coming
    apart.
  - **The opening is eased, and it slams shut.** The wire carries a boolean, so
    a head driven straight off it was simply open on some frames and shut on
    others. Now that the mouth is *held* open for two seconds, the opening is a
    thing you sit inside rather than a beat, and **the closing is the only
    moment left with any snap in it** — `DOG_JAW_SHUT_MS` is 35ms against
    `DOG_JAW_OPEN_MS`'s 90. Easing the close over a quarter-second, which is
    what it did first, made the jaws sag together like a drawbridge.
  - **The saliva is most of what sells it.** Each strand has its own breaking
    point, hashed off the dog's id: below it the string bridges the gap and
    bows, past it the thing has given way and hangs off both halves with a bead
    swinging on each stub. Hashed rather than rolled means the mouth comes apart
    the same way twice, which is what makes it read as anatomy rather than as
    particles. They thin as they stretch, because a string being drawn out does.
  - **The throat has to stay inside the jaws.** The half-skulls reach 0.9 radii,
    so a maw drawn any longer pokes past the muzzle tips and stops being a
    throat — it becomes a red blob stuck on the front of the animal, which is
    exactly what widening the split first produced.
  - **The tongue has to reach *past* them, for the same reason in reverse.**
    Kept inside the mouth it is the same colour and roughly the same shape as
    the throat behind it and reads as more maw; lolling out beyond the muzzle,
    lighter than the throat and carrying its own dark contour, it reads as a
    separate thing hanging out of the animal. It is a tapering body with a
    forked tip rather than a stroke, it lolls to one side, and it moves on its
    own clock — a tongue that sits politely still inside the mouth is one nobody
    notices.
- **A dog gets no self-ring.** Every other body draws a white outline when it is
  yours; on a dog it was the loudest thing on screen, a bright hard ellipse
  round the one entity whose whole design is being dark and hard to read. It is
  also the least necessary one — at most two dogs exist, the camera is on yours,
  and `drawSelfMarker` still puts a chevron where it went if the pan takes it
  off screen.
- **The eyes stay live**, not baked: they are additive and have to lie over
  whatever the halves are doing. The glow radius is small on purpose — at any
  radius it wants to be, the wash covers the whole skull and the head comes out
  cream whichever side you look at. It says the eye is lit; it does not light
  the animal.
- **The head has to clear the shoulders.** Hinged at 0.34 radii the drawn nose
  landed at 1.24 — *inside* the 1.3-radius front of the torso — so the head was
  buried and the animal read as a lozenge with a face painted on the end. It
  hinges at 0.86 now, well forward, and the neck has something to be.
- **Ears are the single thing that made it look cute**, and the fix is shape
  rather than size: a soft round ear is what a puppy has. They are knife-thin
  blades raked back off the skull now, with a notch bitten out of the trailing
  edge and the bare side's torn to a stump. The asymmetry is what stops a pair
  of ears looking designed.
- **The silhouette is where gruesomeness lives.** Chunks are bitten out of the
  torso outline — dark ovals drawn from *outside* the shape, so the clip keeps
  only the part that lands on the body and each is a piece of the dog that is
  simply missing, with a rim of raw meat where the hide gave way. A smooth
  outline reads as a healthy animal whatever is painted inside it; this is the
  one change that makes the shape itself look wrong.
- **The rest of the gore is texture, and all of it is dark.** A row of spine
  knuckles pushing up through the hide, matted wet streaks with one thin sheen
  each, a torn cheek on the bare side showing back teeth even when the mouth is
  shut, blood worked back from the jaw line and drawn *over* the teeth (clean
  white teeth in a bloody mouth is the giveaway that the blood is a decal), and
  the last third of the tail stripped to bone — which reads instantly because a
  tail is the one part of the silhouette that sticks out into empty ground.
- **The maggots only work because the wound is nearly black.** Seven pale grains
  against the cavity: the cheapest unpleasant detail on the animal, and
  invisible against anything lighter.
- **The ribs must be uneven.** Four, one snapped short, one bowed further than
  its neighbours — evenly spaced and evenly bright is the barcode this already
  got wrong once.
- **None of it costs a frame.** All of it is painted once into the part sprites
  at startup, which is the whole reason the animal can carry this much detail;
  the per-frame cost is still about twenty `drawImage` calls.
- **Four things went wrong repeatedly, all of them brightness or scale.** Bone
  at full value makes half the head the lightest thing on screen and reads as a
  mask. Five even bright ribs is a barcode, not a ribcage. The legs were too
  long and the paws too splayed *twice* — from directly above that is not a
  dog, it is a spider with a starfish at each corner. And pale leg tips at the
  bigger size turn into little sprouts at each corner. All of them pull the eye
  off the head, which is the one place it should be; everything bar the teeth
  and the eyes is shaded well down.
#### How photoreal it could get, and why it isn't

`client/photodog.html` is a **standalone study**, imported by nothing. It asks
how far a top-down dog can be pushed with no regard for cost: a deferred
renderer that bakes a height field from ~45 ellipsoid masses, differentiates it
into surface normals, lights every pixel by hand (wrapped diffuse, Blinn-Phong,
AO off the height, rim, a little subsurface red through the thin parts), then
lays **130,000 individual hairs** over it, each lit by the surface it grows out
of and following a flow field. **1.9s for one frame** at 2200×1480.

Keep it. It is the reference for anything that ever needs to look better than
flat shapes, and the two findings out of it are worth more than the picture:

- **Shading was never the bottleneck; geometry is.** The coat genuinely reads as
  fur and the body genuinely has form — but the mouth, drawn as flat 2D over the
  top, looks *pasted on*, and no amount of lighting fixes that. Everything has
  to be in the height field or nothing should be. And ellipsoid blobs cannot
  make a skull, a jaw hinge or a shoulder blade: the body reads as a furry tube
  because it is one. Reaching photoreal means a real 3D model rendered to sprite
  sheets offline, which is a different project.
- **The lighting was ported into `dogsprite.ts` and reverted.** Deriving a
  height field from each part's own alpha and lighting off it is strictly better
  *when it is the only lighting* — and strictly worse on top of gradients that
  were already hand-painted to look right. The two shade the same form twice and
  the animal comes out flat, grey and desaturated. Measured by eye against the
  version before it, which was plainly better. **Do not re-attempt this without
  first stripping the hand-painted gradients out.**

- **`client/dogpose.html` is the rig** — it imports the real `drawEntity` and
  drives frames off `setInterval`, because rAF is throttled to nothing while
  the browser pane isn't compositing. It draws the poses at 6x *and at 1:1 with
  an officer beside them*, which matters: judging a 13px animal at six times
  life is how you end up with detail nobody sees and a silhouette that doesn't
  read. Measured in a live city: 144fps, 2.7ms tick, with the dog on screen.

### The options screen, and the one row on it worth anything

Every row is a *client* decision — how the world is drawn, never what is in it
— so nothing on it reaches the server and no two players can see a different
game because of it. That is the line, and it is what decides what "resolution"
is allowed to mean here.

**PERMANENT BLOOD and ZOMBIE CORPSES** sit under BLOOD, which is their master
switch — off takes both with it, and both dim when it is. Defaults on; the LOW
preset turns them off, since each builds a cached layer and draws a few live
shapes a frame. See **Art direction** for the `stainLayer` bake. Turning both
off wipes the layer so the marks actually clear rather than freezing.

**RESOLUTION changes how many pixels the frame is painted at, and nothing
else.** `RENDER_SCALES` is 0.5 to 1.5 of the viewport — 960x540 up to
2880x1620 — and the *layout* stays 1920x1080 at every setting. Everything in
the client is written in those layout units and one `ctx.setTransform(px, …)`
at the top of the frame maps them onto the backbuffer, which is why a
resolution setting needed no arithmetic anywhere else. The amount of world on
screen is identical at every setting; a row that changed how much city you
could see would be a cheat, not a graphics option.

- **It is the only row here that buys anything in proportion to itself.**
  Everything else is a cached fill measured in fractions of a millisecond — the
  grime tile 0.09ms, the vignette 0.36ms. Painting is not cached and scales
  with *area*: 0.75 is 56% of the pixels and 0.5 is a quarter of them. Above 1
  is a supersample the browser scales back down, which is a free high-quality
  antialias — the same trick `DOG_SS` uses to bake the dog.
- **It is in the LOW preset at 0.75**, and it is worth more there than the
  other five rows put together. Not the floor, because LOW should still be
  playable to look at.
- **The default is 1**, deliberately, not the sharpest on offer: the game is
  tuned and measured at the viewport's own size and a fresh install should see
  what it was designed to cost.
- **There are exactly four places that know a real pixel from a layout one**,
  and a fifth would be a bug. `applyRenderScale` sizes the two canvases; the
  frame transform; `drawFog`'s `m` and `s`; and `input.ts`'s mouse mapping.
  - **The fog mask has to come with it.** `FOG_MASK_SCALE` is a fraction *of
    the backbuffer*, so a mask left at full size while the frame halved would
    be blitted up by half as much and its penumbra would come out half as wide.
    Both of `drawFog`'s scales carry the render scale for the same reason —
    left at bare `FOG_MASK_SCALE` the hole is written at twice the mask's size
    at 0.5 and half of it at 1.5: off-centre, clipped, and looking exactly like
    the polygon collapses this file has had twice before.
  - **The mouse is reported in layout units, not backbuffer pixels.**
    `input.ts` read `canvas.width`, which is the same number as
    `VIEWPORT_WIDTH` only at a scale of 1 — left alone, the crosshair would
    drift further from the cursor the further the scale is from 1, and in
    exactly the settings a struggling machine picks. The beacon map's hit test
    had the same read and the same fix.
  - **Resizing a canvas resets its context**, so `imageSmoothingEnabled` is set
    again inside `applyRenderScale` rather than once at startup.

**The client half of this is arithmetic and an enumeration, not a rig**, and
that is worth saying plainly. rAF is throttled to nothing while the browser
pane is not compositing — a round started offline never painted a single frame,
verified by reading the backbuffer's centre pixel back as transparent — so the
same standard applies as to `DOG_CAMERA_ZOOM`: the sites were confirmed by
listing them, the cycle and the backbuffer sizes were measured live
(1920x1080 → 2400x1350 → 2880x1620 → 960x540 → 1280x720 → 1440x810 → back,
`canvas.width` following exactly), and somebody has to look at the picture.

#### A screen taller than the window has to scroll

Reported as *"in the options menu you need to be able to scroll up and down. I
cant see the back button"*, and the numbers say it flatly. Measured at 1024x600
— a stage 576px tall — the options screen's content is **784px**: eight rows,
two presets and BACK, overflowing by 208. `.screen` had `overflow` at the
browser's default and `html, body` are `overflow: hidden`, so what fell off the
bottom was simply gone, and what fell off was the only way off the screen.

- **`justify-content: safe center` is the load-bearing half, and plain `center`
  is the trap.** A centred flex column overflows *both* ends and **the overflow
  above the container cannot be scrolled back to at all** — so adding
  `overflow-y: auto` on its own trades a missing BACK button for a missing
  heading. Measured on the real screen with the old rules put back: the
  scrollable range is **84px against 208px of overflow**, with the heading
  **168px above the top** and unreachable at any scroll position. `safe` keeps
  the centring for anything that fits (the title screen is untouched, 0
  overflow) and pins anything that does not to the top.
- **`.screen > * { flex-shrink: 0 }` is needed with it.** Flex children shrink
  by default, so an over-long screen squashes its own rows to fit instead of
  scrolling, and the scrollbar never appears to say there is more.
- **The scrollbar is painted**, because the default one is invisible against
  `#0b0d10` and a scrollbar nobody can see answers "is there more below?" with
  nothing.
- It is on `.screen` rather than on `#screen-options`, so the lobby and
  everything else gets it too — those are the screens that grow.

**And Escape is BACK on every screen that has one**, which is the half that
needs no scrolling to reach. `escapeBack` in `menu.ts` maps a screen to *the
same call its own button makes* rather than to a `show` of wherever it came
from — `btn-online-back` runs `askName`, which is not merely `show('name')`, and
two ways back that differ in what they do is the sort of thing that rots.

- **The lobby is left out on purpose.** Escape there would be `lobbyLeave`,
  which despawns you and closes the room behind you if it is yours, and a
  reflexive keypress must not take four other people's lobby down with it. The
  title screen gets nothing either: there is nowhere behind it.
- **A round owns Escape once one is up.** `main.ts` gates its own handler on
  `started` (pause offline, quit online); this one gates on the shell being
  hidden, which is the same fact seen from the other side. Verified both ways:
  inert while the shell is hidden, working again the moment it is back.

Measured live at 1024x600 and 1280x720: BACK fully on screen once scrolled, and
`elementFromPoint` at its centre returns the button rather than something over
it; the heading 20px from the top at `scrollTop` 0. Escape backs out of options,
name, online, create and join — including from **inside a focused text box**,
which is where the code box would otherwise have swallowed it — and does nothing
on the title screen.

## Performance rules (these matter — 400+ entities)

- **The park was overdraw, not the fog.** Walking through the trees stuttered
  because `drawBushes` filled a hundred-odd *translucent* overlapping circles
  separately, and that fill-rate cost is paid per pixel per frame. They all go
  into one path now, filled once — the union costs about what a single blob
  does. Worth recording what it was *not*: measured, the fog polygon is
  **faster** in the park (0.30ms) than in a street (0.74ms), there are fewer
  entities in view there than at the busiest spot (12 vs 31), and the
  bush-refuge scan is 0.37ms across every hider on the map. All three were
  plausible and all three were wrong.
  - **That 0.30ms was cheap because it was wrong**, and the figure is history.
    It was taken while `MAX_BUSH_OCCLUDERS` was dropping three quarters of the
    park on the floor — see the third fog fault under **Known open issue**. The
    park is now the dearest place to stand rather than the cheapest: a dog pays
    0.46ms there and a scoped officer 0.99ms, which is still a fraction of a
    frame and is what a park honestly costs.

- **The fog's per-frame cost is the blit, not the polygon — and the polygon's
  point count does not enter into it.** `fogpoly` on the HUD is the visibility
  polygon and it is cached, so it reads 0.00 standing still; what is paid every
  frame regardless is clearing and refilling the mask, filling the cached path
  through a `blur()` filter, and blowing the half-res mask up to the backbuffer.
  Measured at the real mask size: the path fill is **0.04ms and flat in vertex
  count** (0.042ms at 208 points, 0.043ms at 552 — the blur is area-bound), and
  the blit was 1.04ms against 0.25ms with smoothing off. So the blit is off now.
  It is visually free because the mask is already blurred 4.5px before it is
  upscaled 2x: over a whole 1920x1080 frame of park fog, `'high'` against off
  differs by **0.28/255 of alpha on average, 8/255 at worst, 0% of pixels over
  8**. Anything that wants the fog cheaper should go after those three and not
  after the polygon.
  - **In Firefox that one flag is worth four milliseconds and eight frames a
    second**, against the 0.8ms Chromium says. Measured by flipping it live
    mid-round from one spot on a park path — the only honest way, the map not
    being seeded: `'high'` gives **fog 10.0 · render 28.0 · 34fps**, off gives
    **fog 6.0 · render 23.0 · 42fps**.
  - **The 37fps park report was Firefox, and Chrome could not reproduce it over
    several generated parks.** Every phase was inflated together — `map 7.0 ·
    effects 3.0 · fog 11.0 · hud 7.0`, against ~1.5ms for the whole scene and
    0.3ms for the HUD's DOM in Chromium. A uniform 5-10x on every phase is the
    browser's canvas, not any one phase being wrong. **Quote which engine a
    frame figure came from**; the two disagree most on exactly the operations
    this game leans on (`ctx.filter` and `imageSmoothingQuality`), and Chromium
    understates what they cost by about 4x.

## The target browser is Chrome

Decided when the 37fps park report turned out to be Firefox-only and Chrome
could not reproduce it over several generated parks. **Test in Chrome; do not
spend time making frame figures good in anything else.** The game has core
features still missing, and multi-browser performance work is not what that time
should buy.

- **It is a testing rule, not a compatibility one.** Nothing here is
  Chrome-specific and Firefox plays perfectly well — it is slower, and that is
  now somebody's recommendation to switch rather than a bug to chase.
- **Anything that came out of the Firefox chase and was worth keeping is
  already in**, so the decision costs nothing already paid for. The fog blit's
  smoothing is the one real fix out of it — 0.8ms in Chrome, 4ms and eight
  frames a second in Firefox — and it was found only because Firefox charges
  4x for that class of operation and so made it visible. Worth remembering that
  a slow engine is a magnifying glass even when it is not the target.
- **`map` at 8-9ms was the next Firefox lead and it was dropped there.** For the
  record, since it will look like an obvious hotspot to anybody reading
  `drawGround`: it fills the *whole world*, 5000x3700, twice — once solid and
  once with the grime pattern. Chromium clips that to the screen for free, which
  is why the grime measures 0.09ms there. Whether Firefox does was never
  settled. Do not "fix" it on the strength of how it reads; in Chrome there is
  nothing there to fix.

- **Everything expensive is budgeted or cached.** AI perception runs at 10Hz
  staggered per entity, not per tick; bush scanning and refuge choice are cached
  per entity.
- **Budget the work, not the number of calls.** A\* was capped at
  `PATH_BUDGET_PER_TICK` (10) *searches* and `PATH_MAX_NODES` (14000) nodes per
  search — and nothing capped the product, which is what the tick actually
  spends. Ten searches at the cap is 140,000 node expansions inside a 33.3ms
  budget. Measured on a 358x265 grid: a typical search costs 1.6-2.3ms and the
  worst **27ms**, so ten of those is **274ms** — which is the sporadic spike
  that was being reported. `world.pathBudget` is charged in *nodes* now
  (`PATH_NODE_BUDGET_PER_TICK`), and each search is additionally capped by
  what is left of the tick, so one awkward route cannot take the frame.
  - **Size a cap against measured demand, or it never fires.** The first value
    tried was 24000, picked by eye. Real demand in a live city is **median
    340-465 nodes a tick**, p99 14-15k, worst 28k — so 24000 would have bound
    on 0.0% of ticks and changed nothing. 12000 binds on 1.8-2.5% and leaves
    the median untouched. `server/nodedemand.ts` measured it; `pathbench.ts`
    is what measures per-search cost and the success-rate cost of a tighter cap
    (14000 finds 84.5% of random cross-map routes, 8000 finds 72.7%).
  - Measured A/B, alternating on one evolving world: p99 **14.8→13.4** and
    **12.8→11.3ms**, median unchanged. It is a bound on the tail, not a speed-up.
- **The danger field is the scaling primitive.** One BFS from all zombies at 6Hz
  serves every human in O(1). Prefer adding to it over per-entity searches.
  `world.zombieGrid` is the third one: threat perception asked the grid holding
  *everybody* what was near, collected a couple of dozen neighbours and then
  rejected all but the zombies on a type check — so its cost scaled with how
  many people were alive rather than with how far the outbreak had got. It is
  filled in the walk `rebuildEntityGrid` was already paying for. Measured with
  the old behaviour gated back in, alternating every 50 ticks on the same
  evolving world: `updateAi` median **5.36→3.99 / 7.33→6.73 / 8.67→6.97**,
  better in 3 of 3 cities on both median and p90.
- **Ask the broadphase a question rather than for a collection.**
  `SpatialGrid.some` walks the cells and stops at the first item that matches,
  allocating nothing. `hasLineOfSight` and `hasWallClearPath` used to build a
  `Set` of every wall in the sight line's bounding box — over a hundred of them
  — before testing a single one, when the answer is usually settled by the
  first. It deliberately does **not** deduplicate: an item straddling two cells
  gets tested twice, which for a predicate costs one extra test and cannot
  change the answer, where the `Set` was paying an identity hash on every item
  to prevent exactly that. Measured over 6000 sight lines: **2.5x** on
  `hasLineOfSight`, **2.3x** on `hasWallClearPath`, and 6000/6000 samples
  answered identically to the version it replaced.
  - **A `Set` is not always the slow choice.** The same array-and-stamp
    treatment applied to `queryRect` wholesale measured 2.6x on perception-sized
    queries and **0.8x — slower — on collision-sized ones**, which are by far
    the most numerous. Small queries collect ~6 walls and a small `Set` beats
    the bookkeeping. That is why `queryRect` still returns one.
  The **room map** is the second one, and the same trick: build the answer once
  for everybody rather than letting each entity go and look. `RoomMap` costs
  1-8ms alongside `generateMap`, once per round, and occupancy is two counters
  folded into the survivor walk the tick was already paying for.
- The city is **5000×3700** with `HUMAN_COUNT` 500, which works out very
  slightly *denser* than the 4600×3400 / 400 it grew from. Measured after the
  change, three seeds at 120s: 195/91/63 zombies, in line with what the same
  seeds produced before, so the outbreak still takes hold at the larger size.
  `generateMap` went ~7ms → ~17ms, once per round.
- **A headless harness must advance a clock, or it measures nothing.** This
  section used to claim the harness cost **1.74ms median at 516 entities**. That
  figure was an artifact and the real cost was roughly eight times it. Ticks run
  back to back complete in microseconds, so `Date.now()` barely moves — and
  every time-gated piece of work is therefore skipped almost every tick:
  perception at 10Hz staggered per entity, the danger rebuild, re-picking a
  wander target. The harness was measuring an AI that was mostly not running.
  Advance a clock by `TICK_MS` per iteration and pass *that* as `now`. Doing so
  took the same harness from 1.7ms to 13.4ms, which finally agreed with the live
  server's own `[perf]` line. **Anything measured headlessly before this is
  suspect.** `server/tickprof.ts` is the corrected harness.
- **The server prints where its tick went**, every 5s, next to the average:
  `updateAi 7.5 · collisions 2.7 · prep 0.8 · grid+frozen 0.5`. The client HUD's
  `tick` number alone cannot distinguish the AI from the collision pass from
  per-viewer serialisation, which are different fixes. Same trick as the
  client's frame profiler.
- **The tick is dominated by `updateAi`, not by serialisation.** Measured at
  ~515 survivors: `updateAi` is roughly 60-70% of it, collisions ~20%, and
  everything a *player* costs that a spectator does not — `visibleTo`,
  `visiblePickups`, the snapshot and its `JSON.stringify` — totals about 1.3ms.
  Cost varies hugely between cities (8.9ms and 19.7ms from identical code), so
  quote a range and never compare two single runs.
- `generateMap` costs ~17ms, once per round. The connectivity repair pass builds
  a nav grid per iteration, so keep its iteration cap low.
- Client shows fps / tick ms / fog ms top-right. Watch it after AI changes.
- **The frame budget is spent in crumbs, not in one place.** A 25s incognito
  trace, no mouse, no keyboard, 5 bots: the rAF callback is **6.8ms median** and
  3 frames in 854 ran over 16.7ms, yet frames arrived **29.4ms apart** and
  `BeginFrame` fired ~65 times a second against 33.6 rAF fires. The browser was
  offering frames and the page was missing every other one. Nothing in the
  pipeline is dear — `RasterTask` totals **35ms across the whole 25 seconds**,
  `Paint` 26ms, `Commit` 1.02ms median. What is true is that the main thread is
  busy 43% of wall clock, which over 854 frames is **12.8ms a frame against a
  16.7ms budget** — 77% utilisation, where any jitter slips a frame and the
  frame rate halves. There is no single thing to fix; there is a few
  milliseconds to find.
  - **Incognito ruled the extensions out.** Same 34fps with them gone, though
    GC did drop 4x (MajorGC 399ms → 87ms), so extensions were costing something
    — just not the frame rate.
- **`ctx.font` is a CSS parse, and it was being set per item per frame.**
  `drawPickups` was the dearest function in the client (623ms of a 25s trace,
  with `fillText` a further 346ms) because it assigned `font`, `textAlign` and
  `textBaseline` inside its loop, with the same values every time, for every
  item on screen — and a spectator sees the whole city's loot at once. Hoisted
  out, and the label dropped below `PICKUP_LABEL_SCALE` where a 7px glyph lands
  on about a pixel. Measured over 120 pickups with the city framed: **3.10ms →
  1.70ms**.
  - **Batching them into one path per colour is 2x slower**, and was tried. The
    `Map` and the per-colour arrays are rebuilt every frame, and that allocation
    costs more than the fill-and-stroke pairs it saves. What makes the batching
    work for `drawBushes` and the blood decals is that neither has per-item
    state to sort into buckets first. Measured: 3.95ms → 8.19ms.
- **The client was laying out the page on every mouse move.** This is the one
  that was actually costing frames, and nothing in the render loop could show it.
  `updateMouse` read `canvas.getBoundingClientRect()` per `mousemove` — a
  *layout read* — while the HUD rewrote `innerHTML` every frame, so the layout
  was always dirty and the read always forced a real reflow. Moving the mouse
  across a spectator view laid out the page a hundred times a second.
  - **The frame callback was never the problem, and a trace proves it.** Over
    41s: the rAF callback is **6.5ms median** and **1 frame in 1526** ran over
    16.7ms — yet frames arrived **25ms apart**. The main thread was idle 55% of
    the time. The longest tasks were not drawing at all: a **320ms MajorGC**,
    and input handling at **228ms / 96ms / 64ms** with `Layout` and
    `UpdateLayoutTree` nested inside them. Chrome's own "Forced reflow" insight
    named it.
  - The rect is cached and refreshed on `resize`, on capture-phase `scroll`, and
    by a `ResizeObserver` — the letterboxing changes the canvas's displayed size
    without a window resize of its own. Verified: 200 synthetic mousemoves now
    cause **0** `getBoundingClientRect` calls, and a resize causes exactly 1.
  - The text readouts are written at **5Hz**, and the counts line only when it
    changes. Assigning the same string still dirties layout, and nobody can read
    a number that moves sixty times a second.
  - **The lesson is the shape of it**: a cheap call in an event handler, made
    expensive by an unrelated write somewhere else. Neither half is wrong on its
    own. Anything reading layout — `getBoundingClientRect`, `offsetWidth`,
    `getComputedStyle` — must not sit in a handler that fires per input event.
- **Paint is measurable, and it is not the problem.** `render` on the HUD times
  the canvas *commands*; rasterising them happens after rAF returns, so it lands
  in the frame gap as `elsewhere` and profiling the render loop cannot see it.
  `client/paintbench.ts` forces the rasteriser with a 1px `getImageData` and so
  measures it even in a pane that never composites — draw each configuration
  several times behind one readback, or the readback's own 4-5ms swamps the
  answer and "no grime" measures slower than "everything on".
  Measured at 1920x1080: the whole scene paints in **4.9ms** framed on the city
  and **1.5ms** at a player's zoom. The grim-and-dirty art added nothing worth
  having — the grime tile is **0.09ms** and the vignette **0.36ms**, because
  both are cached and the fill is one pass. Walls are the dearest layer for a
  spectator (2.15ms) and entities for a player (0.44ms). The per-frame DOM the
  HUD writes is **0.3ms**. So a client reporting `else 24ms` is not spending it
  on any of these, and the next place to look is the browser itself — whether
  canvas is GPU-accelerated, and what else on the box wants the CPU.
- **The endgame stall was paint, not simulation.** Four hundred entities each
  cost ~41 canvas path operations, all rasterised at once with the whole map
  framed. Below `ENTITY_DETAIL_SCALE` an entity draws as a single dot, and
  anything off screen is skipped outright. Cost ramps smoothly; dropped frames
  do not — a frame either fits the vsync budget or it does not, which is why it
  read as a sudden onset rather than a gradual one.
- **The frame profiler splits the gap**, not the render loop: `spike` on the
  HUD is the gap between frames, and the expensive thing need not be in
  rendering at all. It prints render / net / elsewhere on a frame over 45ms.
- **The client copies snapshots into the objects it already holds** rather than
  keeping the parsed ones, so they die young instead of being promoted. Add a
  field to `EntityState` and you must add it to `ENTITY_FIELDS` — two flags
  were missed once and silently never reached an entity after its first frame.
  **It has now happened three times**, and the third is the clearest statement
  of why it is so hard to spot: `dead` was missed, and a dog is *always* already
  tracked by the time it dies — you have been driving it — so the flag could
  never arrive. The animal went on being drawn alive, eyes lit and health bar
  up, standing on its own corpse. Nothing errors; the field simply stops at the
  first frame, so the symptom is always "this state change never happens to
  something that has been on screen a while".

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
- **Walking into a wall turns you round on the spot** (`turnAtWall`), but only
  while wandering or searching — there is nothing beyond it worth pressing for.
  `unstickTick` gets there too, a second later, and a second of grinding along
  a wall is exactly what it looks like from the outside. Chasing and fleeing
  deliberately keep pressing: they have a reason to. Measured over three seeds,
  zombie search-grinding went from ~600 samples per 45s to ~2.
- **Anything that notices it is getting nowhere** (`unstickTick`) picks its way
  out from directions that are actually walkable — `nav.lineClear`, not just "the
  far end of the probe is empty", which called a direction clear whenever the
  ground beyond a wall happened to be open.
- **Buildings carry real footprints (`rects`), not bounding boxes.** ~1 in 3 are
  L/T shaped; bbox tests wrongly report the outdoor notch as indoors. Anything
  aiming at a building aims at an `interiorPointOf` it, never its bbox centre.
- **Doors are stored** (`map.doors`) so NPCs reason about actual exits.
- **Rooms are derived from the finished map, not exported by the generator.**
  `partitionRooms` knows the room grid and could hand it over, but only for the
  buildings it partitions — an ordinary block, an L-shaped footprint and a
  `repairEnclosures` cut would all need their own answer. Flood-filling the
  finished geometry gets all four for one algorithm, and can't drift out of
  step with what was actually built.
- **Every indoor space is reachable from the street, by construction and then by
  check.** Rooms are a grid joined by a spanning tree of doorways; a partition
  laid as one long wall with a single gap in it seals off whole corners. On top
  of that, `repairEnclosures` walks the finished map and cuts a doorway into
  anything still stranded — it covers a block clamped flush to the perimeter
  with its one door opening into it, a door onto a pocket too narrow to walk,
  and a door on an L-notch leading nowhere. **Fix new cases there, not by
  special-casing the generator.** It never cuts the perimeter wall.
- **Glass gets the same claws a door does.** `state.breakingUntil` drives the
  clawing arms on the client, and the window-attack branch set the zombie's
  *facing* but never that — so they tore at panes with their arms by their
  sides. One line, and it is the same 400ms the door path uses.
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
  Both sides of a door between two rooms are indoors. Each door resolves its
  indoor face once when it is hung (`insideSign`, 0 meaning both faces count),
  and everything asks that rather than testing the footprint under whoever is
  stood there — that test is unreliable at the exact spot someone occupies
  while working a handle, and it had people hammering to be let into a hallway
  they were already standing in.
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
- `TEST_DROP_ALL_ITEMS = true` — one of every item drops around **each player
  as they spawn**, not into the city at generation. Turning it off leaves the
  map untouched, which is why it is safe to leave on while measuring anything
  that is not about loot.
  - **And it only ever fires in an offline round now** (`world.offline`, set
    from the lobby beside `botOfficerCount`). Safe to leave on was true right up
    until a second person was in the lobby, at which point it is one player
    being handed one of every item in the game while everybody else goes and
    finds them. The flag is still the master switch — turning it off takes the
    ring out of solo rounds too — and `world.offline` defaults **true**, since a
    world built without a lobby behind it is a harness or a bare `?spectate`
    and neither is a game anybody else is in.
- `PLAYER_ONE_SPAWN_AT_CENTER = true` — player one spawns mid-map, not on the outbreak
- `PLAYER_ONE_SHOT_KILL = false` — already off; set true to one-shot zombies
- `TEST_BEACON_ON_A_BOT = false` — **turned off, and worth knowing why.** With
  it on, a bot started with the city's one beacon and called it in at 0s. That
  is fine for watching the sequence and fatal for playing it: `requestBeacon`
  refuses a second call *whoever* makes it, so the player's own handset out of
  the debug heap opened the map, offered a spot, and was refused every single
  time. It reads exactly as "the beacon works for bots and not for me".
  Turn it back on to watch the whole sequence — spot, helicopter, soldier,
  mast, shout — without waiting on a bot walking to the duck pond, and turn it
  off again to play. It *moves* the city's one beacon rather than adding a
  second, and falls back to the bank when there are no bots at all.

## Known open issue

None outstanding. The **fog dead spot** is fixed: ray angles derived from wall
corners (`a ± EPS`) and bush tangents (`base ± spread`) were not wrapped back
into `[-PI, PI]` the way the base fan is. Sorted, those sat past the ends of
the list, and the arc closing the polygon then swept nearly the whole circle
the wrong way round — filling almost everything, which reads as the fog
switching off. The watchdog in `client/src/main.ts` remains, and now logs a
`[fog] OFF` / `[fog] back ON` pair with the seed; if it ever fires again, that
pair plus the coordinates reproduces it offline in seconds.

The lesson worth keeping: the watchdog originally tripped on "almost all of the
circle visible", which is what the fault looks like *on screen*. What it looks
like *in the data* is the opposite — a shoelace area near zero, because a
self-overlapping path cancels itself out while canvas fills it by nonzero
winding. Measure the polygon, not the impression.

**A second, unrelated collapse: a wall you are standing *in* used to blind you
completely.** `rayRect` clamps its near hit to zero for an origin inside the
rect, so every ray in every direction came back at distance 0, the polygon
collapsed onto the viewer, and the fog was left with no hole at all. The fill is
`rgba(4,6,9,0.92)` rather than opaque, so what is on screen is the whole world at
8% — the ground and the faint ghosts of buildings, no walls, no bodies, no dog.
Reported as *"everything but the floor and some fog stop rendering"* and
*"sometimes nothing"*.

- **The rule already existed for bushes and had never been applied to rects.**
  Ten lines below it: *"a bush you're standing in doesn't blind you — you see
  out, others can't see in"*. Walls now skip the same way, inclusive of the
  edge, since a centre landing exactly on the boundary collapses it identically
  and collision permits that.
- **Collision keeps you out of walls, so the way in is a door shutting on you.**
  A shut door's slab is an occluder; an open one is not. Stand in a doorway,
  have somebody slam it — which is precisely what `slamsDoors` does on sight of
  a threat — and your centre is inside the slab. Measured over three cities,
  900 ticks each, sampling every body every 10th tick: **0** samples inside a
  wall, **24 / 66 / 32** inside a shut door, and they are not all civilians —
  officers turn up too.
- **The dog gets it worst, and gets it on respawn.**
  `respawnDogFromHorde` sets `dog.x = host.x` outright, so it rises exactly
  where a shambler stood — and the shamblers most likely to be standing in a
  slab are the ones clawing at a shut door. Dying and coming back into a
  doorway blacks the screen out on the first frame. It also chews doors and
  stands in doorways by trade.
- Measured in isolation, viewer inside the occluder: **0.0% of the circle
  visible → 95-100%**, while the open-ground controls are untouched at 80.3%
  and 66.9% — occlusion still works exactly as it did for walls you are not in.

**A third fault, in the other direction: the polygon was capped at twenty-two
bushes and a park holds a hundred.** Reported as *"fog not rendering with many
trees"*, over a screenshot of a dog on the park path.

- **A dropped occluder is not a blurrier one, it is a transparent one.**
  `MAX_BUSH_OCCLUDERS` kept the nearest 22 and threw the rest away — out of the
  tangent rays *and* out of the list every ray is tested against. So three
  quarters of a park did not exist as far as the fog was concerned: the polygon
  lit straight through the trees, and the only shadows left were the very wide
  ones cast by the handful of bushes nearest the viewer. That is the starburst
  of black wedges in the screenshot, and it is why it reads as the fog being
  broken rather than as trees not casting shadows.
- **The client was the half that was lying.** `hasLineOfSight` walks every bush
  in the query rect with no cap of any kind, so the server had been refusing to
  send anything out there all along. What is on screen is therefore a park lit
  to the horizon with **`2 drawn`** on the HUD — lit ground with nothing in it,
  which is what "the fog is not rendering" actually looks like from the inside.
  Anything that lights more ground than the server populates produces an empty
  street rather than an error; this is the third time that has been the shape of
  it, after the sniper's radius and the binoculars'.
- **The cap predates the near-first early-out and was never re-measured against
  it.** Being an occluder is cheap now: `bushOrder` is sorted by near edge and
  every ray stops at the first bush it cannot beat, so foliage standing behind
  what has already been hit costs one compare. Only *silhouetting* is quadratic
  — four rays each, and every ray is tested against every occluder. One cap was
  being paid on both, and only one of them had earned it.
- **Splitting the two was built and thrown away.** Every bush occluding with
  only the nearest 22 silhouetted fixes the leak completely and costs nothing at
  all, the ray count being unchanged — but the shadow edges then land on
  whichever of the 120 base rays happens to cross a bush, and that three-degree
  quantisation ate **4-23%** of genuinely visible ground. Correct but blocky, in
  exchange for a saving that turned out not to be needed. Swept: 22 or 34
  silhouettes leaves 23% of the ground wrongly dark, 48 or 64 leaves 13-14%, and
  it only comes good at 96 — which is every bush a park has, so the cap was
  doing nothing by then anyway.
- **So there is no cap.** Measured in the thickest part of four parks, one
  build, alternating: a dog pays **0.29 → 0.46ms** per rebuild, and a scoped
  officer — the dearest viewer in the game, where the clip and the radius grow
  together — **0.71 → 0.99ms**, worst 1.9ms. It is paid at most 12.5 times a
  second, and a scope cost 2.93ms median before the occluder clip went in.

| lit, as a share of the sight circle | on the path | in the thicket | a street (control) |
|---|---|---|---|
| before | 26.6-44.9% | 4.3-47.5% | 19.3-32.1% |
| after | 11.1-21.0% | 0.7-21.5% | 19.3-32.1% |
| **truth** | 10.9-20.9% | 0.7-21.1% | 19.2-32.1% |

`server/fogpark.ts` is the harness — headless, no socket, no port, so it leaves
a game on 8080 alone. It imports the client's own `fog.ts`, stands a dog at the
real `DOG_SIGHT_RADIUS` and clip, and compares the polygon against a brute-force
cast over every occluder inside that clip. Three things about it are worth not
rediscovering:

- **It has to be measured per bearing, not by eye.** "The fog is missing" and
  "the fog is in the wrong place" are indistinguishable in a screenshot, and the
  second is what this was. The two figures that come out are ground lit that
  should be dark and ground dark that should be lit, and they move independently
   — the discarded split fixed the first and made the second much worse.
- **The street is the control and it is load-bearing.** With 0-7 bushes in the
  clip the leak is 0.0-0.5% *before and after*, which is what says the polygon
  was only ever wrong about foliage. Without it, "the fog changed" is satisfied
  just as well by having broken walls.
- **It reads the filled path, arcs included, not the vertices.** `drawFog`
  stitches two unobstructed neighbours with a true arc of the sight circle under
  conditions of its own, so a rig that joins the vertices with chords
  understates the lit area everywhere the real thing curved — which would show
  up as a leak the code does not have.

**The watchdog cries wolf, and it is worth knowing before trusting it.** Its
second test is `|fraction - lastFraction| > 0.3`, which fires on the perfectly
legitimate jump from standing in the street to standing in a room. A reported
`[fog] OFF at 1778,231 ... 3% of circle visible, seed 680400261` was checked
against that regenerated city: the spot is **56px clear of the nearest wall and
inside nothing at all**. A genuine collapse reads 0%, not 3%, and being cached
(`fogpoly 0.00ms`) it often does not log at all. Regenerate the seed and test
the coordinates before believing the line.

### Right-click, and the riot shield

**Right mouse is reported raw and resolved on the server**, the way E already
is at a door. The client used to own a `deploy` toggle; it now sends
`rightDown` and the server decides whether a press was a tap or a hold. One
button has to carry two actions and only the server knows which are available,
so the HUD is *told* what the bipod is doing (`deployWanted` on the wire)
rather than keeping its own copy and drifting out of step.

- **Tap**: bash if the shield is up, otherwise work the bipod. The shove is
  drawn: `bashUntil` on the server becomes `bashing` on the wire for
  `SHIELD_BASH_SHOW_MS`, and the client throws the shield arc forward, thickens
  it and puts three short motion lines ahead of it. Set whether or not anything
  was standing there — a bash into thin air costs the same stamina, so it had
  better look like it happened.
- **Hold** (`SHIELD_STOW_HOLD_MS`): sling the shield to your back, and back
  again. `rightSpent` latches it so it fires once per press.

**The shield's three charges go fast, and that is the mechanism, not a bug.**
Measured with a zombie glued to an officer's chest: it blocks exactly three
times, then `shieldUp` clears and `riotShield` is spliced out of the utility
slots — but all three are spent inside **1.2 seconds**, because the immunity
window after a block is only `KEVLAR_IMMUNE_MS`. That is the same shape of
problem the vest has, and the lever if it ever needs to last longer is a
shield-specific window rather than more charges.

The shield is **worn, not held**: it costs a utility slot like kevlar, goes up
the moment you pick it up, and stays where you put it while you get on with
your guns. It turns a grab away outright from whichever side it covers —
`SHIELD_FRONT_ARC` in front while up, `SHIELD_BACK_ARC` behind while slung —
spending one of `SHIELD_POINTS` and buying the same `KEVLAR_IMMUNE_MS` breather
the vest does. Being caught from the *other* side is the whole cost of it.

**The shield and the heavy MG cannot be carried together, and `collect` refuses
the second of the two.** Both want right-click, and the shield's claim doesn't
depend on what is in your hands, so there is no slot-scoped way out of it —
that was tried and doesn't survive "you can still use your guns". Refusing at
pickup means nothing downstream ever has to cope with both.

### The radio

**`backup.ts` is `heli.ts` with its feet on the ground.** Something comes in
from off the map, stops, puts people out, and the people are what matter. Two
differences: it has to arrive down a street, and it stays parked afterwards
instead of flying off — a vehicle on the corner is free scenery and a landmark
for where your backup came from.

**The handset is three calls and then it is gone, and they are not equal.** The
first sends the **van** and the SWAT team in it; the second and third send a
**patrol car** with two officers who have bolt action rifles. That is the whole
decision the item poses — the good call is the one you spend early, on the
wrong fight, because you had it.

- **A minute between calls** (`RADIO_COOLDOWN_MS`), and squeezing it before
  dispatch will talk to you again gets `RADIO_STATIC_LINE` back in the same
  jagged bubble a real reply comes in. It is coming out of the same handset on
  your own hip, and without it pressing the button during the wait does
  nothing whatsoever as far as the player can tell — which is the exact
  problem the reply bubble was added to fix in the first place.
- **The radio remembers, and it remembers on the floor.** `radioUses` and
  `radioReadyAt` ride the *pickup* through a drop, like a gun's rounds do, so a
  radio you find may have had its van spent by whoever left it — and dropping
  your own is neither a way to get that call back nor a way to skip the minute.
  Every other bundle (`grenades`, `mines`, `cureDoses`) is zeroed on drop; this
  one deliberately is not.
- **It is worked by hand, not by picking it up.** It used to fire its one call
  the instant it was collected, which is no decision at all. It is a branch in
  `fireHeld` now, like the mine and the beacon.
- **The count and the minute are both on the slot bar** — the count where a
  bundle's is, the minute as a bar draining across the bottom of the cell. A
  number counting down reads as ammunition; the only question here is "can I
  press it yet", and a bar answers that without being read.

**The van comes in hot and stops like it, and the stop is a curve.** Straight
in at `VAN_APPROACH_SPEED`, then `VAN_BRAKE_DIST` out the brakes bite and it
washes `VAN_DRIFT` sideways while the back end comes round, and stops there. A
dead-straight approach with the body rotated at the end of it is not the shot
— the vehicle has to *travel* sideways.

Three things move at once and they are deliberately separate: how fast it is
going, how far off the line it has slid, and which way the body points.
`heading` is the approach line and never bends; the lateral offset is walked
along it as a smoothstep; `facing` is `heading + VAN_SLEW_ANGLE` scaled by that
same curve, and is what goes on the wire.

- **The easing is not cosmetic.** The drawn angle is the travel line plus the
  slew, so a curve still bending at the instant it stops would leave the van
  resting at some other angle than it does now. Flattening the sideways speed
  to nothing by the end is what keeps the final pose exactly as it was.
- **The drift direction is chosen and checked at call time.** It comes to rest
  offset from the spot `parkingSpot` validated, so the offset spot goes
  through `bodyFits` too — either side will do, and it falls back to arriving
  straight if neither fits.
- **Tyre marks follow the curve, not a chord.** The client walks the same
  smoothstep, so the rubber lies where the tyres were. `skidAngle` is on the
  wire for this: the marks lie along the *travel* line, which by then is not
  the body angle. Drawing them straight was fine while the path was and is
  plainly wrong now — the rubber would leave the road and rejoin it.
- **The tyres smoke while it slides**, thickest at the wheels and thinning back
  down the marks, and keep smoking for `TYRE_SMOKE_LINGER_MS` after it stops.
  Smoke that ends the instant the vehicle does reads as a switch being thrown.
  Client-side and hashed off the puff index, so it costs the wire one boolean
  and keeps no particle state but a single timestamp per skid.

The **car does none of it**. Two officers turning up is a smaller event than a
SWAT team arriving and should read as one — but it is **62×28** now rather than
the 46×22 it started at. Next to an 82×38 van it read as a toy, and two people
have to be able to get out of the thing. Its two doors swing open together, one
either side at the cabin, which is where `seatFor` puts the pair.

*The door's rotation is negated against the side it is on.* The leaf points in
-x, so swinging it outward on the +y flank takes a **negative** angle; signed
the other way it swings inward and gets drawn white on the white roof, which is
exactly as visible as not drawing it at all.

**The doors open, and they stay open.** The rear doors swing first and the team
comes out of them; the cab door swings and the driver comes out of that. The
door goes *before* the body — which is the right way round and also gives the
swing something to happen during. An emptied van standing on a corner with its
back doors hanging open is the whole story of what happened there, told to
anybody who arrives later.

**Who gets out of where is not decoration.** `stepDown` holds the side it was
given rather than using `findSpawnNear`, which scatters in a random direction
and had the team spread around the whole vehicle with the driver arriving
behind it. Measured: 4 out the back, 1 out the front.

#### A squad sweeps; it does not stand at your shoulder

The crew a call sends do **not** escort the caller any more. Four rifles stood
at your elbow are four rifles doing nothing; a squad walking the city is what
you actually asked for when you picked the handset up.

- **One leads and the rest keep station on him.** `squadSlot` 0 is the leader
  and `sweeps`; the others take a slot bearing off his *back* — off his facing,
  so the shape swings round with him at a corner instead of the squad crabbing
  sideways — through the same `escortId` branch everything else uses.
- **`SQUAD_SLACK` is what makes it loose.** Held only once they have drifted
  well off station, because correcting to an exact spot is a squad that
  marches. Measured, they settle 53-94px off the leader.
- **The leader does not give way to his own subordinates.** `resolveCollisions`
  splits an overlap evenly between any two bodies, which for a squad means the
  man setting the bearing is shoved off it by the four people whose only job is
  to follow that bearing — and since the formation is held off *his* facing,
  nudging him swings all of them after a heading nobody chose. `defersTo` in
  `world.ts` gives the follower the whole of the push instead. The shares still
  sum to 1, so the pair finish exactly `minDist` apart and only *who moved*
  changes; nothing about separation or the order of resolution moves with it.
  - **It is gated on `squadSlot > 0`, not on `escortId`.** That field does
    double duty — a grey officer sticking with whoever has a radio out carries
    it too — and that is a man tagging along rather than a man under orders. He
    keeps his half of the shove.
  - Measured on a staged pair overlapping by 10px: unrelated officers 5.00 /
    5.00 as before, a squad follower **0.00 / 10.00**, and a radio-escort back
    at 5.00 / 5.00 — so the narrower gate is doing the work rather than
    `escortId` alone. Live over three real 60s van sweeps the leader was in
    contact with only his own crew on 442 / 212 / 280 ticks and was moved by
    them on **0** of them.
  - *The first live measurement of this read 28 shoves and was the harness's
    fault, not the code's.* A leader stood against the van he came out of, or a
    wall, or the pond, is moved by that in the same pass — so "he was touching a
    follower and he moved" is not the same claim as "a follower moved him".
    Excluding geometry is what makes the zero mean anything.
- **The leader carries the pack and the vest.** A radio set drawn on his back
  with an aerial off it, so you can tell which of four identical black figures
  the other three are following, and `KEVLAR_POINTS` of real three-grab denial
  — losing the leader is how a sweep falls apart.
- **A squad that loses its leader promotes itself** rather than standing about
  waiting for a body that is now a zombie somewhere.
- **The sweep reads the danger field**, at `SQUAD_SWEEP_STANDOFF` — the same
  trick and the same reason as `botPatrolTarget`: the field already knows
  geodesically how far every cell is from the nearest zombie, so wanting to be
  near it costs one lookup per sample rather than a search. Streets only; a
  squad sweeping a city walks the roads.
- **The two out of a patrol car are the same machinery**, one leading and one
  in station, which is what keeps them near each other without a line of code
  about pairs.
- **They carry real guns with real rounds in them.** `SWAT_RIFLE_AMMO` (220)
  and `RIFLEMAN_RIFLE_AMMO` (90) sit in an ordinary gun slot, so `officerGrade`
  reads damage and reach off the item, the wire takes the shouldered-rifle
  profile off it, and running dry is the slot emptying rather than a flag.
  Generous, because a team that empties out in one street fight is not a team;
  finite, because a squad left sweeping for ten minutes should be spending
  something. **The last round puts the rifle away**: `activeSlot` goes to 0 the
  moment the magazine empties, which is what stops an empty rifle still being
  drawn at the shoulder while its owner fires a sidearm.
- **Dry means a sidearm, not a worse rifleman.** `DISPATCHED_PISTOL_*` — still
  a far better shot than the officer who was already on the corner, but a
  pistol's reach and rate.
- **`DISPATCHED_DAMAGE_MUL` (0.72) is on all of them.** They arrive in numbers,
  aim well and never stop shooting; at the rifle's paper damage one call
  cleared streets faster than you could walk down them.
- **They sweep at `SQUAD_PATROL_SPEED_MUL`** and **never go indoors.**
  `sweepTarget` only ever picks a spot in the street, but the router does not
  know a building is off limits — doors are not in the nav grid and the short
  line to somewhere often runs through a front room. So the veto is on the
  *step*, in `squadStep`, which is the only place that knows where the body
  actually ended up; a refusal also turns them, or they would press at a
  doorway for the rest of the round. Measured: **0.0-0.3%** of crew ticks spent
  inside a building.
- **The formation fans out rather than trailing.** Slots swing forward as they
  go out (`SQUAD_SLOT_ARC`), so the first pair sit off the leader's shoulders
  and the outer pair are genuinely *ahead* of him. A wedge behind put every one
  of them where he had already been and left him the only one who ever walked
  into anything. Measured: 125-160px off the leader, with 1 of 3 ahead of him.
- **The shape turns on its own bearing, not on the leader's aim.** `facing` is
  where he is *pointing*: it snaps onto a target the instant he sees one and
  snaps back when it dies, and taking the slots off it dragged every follower's
  post through an arc around him. `squadBearing` eases toward it at
  `SQUAD_BEARING_RATE` instead, so the formation swings round a corner and
  ignores him twitching. Measured: the leader's aim swings **1.98 rad/s** while
  the formation bearing swings **0.49** — a quarter as fast.
- **Station-keeping is latched and the pace is continuous.** One threshold made
  a follower step forward, land just inside it, stop, fall behind a pace later
  and step again; and two fixed speeds either side of `ESCORT_FAR` lurched them
  by two thirds at the line. They now close to `SQUAD_CLOSE_TO` of the slack
  once they have started, at a pace that scales with how far behind they are.
- **A post inside a building is drawn back toward the leader** until it is
  somewhere they could actually stand. Walking at one is what parks somebody in
  a doorway.

**Grey officers had no unstick at all, and a sweeping squad is what found it.**
`unstickTick` is what every bot and civilian runs to notice it is getting
nowhere; `updateNpcOfficer` never called it. It never showed while they pottered
round a patrol target a street away — a squad crossing the whole city walks into
geometry with somewhere to be on the far side of it constantly, and then leans
on it forever. That is what "stuck facing the door" was, and it is measured:
spells of over 2.5s in one spot went **9.50% → 0.28%** of crew ticks, and the
worst single stall **63.5s → 6.2s**.

- **Its breakout knows about walls and not about buildings**, so a squad's has
  to be checked like any other step. Letting it through unchecked was worse
  than the stall it fixed: crew spent **16%** of the round indoors. Reverted
  and the commitment dropped, the veto below picks a line along the frontage
  instead — **9.81% → 1.04%**.
- **A refusal commits to going round** for `SQUAD_AVOID_MS` rather than turning
  on the spot, or they re-aim through the same gap on the next tick and stand
  in it. That is the whole difference between "went round the building" and
  "stuck facing the door".
- **The driver stays with the van** (`guardX`/`guardY`, `VAN_GUARD_RADIUS`).
  Following a squad about is not a driver's job, and parked beside his own
  vehicle he is a sentry and a landmark at once. He is still in
  `world.dispatched`, so a passing radio holder can't rescan him off his post.

**It stops at the map edge and the crew walk the rest.** A van threading a city
to arrive at your shoulder is both a hard pathing problem and the wrong
picture; it pulls up at the cordon and they come the rest of the way on foot,
which is the bit worth watching.

**Two rules about where it may come in, and both are about the whole body.**

- **Never through a building.** `vanFits` tests the footprint — five points
  down its length by three across its width, `VAN_LANE_CLEARANCE` proud —
  against `buildingIndexAt` *and* the nav grid, and `laneClear` sweeps the same
  width down the whole run in from the edge. The old patrol car asked
  `nav.isBlocked` at one point, which an 82×38 body walks straight past: half
  of it can be in a shop while its centre stands in the street.
- **Never on the side the outbreak walked in from.** `world.outbreakSide` is
  recorded when the breach is placed and the van picks the nearest *other*
  edge. Backup arriving out of the breach is backup arriving through the
  horde, and it reads as the game putting your reinforcements in the worst
  place on the map on purpose.

It tries `VAN_LANE_OFFSETS` lanes either side of the one lined up with the
caller before giving an edge up — one building across your own line shouldn't
rule out a whole side of the map when the street beside it is wide open.

**The lane test has to start inside the perimeter.** The boundary wall is in
the wall grid, so a ray from an off-map entry point to anywhere at all crosses
it and `hasWallClearPath` says no. That rejected every candidate on every lane
and quietly dropped the old patrol car onto its unchecked fallback *every
single time* — which is why it used to park flush against the wall. Measured
over 40 cities after the fix: 40/40 arrived, **0** on the outbreak side, **0**
lanes through a building, **0** parked in one.

**The parked van is solid to bodies but not to sight or gunfire**, the same
trade the sandbags make and for the same reason: it is cover you shoot over.
It can't be destroyed.

**A *parked* vehicle goes into the nav grid; a driving one does not.** This
used to say "deliberately not in the nav grid — routes are planned as though it
weren't there and whoever walks into one deals with it", which is the sandbags'
rule inherited wholesale, and the reason for it does not carry over. A wall of
sandbags is *meant* to be stood at and torn down; a van cannot be destroyed, so
there is nothing on the far side of walking into one. What it produced was
reported as an officer moving *"like a roomba"* at a car — step into the body,
be pushed out by `resolveCircleBox`, re-aim at the same waypoint through it,
step in again. Measured with an officer given a post on the other side of a
parked van, **3 of 8** ever reached it; after, **12 of 12**, median 5.1s, and
the share of ticks spent pressed against the bodywork went 97% → 4%.

- **The nav grid alone changes nothing, and that is the part worth keeping.**
  `headingToward` only asks the router when `hasWallClearPath` says the straight
  line is blocked — and a van is not a wall. With the body in the grid and that
  shortcut untouched it was still **5 of 8** failing. `world.navBlockers` has
  two readers for exactly that reason: `rebuildNav` stamps the boxes so a route
  goes round, and `hasWallClearPath` refuses the straight line so a route is
  asked for at all. Doors already have this shape — in `hasWallClearPath`, out
  of the grid — and that one caller is the only thing in the game that asks
  about *walking*, which is why a van belongs in it and not in `wallGrid`.
- **It is a plain array of boxes on the World, not a reach into
  `world.vehicles`.** `world.ts` holds only a *type* import of `backup.ts`;
  reading the geometry back out would make that a runtime cycle.
- **Set on arrival, on the `navDirty` path a smashed pane already uses** — at
  most a handful of rebuilds a round. Measured over 120 arrivals, a parked body
  never cut the city in two: **0 pinched**, worst loss 0.09% of walkable ground.
- **`markBox` stamps a rotated rect**, because a van comes to rest across
  whatever bearing it drove in on. Snapping it to the compass would block a lane
  it is not in and leave a corner of it walkable.

**Nothing drives through a building any more, and the fix was to stop asking
the question that way.** `laneClear` used to answer yes-or-no about one chosen
spot, and a refusal had nowhere to go but a fallback — `parkingSpot` had two,
and **both picked a place the body *fitted* without ever asking whether it
could be *reached***. `laneReach` sweeps forward instead and reports how far it
can get, so `stopOnLane` cannot return a spot it could not have driven to and
there is nothing left to fall back to: it stops where it stops. Pulling up short
of a blocked street was always the right answer; the old code agreed and then
reached round its own rule to do it.

- **The braking curve is checked, not just the resting spot.** The last
  `VAN_BRAKE_DIST` washes `VAN_DRIFT` (52px) sideways and swings
  `VAN_SLEW_ANGLE` (24°) across — far outside the 15px of slack the lane sweep
  carries — so a clear lane says nothing about it. It was the last thing left
  putting a van through a shop.
- **`brakePose` is the one definition of that curve**, and `updateBackup` reads
  it too rather than integrating its own copy. Where the body sits and which way
  it points are a pure function of how much braking distance is left, so the
  check and the motion are provably the same; written twice they would agree
  until the day somebody tuned one of them.
- **The part of the slide still inside the cordon is deliberately not checked.**
  The brakes bite `VAN_BRAKE_DIST` out and the nearest a van ever parks is
  `BACKUP_PARK_MIN` in, so braking begins 92px *before* the body is clear of the
  boundary wall — which is the wall it is supposed to come through. Checked
  anyway, that wall refuses every slide on every call: measured, **0 of 50** vans
  kept their skid and every one arrived dead straight.
- **The breach side is a preference, not a safety rule.** All four sides are
  tried now — the ones away from the outbreak first, then the one it would
  rather avoid — because a lane it can actually drive down beats a side it
  likes. The last resort parks on the cordon itself, where by construction there
  is nothing to be inside of; measured at 0 uses in 120 calls.
- **`bodyFits` samples five by five, not five by three.** The gaps in a
  three-across sample are 34px at the van's clearance, wide enough for the corner
  of a building to sit between two of them: 1 arrival in 100 came to rest in
  geometry the coarser sample called a fit.

`server/vehiclecheck.ts` is the harness — headless, no socket, no port. Measured
over 120 arrivals with callers spread across the map, vans and cars alternating:
**0 parked with the body in geometry, 0 drove through one on the way, 0 cut the
map**, and **48 of 60 vans kept their skid**, refused only where it genuinely
would not fit.

*Two of those figures were the harness lying before they were ever the code
failing.* Counting from the map edge reports **16/16 driving through geometry**
whatever the code does, because the perimeter wall is in the wall grid and the
vehicle is meant to come through it — the cordon is not what it has to miss. And
clearing `world.vehicles` between staged calls without clearing
`world.navBlockers` leaves the nav grid holding the ghosts of earlier vans: that
read **5/80 parked in geometry**, all of it ghosts. A parked body lives in both,
so a rig has to clear both.

**The crew are SWAT, and every part of that is real rather than drawn.** Black
gear (`SWAT_COLOR`, with a lighter helmet or the head vanishes into the body),
a riot shield that is an actual `riotShield` on an actual inventory — so the
grab-denial in `updateZombie` and the band on the body in `toWire` both just
work — and `ITEMS.semiAutoRifle` passed to `fire` as its `def`, so their rounds
hit and carry exactly like the one a player can pick up. `SWAT_BLOOM_RAD`
(0.045) is tighter than the dropped soldiers' 0.07: these are the ones who came
when you asked. The trigger is slower than a player's semi-auto (620 against
470) so a four-man stack doesn't level a street before you have crossed it.

**Grey is one grade. `officerGrade` is all of the difference, and there are
only three tiers now** — the two that are *drawn* differently, plus everybody
else:

| | sight | bloom | cadence | gun | rounds |
|---|---|---|---|---|---|
| **any grey officer** — on the corner, the van's driver, out of a patrol car | 420 | 0.07 | 1100 | pistol | ∞ |
| **SWAT**, out of a van | 560 | 0.045 | 620 | semi-auto | 220 |
| **soldiers**, off a helicopter | 520 | 0.07 | 850 | semi-auto | 140 |
| either of those two, **dry** | as their tier | 0.07 | 900 | pistol | ∞ |

There used to be three grades of grey and **you could not tell them apart on
screen**, because they are all the same grey figure — the ambient one was
deliberately hopeless (0.22 bloom on a two-second trigger, a miss at any range
worth caring about) while the pair out of a patrol car carried bolt action
rifles. Grey is grey now: the officer's own pistol, at an accuracy worth
respecting. The patrol car's crew lost their rifles with it, and their bag is
emptied rather than left holding one — a rifle in the slot still puts a
shouldered rifle on the wire, which would be the drawing claiming something
`officerGrade` no longer does.

**The garrison is spread evenly, and it is deadly to a dog.** Both halves are
one idea: a dog that outruns everything will always find the quarter of the city
with nobody in it and start an outbreak there long before help can cross the
map.

- **`populate` lays the city's officers on a grid**, one to a cell, each sampled
  inside its own cell — and the cell list is **shuffled**, because there are
  more cells than officers and taken in order the empty ones are always the same
  corner. Measured as the furthest any spot on the map can be from the nearest
  officer: **1481px spread against 1831px random**, over five cities.
- **The count is what makes that mean anything**, so it went 4-7 → 10-14. At the
  old count the same measure was ~2200px on a map whose diagonal is 6200 — the
  spread was real and there was still always an empty quarter.
- **Only the officers the city started with** (`world.cityOfficers`) get the
  anti-dog rule: no bloom at all against one, and `CITY_OFFICER_DOG_DAMAGE_MUL`
  on top. Anyone a radio call sent afterwards is the response, not the
  deterrent, and shoots a dog like anything else.
- **That multiplier went 1.6 → 1.84, which is 15% more damage rather than 15
  points of multiplier.** It is the other half of pulling the dog's camera out
  to `DOG_CAMERA_ZOOM` 1.5 and the two should be read together: the camera hands
  the dog more warning of the garrison, so the garrison costs more when it is
  reached. Widening the view on its own is a straight buff to the seat that
  already wins every flat-out chase, and this is a rule about the *map* — the
  point of a deterrent is that walking into one hurts.

**Anybody a call sent carries a real gun and takes `DISPATCHED_DAMAGE_MUL`** —
a van, a patrol car or a helicopter off a smoke grenade alike. The tier decides
sight, bloom and cadence; the *bag* decides the weapon, so running dry is a slot
emptying rather than a flag, and the pistol fallback needs no case of its own.
Only the ambient officer standing on the corner has no bag and no multiplier.

Anybody the radio sent is a better shot than anybody who was already standing
there, which is most of the point of picking the handset up. Only SWAT and
soldiers carry a wire flag — riflemen and the driver are grey like any other
officer, and nothing about them needs drawing differently.

**`world.dispatched` is what keeps a standing order**, not `world.soldiers`.
Nobody in it has their `escortId` rescanned by `updateRadioCalls` — which is
what stops the next person to pick up a handset nearby from pulling a squad
off its sweep, or the driver off his van.

**The bubble and the crackle back are not decoration.** The van enters off-map
and is the best part of eight seconds away, so without them picking the radio
up does nothing at all as far as the player can tell. The reply is drawn as a
jagged bubble (`SpeechState.radio`) because a voice coming out of your own hip
must not read as somebody standing next to you.

**The lightbar was the best thing about the patrol car and is kept.** It goes
on flashing after the van parks, so an arrival you didn't watch still reads as
"backup came from over there" a minute later. On something this size there is
room for a proper bar across the roof with the halves alternating, grille
flashers on the opposite beat, and a wash of colour on the ground — which is
what stops it reading as a painted stripe.

**Two things use `escortId`, and the difference matters.** It means "stick with
this person", and it does duty both for a grey officer who has heard a radio in
somebody's hand — transient, and lost the moment they put it away — and for a
squad member keeping station on their leader, which is permanent. Anyone in
`world.dispatched` is exempt from the rescan, which is what keeps the second
kind from being overwritten by the first.

The escort branch sits **below** the officer's fighting and **above** its
patrol. An escort that breaks off a firefight to close the last twenty pixels
to your shoulder is worse than no escort at all.

### Everybody in a player slot starts with something

One random item in the bag of every **blue** officer — a player and a bot alike,
since they are the same figure in the same slot. The city's grey officers, the
SWAT out of a van and the soldiers off a helicopter get nothing.

- **It follows rarity, and `ALL_LOOT` is how.** `GUN_LOOT` and `UTILITY_LOOT`
  concatenated, so every entry in both weighted lists is one ticket and an item
  is exactly as likely as its share of all the loot in the game. Rolling a coin
  for gun-or-utility first and *then* an item was the obvious version and is
  wrong: it would make the rarest gun as likely as the rarest utility even
  though there are half again as many utilities spreading the same coin. Rarity
  0 stays out by construction, since neither table contains it — no grenade
  launcher, no second beacon.
- **It ignores the map's limits, deliberately.** `ITEM_CITY_CAP` is a ceiling on
  what is lying on the *floor* — the radio, where three vans in a round was the
  complaint — and this is not on the floor. It does not take a loot spot from a
  building either, nor satisfy the every-gun floor: both count placed pickups,
  and the pickup made here is collected on the line it is created and is gone
  before `spawnPickups` ever runs.
- **It is granted by collecting a real pickup rather than by writing into the
  bag**, which looks roundabout and is the only version that cannot rot.
  `collect` is where a duplicate gun becomes ammunition, a second pistol becomes
  `dual`, a sling or a pack becomes a worn flag, a lozenge is spent on the spot
  and the shield and the heavy MG refuse each other. Written out again, the
  first of those to change would quietly stop applying to whatever everybody
  starts the round holding.
- **A draw that cannot be taken is re-rolled**, the same as a capped one is in
  `spawnPickups`, and in practice that is exactly one item. `applyUtility`
  refuses an ammo box to anybody holding nothing but a pistol, and a bag at the
  start of a round is nothing but a pistol — so the ammo box is the one entry
  nobody can ever start with, measured over 20,000 draws. That is correct rather
  than a gap: a box of rounds for a gun you do not have is the one draw that
  would have been no draw at all. Without the re-roll it is 4% of officers
  starting empty-handed, which is indistinguishable from the feature not working.
- **Three spawn paths, one call**: `populate` for bots, `resetWorld`'s respawn
  loop for players on a restart, and `spawnPlayer` for somebody joining a round
  already under way.

`server/startkit.ts` is the harness. Measured over 4000 draws and 40 cities of
five bots each: **200/200 bots came away with something**, 0 draws came to
nothing, 0 rarity-0 items, 0 `loot-start-` pickups left on any map, 0 city caps
broken on the floor, and 23 of the 24 items in the table turned up. The observed
frequencies track the table: boltRifle **14.8%** against 14.1%, machineGun 13.8%
against 12.9%, shotgun 11.2% against 10.6%, sniper **1.2%** against 1.2%,
cureGun 1.1% against 1.2%.

*Two of those figures were the rig lying before they were ever the code*, and
both are about reading a bag:

- **`inv.guns[0]` is the first *lootable* slot, not the pistol.** The pistol is
  `activeSlot === 0` and lives outside the array entirely — see `heldItem`.
  Started at index 1 on the assumption that slot 0 was the sidearm, the rig read
  every gun draw as an empty bag: **38% of bots "got something"** and the
  distribution came back with no gun in it at all, which looks exactly like guns
  being refused.
- **Some items leave no slot behind, and one leaves two.** The riot shield sets
  `shield` *and* takes a utility slot, so counting both put it at 10.8% against
  a table share of 2.4%; the gunsling, the backpack and the rally lozenge are
  worn or spent and leave nothing in `utilities` at all, so a bot that drew one
  read as a bot that drew nothing — 12.5% of them. "Did anything land in this
  bag" is a comparison against a bag that was never given anything, plus a
  separate look at the rally charge, and the *distribution* is read off what
  `giveStartingItem` says it granted rather than inferred from the bag at all.

### The binoculars run on being carried

Same trade as the tracker, the goggles and the beacon handset: **the slot is the
cost.** Held, they were something you took out, looked through and put away —
and the one moment you most want to see further is the one moment you least want
to be holding a pair of binoculars instead of a rifle.

- **What being carried buys is a wider circle in every direction**, not a longer
  look down one bearing. `sightRadiusFor` reads `inv.utilities` rather than
  `heldItem`, so it is `BINOCULAR_SIGHT_RADIUS` all round, all the time.
- **The camera push still needs them in hand**, and that is now the whole of
  what "looking down them" means. `scopeReach` is untouched.
- **Both ends had to move together.** The client's `baseSightRadius` reads the
  same bag, because a fog hole narrower than what the server populates wastes
  the item entirely and one wider than it lights ground with nothing on it. That
  second failure is invisible — an empty street rather than an error — and it is
  the third time this file has had to record it, after the sniper's radius and
  the binoculars' own.

### The tracker runs on being carried

`zombieTracker` used to need to be in your hand, and the cost of that was meant
to be the point — consulting it means not holding a gun. In practice it made the
item something you took out, read and put away, which is the opposite of what a
compass is for: a bearing to the nearest zombie is for knowing which way trouble
is *while you are doing something else*, and the one moment you most want it is
the one moment you least want to be holding it instead of a rifle. The slot it
takes is the cost now, the same trade thermal goggles and the beacon handset
already make.

- **The hole in the fog does not widen.** It is a bearing and nothing else, the
  same single number it always was; nothing about *where* anybody is comes down
  the wire for it. What changed is when the number is non-null.
- **The bot no longer takes it out to read it.** `botPatrolTarget` set
  `activeSlot` to the tracker's slot, which was right while the readout needed a
  hand and is a bot walking the city holding a compass the moment it does not —
  `senseThreats` finding something is what put a gun back in its hands, and that
  is a perception tick later than the zombie seeing it.
- Measured: null with no tracker in the bag, and the **same bearing** with one
  carried and a pistol in hand as with it held.

### Throwing a bolt is quick now

`DOOR_LOCK_MIN_MS`/`MAX` 1-2s → **0.5-1s**, `DOOR_NPC_UNLOCK_MS` 2s → **1s**,
`DOOR_PLAYER_LOCK_MS` 1.5s → **0.75s**, `DOOR_PLAYER_UNLOCK_MS` 1s → **0.5s**.
Opening and closing are untouched.

- **The bolt is the one bit of door work that should be quick.** Opening is a
  handle, a hinge and a body through the gap, and `DOOR_OPEN_MIN_MS` is a
  civilian fumbling at it in a panic — that slowness is the drama. A bolt is one
  movement of one hand, and everything waiting on it is waiting for nothing: a
  room full of people cannot get out while one of them takes two seconds over
  the lock, `doorBusyForOthers` holds the door against all of them for the whole
  of it, and nav plans routes as though the door were open, so the rest of the
  room walks into it meanwhile.
- **`DOOR_NPC_UNLOCK_MS` is the one that most wanted it.** It is what keeps a
  locked city from seizing up, and at two seconds a bolted door was a two-second
  stop for every single person who wanted through it, one after another.
- **`TAP_MAX_MS` (220) is the floor the player's two cannot go under**, and it
  is nearer than it looks. The press arms the *hold* action and a release inside
  that window performs the tap instead, so a hold short enough to be mistaken
  for a tap is a control that does the wrong thing under the fingers. At 500 there
  is 2.3x the tap window to get clear of.

### The utility belt

Most of these are passive: carrying one is the whole of using it, and the cost
is the slot. `combatBoots` (quicker, cheaper on the legs) · `backpack` (+2
utility slots) · `gunsling` (+1 gun slot) · `binoculars` (a wider circle in
every direction, on being carried — see **The binoculars run on being carried**
below) · `zombieTracker` (an arrow orbiting you, pointing at the
nearest one; the only thing in the game that sees past the fog, and it runs on
being carried rather than held — see **The tracker runs on being carried**) ·
`grenade` (three to a bundle, counting down in one slot the way kevlar does,
thrown through the launcher's own shell).

**The tracker reaches the whole map.** `TRACKER_RANGE` is derived from the
city's diagonal rather than written down (it was 1600), so it cannot fall short
if the map grows. At 1600 the one tool that sees past the fog went blank in
exactly the situation it exists for — out in a quiet quarter with no idea which
way the outbreak is — and a compass that only works when you can nearly see the
thing is not a compass. It also matters for the *endgame*: victory is
`zombies === 0`, so the last few have to be hunted down across the whole city.

**A bot uses it too.** `botPatrolTarget` reads `nearestZombieBearing` and walks
down it, but *only* when no patrol sample found anything near — which is the one
case the danger field cannot cover. The field is sampled at fourteen points
inside `BOT_PATROL_MAX`, so once the nearest zombie is further off than that,
every sample reads the same maximum and the choice collapses to a random walk.
It used to set `activeSlot` to the tracker to consult it, exactly as a player
had to; carrying is enough now for both of them, so it keeps a gun in its hands
while it reads the bearing. Read on re-pick, never per tick —
`nearestZombieBearing` walks every entity.

**`zapMine` goes down where you stand.** It arms after `ZAP_ARM_MS` so you can
step off your own, then drops whatever crosses it for a full minute — the stun
is enormous because a mine is a one-shot you had to carry, place and walk away
from.

### The survivor beacon is a handset, not a mast

It is the one utility that is never consumed and never placed where you are
standing. Left-click with it in hand opens a **map of the city** and you pick
the spot; a helicopter brings one soldier in, he walks there, puts the mast up
and stays to hold it. Afterwards the same click opens the same map to tell you
**how many people have actually gathered at it**, which is the only readout in
the game for whether any of this is working.

- **One per city, always on the bank of the duck pond.** `rarity: 0` keeps it
  out of the loot tables by construction, and out of `rarestOf` and the
  every-utility floor as well, since both filter on rarity > 0 — so nothing can
  quietly place a second. It is a *third* placement on the bank and does not
  take the rare gun's spot or the rare utility's. The pond grew to match
  (`POND_MIN_RADIUS`/`MAX` 110/190 → 135/225): it is somewhere people are sent
  now, so it has to read as a place and have bank enough to stand a crowd on.
- **The map shows no NPC anywhere on it, by construction.** It is drawn from
  the `map` the client already had at `welcome` — walls, footprints, the park,
  the pond — plus your own position and the mast. Nothing about where anybody
  is comes down the wire for it, so it cannot become a wallhack later however
  it is extended. The muster is a **count**, never dots.
- **Dropping it costs you the map, not the beacon.** `inventory.beacon` is null
  without one in the bag, exactly as `selfInfected` is without a cure gun, so
  the answer never leaves the server. The mast stays standing and the Q wheel
  order keeps working — you have given away the ability to *look*.
- **The Q wheel is gated with no code in the wheel.** `world.towers` is only
  written when the soldier actually plants, so "GO TO THE BEACON!" simply is
  not offered while the team is still inbound. Measured: 0 towers before
  planting in every run.
- **The order has no range, and that is deliberate.** There is no
  `BEACON_CALL_RADIUS` and nothing that can refuse it for being too far off.
  `rallyHumans` reads the *shouter's* position for who hears it and the mast's
  for where they go, so the distance between the two was never the question.
  Gated on it, an officer who found a dozen survivors across the city could not
  send them anywhere — which is precisely the job the beacon exists to do, and
  it shouted "too far from the beacon to call it" while refusing. The wheel
  offers the order whenever a mast is standing (`beaconExists`), full stop.
- **Placing it takes two clicks, and the colour is the state.** One click puts
  a **grey** square down, a second locks it in, and right-click takes it back.
  Once called it goes **yellow** while the team is inbound, and **green** when
  the mast is up — one shape changing colour, so it reads as the same marker
  progressing rather than three different things. It is worth the extra click:
  there is one beacon per city and `requestBeacon` refuses a second, so a
  mis-click is a whole round's worth of mistake and nothing can undo it.
  `beaconPick` is purely client-side until the second click; `closeMinimap` is
  the only way out, so a marker can never outlive the map that owns it. Right
  click is also suppressed from the input payload while the map is up, or
  taking a marker back would plant a bipod out in the world behind it.
- **The wait is the cost of the decision.** `requestBeacon` refuses a second
  call and refuses ground nobody could stand on; everything else about it is
  the flight and the walk. Measured over four cities with a live outbreak:
  planted at 6-52s, 36-171px off the clicked spot.
- **A carrier lost on the way hands the call back.** There is one beacon in the
  city, so a soldier caught between the drop and the mast going up would
  otherwise take it out of the round permanently, with nothing on screen to
  explain why. `checkBeaconCarrier` clears the request. Once the mast is *up*
  it stops caring — the beacon is a place from then on and he is just its guard
  (`BEACON_GUARD_RADIUS`, through the same `guardX`/`guardY` the van's driver
  uses, with `guardRadius` now carried per-post since a driver stands at his
  door and a beacon guard has a muster to cover).
- **Bots call it in the same way and from anywhere**, and *early*. `beaconTick`
  costs a bot exactly what it costs a player — nothing but the choice, since
  the spot is picked off a map rather than walked to — so it sits inline above
  every branch that returns rather than waiting on a threat the way the radio
  does. Backup answers a fight that is happening; a muster point is somewhere
  to have sent people *before* one is, and a beacon called at the two-minute
  mark has missed most of the round it was meant to change. Measured: held
  back until something was in sight it went up at 48-136s; called inline, 0s.
- **Clear of the dead is a floor, not a thing to maximise.** Scored as
  "furthest from any zombie" — the obvious reading, and the reverse of
  `botPatrolTarget` — the beacon lands in whichever corner of the map is
  emptiest, which is also the corner with nobody in it and the longest walk
  from anywhere. Measured that way, 0-1 people at the mast. Past
  `BOT_BEACON_MIN_CLEARANCE` it takes the spot with the *most people near it*
  instead, less a mild pull toward the bot so the carrier is not sent across
  the whole city on foot.
- **And bots give the order, which is the half that fills it.** A mast nobody
  is sent to is scenery. `beaconShoutTick` works the Q wheel's "GO TO THE
  BEACON!" on exactly the player's terms — a mast standing anywhere in the city
  and a rally charge, which is spent. No range for either of them.
  - **Bots had no rally charges at all**, so every order costing one was
    refused before it was considered; `beaconShoutTick` could never have fired
    however good its judgement was. A bot stands in a player's slot, so it now
    starts with what that slot starts with — rally *and* follow.
  - **The judgement is what a player supplies by eye.** One charge, and
    shouting it down an empty street throws away the only thing that turns a
    mast into a muster. It counts who would actually *move* — in earshot, not
    already walking there, not already stood at it — and holds the charge below
    `BOT_BEACON_SHOUT_MIN`.
  - **It is a shout, not an errand**, so it is called inline above every
    branch that returns rather than as one of them. Nobody stops fighting,
    running or looting to give an order — the one exception is being *grabbed*,
    which is not a thing you give orders through.
  - **The mast has to be meaningfully safer than where the crowd is**
    (`BOT_BEACON_SAFER_BY`) and **the way there has to be survivable**
    (`BOT_BEACON_ROUTE_CLEARANCE`, read at the midpoint the way
    `escapeDestination` reads one). Sending people somewhere no safer spends
    the charge and moves the problem; somewhere worse is the charge doing harm.
  - **How picky it is depends on how many charges it has.** The last one has to
    count, so it waits for a real crowd; with several in hand a handful of
    people is worth moving now rather than hoarding an order for a better
    moment that may not come.
  - Measured over three 2-minute runs: 1-2 shouts, **27/60/36** civilians sent,
    and 8-27 stood at the mast at the end where a mast with no order behind it
    drew 0.
- **Which made the lozenge matter, and bots had no branch for it at all.** It
  is the only renewable source of rally charges, and it is *consumed* on pickup
  — `applyUtility` returns `used` — so it costs no slot and there is no reason
  ever to refuse one. Without it the orders that cost a charge were something a
  bot could do exactly once a round.
  - **It is scored alongside the sling and the pack rather than alongside
    boots**, because it shares the thing that makes those worth stopping for:
    it is free. At 44 it lost to every gun inside `BOT_LOOT_RANGE` and measured
    **0 taken** across four cities that had 2-4 lying in them. At 62 — and 80
    with a mast standing and nothing left to shout with — the whole chain
    moves: lozenges taken 0/0/0/0 → **2/0/3/1**, peak charges 1 → 3, and at the
    mast **3-7 → 6-45**.

Two bugs came out of building it, and the first is not about beacons at all:

- **Every freshly spawned entity was declared stuck on its first tick.**
  `lastUnstickCheck` started at 0, so the first `unstickTick` always fired,
  always measured zero progress — the state was made this tick and had not
  moved — and committed `UNSTICK_COMMIT_MS` of blind breakout before the entity
  had taken a step. It is invisible on anything that spawns with nowhere
  particular to be, and fatal to anything that spawns *with an errand*: the
  carrier was put down 80px from his spot and walked steadily away from it,
  because the breakout owns the tick and knows nothing about the goal. Fixed at
  source, in `newAiState`.
- **"There" was never a pixel.** At `BEACON_PLANT_REACH` 34 he would close to
  sixty-odd pixels, fail to shave the last of it off against a kerb, get shoved
  back out by `unstickTick`, and come round again — forever. 80 now, and
  `BEACON_PLANT_GIVE_UP_MS` puts the mast up where he stands if he still cannot
  get there. Better a mast in the wrong place, which you can see on the map,
  than the round's only muster point never existing.

**The wheel's hit test has to be told how many options are on screen.** It read
a fixed count off a module-level `WHEEL_OPTIONS` while `drawWheel` used the
live list, so the moment a third option appeared it was drawn and then could
never be clicked — the arithmetic still divided the circle in two. Anything
added to the wheel needs the count threaded, not just the label.

**A stun is folded into the frozen set.** `computeFrozen` already returns the
ids `updateAi` skips, so adding the stunned there is what keeps the mine from
needing a mention in twenty branches — a dropped zombie moves nowhere and
grabs nobody without any of them checking for it.

**Thermal goggles are the one hole in server-enforced fog**, and it is kept as
narrow as it can be and still work: **zombies only**, inside `THERMAL_RANGE`,
and **only for ones you cannot already see** — a zombie in plain view is sent
normally and drawn normally. They are **worn, not held**: goggles on your head
work whatever is in your hands.

The contacts are drawn in their own pass **after the fog**, not with the other
bodies. That ordering is the whole thing — put them in the entity pass and the
fog lays over them and dims the one readout you bought the goggles for. A
wallhack for survivors or loot stays impossible by construction.

**Bots get the same thing through `senseThreats` — but awareness only.** A heat
contact goes into `threatPoints`, which drives bolting, the safest heading and
where they choose to stand. It is deliberately kept *out* of `nearest`, which
becomes `targetId` and is what a bot aims and fires along. Let one through and
a bot stands in a corridor emptying a magazine into the wall the zombie is
behind — knowing where something is and having a shot at it are different
things, and that split is the line between them.

Measured with a zombie 120px through a wall and goggles on: aware of it every
tick, the firing target on **0 of 240**, zero rounds fired.

**A cure works on anyone still on their feet, not just civilians.**
`fireSpecial` filtered candidates on `type === 'human'`, so an infected
*officer* — grey, bot or player — was skipped entirely and the dose passed
straight through the one person you most wanted to save. Both the candidate
test and the effect now read `!== 'zombie'`; only an actual zombie needs
`cure()` rather than simply dropping the pending infection.

**The charge rifle is the one gun that can shoot the infected.** Every other
round passes through the living. At any wind-up it will drop somebody already
bitten (`world.pendingInfections`), and healthy bystanders are still ignored,
so it is a decision rather than a hazard. Its top bar hits properly hard now —
`CHARGE_TOP_MUL`, where the fourth bar used to be exactly the paper damage, so
a full wind-up bought only the pierce. Measured per bar: 15 / 40 / 65 / 90, and
one full-charge round kills an infected civilian.

It sits at **rarity 5** rather than 1, alongside the semi-auto. Its one unique
job has to come up often enough to be worth learning, and at rarity 1 most
rounds never presented it. A bot carrying one can also *see* who is infected —
see **A charge rifle is how a bot sees the infected** under Bot officers.

**"Go to the beacon" has no range on it at all.** It went through two wrong
answers first, and both are worth not repeating: gated on a mast existing
*anywhere* the server still refused it beyond `BEACON_CALL_RADIUS`, so the
order silently did nothing; gated on earshot, the option vanished off the wheel
whenever you were not stood next to the mast, which is indistinguishable from
never having called one. Both were solving a problem that should not exist —
you shout at the people around **you** and point them at a fixed place the
whole city knows about, so the distance to it is not a question anybody needs
to ask. `BEACON_CALL_RADIUS` and `BEACON_TOO_FAR_LINE` are gone. Measured, 31
civilians sent at once.

**The cure gun is the only thing that tells you about yourself.** `selfInfected`
is null on the wire unless one is in hand, so the answer isn't merely hidden by
the client — it never leaves the server.

## Not built yet

- Zombie master (the playable zombie) — `zombieMaster` type exists, unused
- Victory condition fires but has only been observed once, via a bot

The **tracker dart** is gone — the item, `world.trackedTargets`, the `'dart'`
shot kind and `TRACKER_DART_MS` with it. It marked a target for a hunt nothing
ever consumed, so it was a gun that took a slot and did nothing, and every bot
in the city was told to walk past it by name. Nothing else read the mark.

## How the user likes to work

- **A harness at the `server/` root is not typechecked, and it will lie to
  you.** `server/tsconfig.json` includes `src/**` only, so `npx tsc --noEmit`
  passes over every rig in this list, and `tsx` strips types without checking
  them. `roarcheck.ts` was staging a `GrappleSession` with **no `escapeAt`**
  after that field became the *only* way a grip ends in the victim's favour —
  `undefined` is never `>= now`, so no staged bite ever got away, and the check
  which proves the roar's tally counts bodies rather than bites had quietly
  stopped being able to fail. It read as 0 of 120 escaping; it is 12 of 120 now.
  Check one explicitly before trusting it:
  `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node roarcheck.ts`
- **Verify behaviour from a spectator socket**, not a player one — a player
  connection is fog-limited and gives misleading counts. `spectate` no longer
  restarts the round: resetting is gated behind `ALLOW_WORLD_RESET=1` now that
  the server is something you can expose to the internet, so a plain `spectate`
  just watches whatever is already running and is safe to point at a live game.
  `?spectate=new` and the bare `restart` message need the flag.
- **Two ways to test without touching his game**, and they cover almost
  everything:
  - *Headless.* Import `createWorld` and run the tick order above in a loop
    under `npx tsx`. No socket, no port, no disturbance. This is the right tool
    for anything about behaviour, and it can measure what a spectator can't.
  - *A second server.* `PORT=8090 npx tsx src/index.ts`, then open the client
    with `?server=8090`. That's the only way to exercise lobbies, chat, pausing
    and the front end, and it leaves 8080 alone. Add `ALLOW_WORLD_RESET=1` if
    the thing under test needs to reset the world.
- **Measure the thing you actually claim.** Two harnesses in this project
  reported nonsense before they were fixed: one counted civilians *standing
  still* beside a wall as "grinding into" it, and one picked a "clear lane"
  from the nav grid, which cheerfully contains shut doors. When a check fails,
  suspect the check first — twice now it has been the test, not the code.
- **Never compare tick cost across two separate `npx tsx` invocations.** This
  box is noisy enough that the *same code* measured 1.97ms and 4.37ms on two
  runs minutes apart, which read exactly like a change having doubled the cost.
  Two things are needed and both of them: gate the old behaviour behind an env
  var so both sides run in **one build**, and **alternate** them in one shell
  loop so a busy interval hits both. And report zombies alive alongside the
  cost — the map is not seeded, so how far the outbreak got dominates
  everything and a run with 180 zombies is not comparable to one with 40.
- **Put the bug back to prove the fix.** Gating old behaviour behind a
  temporary env var and running the same harness both ways turned "the grey
  officers look wrong" into "0 shots and 155° off target, versus 6 shots and
  under 10°". Delete the gate afterwards.
- **He usually has a server already running on 8080.** Don't kill it. Sending
  it `spectate` is safe now — it only watches unless `ALLOW_WORLD_RESET=1` was
  set on that server — but `restart` and `?spectate=new` would still take his
  round out from under him if it was. To check crowd
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

**Bump `GAME_VERSION` when shipping an update.** Patch for a fix or a tuning
pass, minor for a new mechanic or anything that changes how a round plays, major
when it is a different game. It is the `v0.0.5` on the menu, and it is the half
of the stamp a person can actually read.

**The rest of that stamp derives itself** — `shared/buildstamp.ts` shells out to
git for the short commit, the date, and a `*` when the tree is dirty. Vite bakes
the client's in at build time as `__BUILD__`; the server works its own out once
at startup and sends it in `welcome`. The menu prints one grey line while they
agree and goes amber with both when they do not, which across two machines
almost always means one of them did not pull.

- **A constant, not a git tag, and that was the decision.** Tags are the
  conventional answer and the wrong one here: they need their own
  `git push --tags`, so the box that forgot would report a stale version over
  perfectly current code — exactly the failure the stamp exists to catch. A
  constant travels inside the commit that changed it.
- **The hash is not redundant with the version.** The version says which update
  you meant to be on; the hash says which code you are on, and only the hash
  notices uncommitted edits. Both machines can read `v0.0.5` and be running
  different code.
- **A running dev server shows a stale stamp, and this is the sharp edge.**
  `__BUILD__` is a Vite `define`, evaluated once when the config is loaded —
  which is when the dev server *starts*. Editing source, pulling, or committing
  does not re-run it, and HMR will happily hot-reload new code underneath a stamp
  still reporting the commit that was checked out when Vite came up. **Restart
  Vite to refresh it.** Only `vite.config.ts` changing reloads the config on its
  own.
  - Worth knowing because the failure is the exact inverse of the feature:
    somebody pulls, sees the old hash on the menu, and concludes the pull did not
    take. It did; the stamp is stale.
  - **Production is unaffected**, which is the case that matters — `Host Online
    .bat` builds the client fresh, so the stamp is derived at build time and is
    always right for anything anybody else connects to.
  - It is fixable with a small Vite plugin that recomputes the stamp and serves
    it as a virtual module, and that was deliberately not built: it is real
    machinery for a dev-only convenience, where restarting Vite is free.

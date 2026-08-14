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
emplacements → interactions → shooting → air support → squad cars → ducks → fires →
per-viewer serialise. The whole block is skipped while `world.paused`, but
snapshots still go out.

Server modules and what each owns:
- `world.ts` — World state container, entity/AI state, collision, spawning, `toWire`
- `ai.ts` — all NPC behaviour (humans, zombies, NPC officers)
- `mapgen.ts` — procedural city; returns walls, windows, bushes, buildings, doors.
  Also guarantees every indoor space can be reached from the street. Ground is
  claimed in order — park, corner complex, big buildings, edge buildings, then
  ordinary blocks yield to all of it — so anything that must get its spot goes
  early
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
- `lobby.ts` — the rooms people wait in: create/join/sit/chat, and the browse
  list. Nobody has an entity until their lobby starts a round
- `emplacement.ts` — the pocket gunner: its crew, its sandbags, its arc
- `fire.ts` — the flamethrower stream, burning ground, and who is alight
- `inventory.ts` — loot spawning, slots, pickup/drop
- `heli.ts` — thrown/launched charges, smoke → helicopter → soldiers, blasts
- `police.ts` — the radio's answer: a squad car in off the map, and its crew
- `mines.ts` — zap mines on the ground, and who they have dropped
- `ducks.ts` — the flock on the pond
- `spatial.ts` / `geometry.ts` — uniform grid broadphase, math primitives
- `shared/pond.ts` — the pond's radius-per-bearing, read by nav, collision and
  the client's drawing alike

### The front end

`client/src/menu.ts` owns the whole shell — title, gamertag, offline, create and
browse — and knows nothing about the game. It holds **no lobby state either**:
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

A lobby slot is `closed | open | bot | player`. Clicking a **row** seats you in
it (leaving `open` behind you, and taking a bot's place if it had one);
clicking its **tag** cycles closed/open/bot. Two controls, because one click
can't both move you and cycle the thing you're moving into. Clicking the row
you are *already* in benches you. `START GAME` sends nothing but the command —
the server owns the layout, counts `bot` officer slots into
`world.botOfficerCount`, and `populate` reads it. The gamertag lives in
`localStorage`, prefilled and pre-selected.

**Spectating is a lobby state, not a URL.** A spectator holds no seat and gets
no entity; `startLobby` puts them into `world.spectators` *after* `resetWorld`,
which clears it. Start refuses only when there'd be no officers at all — a
round of nothing but bots is the whole point of watching one. `?spectate` still
exists for headless work and bypasses the front end entirely.

**PLAY OFFLINE is the same lobby with `offline: true`**, which is why it needed
almost no code: never listed in `summaries`, no chat, seats cycle closed→bot
only, and a vacated seat goes back to `closed` rather than `open`. The one
thing it genuinely needed was `notice` — with no chat box drawn, a refusal from
START had nowhere to be read.

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
plainly getting away.

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
stranger in, which most people would not.

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
- **The path needs no nav or collision work.** Bushes slow you down, so a clear
  line through a thicket is the quick way through without any rule saying so.
  It is drawn under everything as ground, one stroked polyline with a wider
  faint pass beneath for the soft edge.

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
- **Bots carry the belt too.** They value the radio highest (four better-aiming
  officers who then stay with them), then the sling and pack — worn, so free —
  then thermal, frags, mines and boots. A frag only goes at a cluster of
  `BOT_FRAG_MIN_TARGETS`, because a bot spending its last one on a straggler
  has nothing left when the street fills; a mine is only laid while `bolting`,
  since it is a thing you retreat over rather than a weapon.
- **Bots walk past the riot shield** (`BOT_IGNORES`). It already scored zero,
  having no damage figure; the set says so out loud so giving it one later
  doesn't send every bot after one.

### The pocket gunner

A utility that puts down a grey officer behind a machine gun and a wall of
sandbags, facing whichever way you were. `server/src/emplacement.ts` owns it.

- **The officer is an ordinary NPC entity.** It collides, it can be grabbed, it
  draws like any other. The emplacement record holds only what makes it a gun
  crew — which is why running dry needs nothing but deleting the record: what's
  left is already a grey officer with a pistol.
- **The bags are see-through and bullets go over them.** They are not in
  `hasLineOfSight` or in `fire`, only in collision — and, like doors,
  deliberately **not in the nav grid**: routes are planned as though they
  weren't there and whoever walks into one deals with it, which is what makes
  zombies stand and tear at them instead of strolling round.
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

**The camera pans with the cursor, and this is not a scope feature.** It exists
because the viewport is 960×600: without it you are aware of 480px of street to
either side and only 300px above and below. `CAMERA_PAN_X` (60) is the small
sideways one — there is no awareness to win there, it is just the camera
answering the mouse — and `CAMERA_PAN_Y` is **derived** as
`CAMERA_PAN_X + (VIEWPORT_WIDTH - VIEWPORT_HEIGHT) / 2`, so it carries the
180px difference between the two axes on top. Both then reach the same
distance: 540 with nothing in hand, 970 down a scope. Derived rather than
written down so the two cannot drift apart if either the pan or the viewport
changes.

That is what pushed `PLAYER_SIGHT_RADIUS` from 640 to 760: the far corner of a
panned screen is 727 from the officer, and a client lighting ground the server
never sent entities for is the exact bug that constant exists to prevent.

Fog cost with the pan in, measured over 200 spots: hip fire **0.62ms** median
(still under the 0.87ms it was before any of this, because of the clip below),
binoculars 1.98ms, a scope 2.93ms median / 7.5ms worst. The worst case is only
paid while a scope is actually in hand and only on a rebuild (12.5Hz). If it
ever needs trimming the knobs are `SCOPE_PUSH` and `CAMERA_PAN_X`.

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

**Civilians cannot be burned to death, by construction.** `ignite` caps them at
`HUMAN_BURN_MS` (700ms) rather than extending, they take
`HUMAN_BURN_DAMAGE_PER_SEC` (2) instead of 26, and `updateFires` clamps them at
`HUMAN_BURN_FLOOR`. All three are needed: the cap alone still lets a civilian
parked in a fire be re-lit every tick, and 2/s is still a kill given a minute.
Verified — two solid minutes stood in a fire leaves them on exactly 25hp and
alive. This is a rule about the game, not about fire: without it the
flamethrower is a tool for clearing a street of the people you are there to
save, and burning the uninfected is a cheaper way to stop an outbreak than
fighting it. Same shape as kevlar's absolute "can't be infected".

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
  `BOT_BOLT_DIST` (120) a bot *kites*: it backs off at `BOT_KITE_SPEED_MUL`
  (0.75) with the gun still up and the shot already fired that tick. Only
  inside that does it turn its back and run. The bolt distance came down from
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
  Opening a door they need through is untouched, and so is kicking a locked one
  down. Measured over two seeds: the only door action a bot performs is `kick`.
- **A bot opens a door instantly, the way a player does.** For a player,
  opening is a *tap* and a tap resolves the moment it is released; the 1.1-2s
  in `DOOR_OPEN_MIN_MS`/`MAX` is a civilian fumbling with a handle in a panic,
  which is not what an officer clearing a building is doing. `beginDoorWork`
  hands a bot a zero duration and `doorTick` finishes it in the same tick
  rather than surrendering one, or it still pauses at every doorway. Only
  opening: bolting a door and kicking one down are deliberate acts and take a
  bot as long as anyone. Measured over two seeds, `bot:open` went from ~1.5s a
  door to never appearing as a spell at a handle at all.
- **A locked door is not a wall to an officer.** Where a civilian hammers and
  hopes, a bot kicks it off its hinges — but only from the side it can't simply
  unbolt, the same rule the player's own prompt follows. A door a *player*
  bolted (`playerLocked`) is still left standing: a bot is on that player's
  side and reroutes rather than undoing their work.
  The alert fires **after** the kick, the opposite of a slam — shutting a door
  blocks the very sight line the alert needs, so that has to go first; kicking
  one opens it, so waiting is what lets the room beyond hear it at all.
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

- **Everything expensive is budgeted or cached.** A\* is capped at
  `PATH_BUDGET_PER_TICK` (10) searches; AI perception runs at 10Hz staggered per
  entity, not per tick; bush scanning and refuge choice are cached per entity.
- **The danger field is the scaling primitive.** One BFS from all zombies at 6Hz
  serves every human in O(1). Prefer adding to it over per-entity searches.
  The **room map** is the second one, and the same trick: build the answer once
  for everybody rather than letting each entity go and look. `RoomMap` costs
  1-8ms alongside `generateMap`, once per round, and occupancy is two counters
  folded into the survivor walk the tick was already paying for.
- The city is **5000×3700** with `HUMAN_COUNT` 500, which works out very
  slightly *denser* than the 4600×3400 / 400 it grew from. Measured after the
  change, three seeds at 120s: 195/91/63 zombies, in line with what the same
  seeds produced before, so the outbreak still takes hold at the larger size.
  `generateMap` went ~7ms → ~17ms, once per round.
- The headless harness — `updateAi` + collision + shooting, no fog and no
  per-viewer serialisation — measures **1.74ms median / 2.47ms p95 at 516
  entities** on the larger map. The older ~2.4ms/3.2ms figure quoted for a live
  server includes fog and serialisation and is not comparable to it.
- `generateMap` costs ~17ms, once per round. The connectivity repair pass builds
  a nav grid per iteration, so keep its iteration cap low.
- Client shows fps / tick ms / fog ms top-right. Watch it after AI changes.
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
- `PLAYER_ONE_SPAWN_AT_CENTER = true` — player one spawns mid-map, not on the outbreak
- `PLAYER_ONE_SHOT_KILL = false` — already off; set true to one-shot zombies

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

**`police.ts` is `heli.ts` with its feet on the ground.** Something comes in
from off the map, stops, puts people out, and the people are what matter. Two
differences: a car has to arrive down a street, and it stays parked afterwards
instead of flying off — a patrol car on the corner is free scenery and a
landmark for where your backup came from.

**It stops at the map edge and the crew walk the rest.** A squad car threading
a city to arrive at your shoulder is both a hard pathing problem and the wrong
picture; it pulls up at the cordon and they come the rest of the way on foot,
which is the bit worth watching. The spot is the first clear ground in from the
boundary along the bearing to the caller — measured **from the boundary**, not
from the off-map entry point, which is what had it clamped flush against the
perimeter wall.

**The parked car is solid to bodies but not to sight or gunfire**, the same
trade the sandbags make and for the same reason: it is cover you shoot over.
Deliberately not in the nav grid — routes are planned as though it weren't
there and whoever walks into one deals with it — and it can't be destroyed.

**The bubble and the crackle back are not decoration.** The car enters off-map
and is the best part of eight seconds away, so without them picking the radio
up does nothing at all as far as the player can tell. The reply is drawn as a
jagged bubble (`SpeechState.radio`) because a voice coming out of your own hip
must not read as somebody standing next to you.

**Two kinds of escort, and the difference matters.** `escortId` on an NPC
officer means "stick with this person". The crew a call dispatches keep theirs
for good and are added to `world.soldiers`, which already means *aims far
better* — exactly right for a unit sent to you. Grey officers already on the
street only get one while the radio is genuinely in your hand, and lose it when
you put it away.

The escort branch sits **below** the officer's fighting and **above** its
patrol. An escort that breaks off a firefight to close the last twenty pixels
to your shoulder is worse than no escort at all.

### The utility belt

Most of these are passive: carrying one is the whole of using it, and the cost
is the slot. `combatBoots` (quicker, cheaper on the legs) · `backpack` (+2
utility slots) · `gunsling` (+1 gun slot) · `binoculars` (pulls the camera back
like a scope, and widens `sightRadiusFor` to match — without both you'd be
looking at fog) · `zombieTracker` (an arrow orbiting you, pointing at the
nearest one; the only thing in the game that sees past the fog, which is why
it must be *in hand*) · `grenade` (three to a bundle, counting down in one slot
the way kevlar does, thrown through the launcher's own shell).

**The tracker reaches the whole map.** `TRACKER_RANGE` is derived from the
city's diagonal rather than written down (it was 1600), so it cannot fall short
if the map grows. At 1600 the one tool that sees past the fog went blank in
exactly the situation it exists for — out in a quiet quarter with no idea which
way the outbreak is — and a compass that only works when you can nearly see the
thing is not a compass. It also matters for the *endgame*: victory is
`zombies === 0`, so the last few have to be hunted down across the whole city.

**A bot uses it too, and pays the same price for it.** `botPatrolTarget` reads
`nearestZombieBearing` and walks down it, but *only* when no patrol sample
found anything near — which is the one case the danger field cannot cover. The
field is sampled at fourteen points inside `BOT_PATROL_MAX`, so once the
nearest zombie is further off than that, every sample reads the same maximum
and the choice collapses to a random walk. The bot holds the tracker to consult
it, exactly as a player must; that costs it nothing at the time because there
is nothing to shoot at, and the fight branch puts a gun back in its hands the
moment `senseThreats` finds something. Read on re-pick, never per tick —
`nearestZombieBearing` walks every entity.

**Three of them are placeables, and they all go down where you stand.**
`zapMine` arms after `ZAP_ARM_MS` so you can step off your own, then drops
whatever crosses it for a full minute — the stun is enormous because a mine is
a one-shot you had to carry, place and walk away from. `survivorBeacon` plants
a mast and frees its slot; the order pointing people at it lives on the Q wheel
afterwards, costs a rally charge like any other command, and can be repeated
from anywhere in earshot — the mast is a *place* rather than a spot you
clicked, which is what makes it worth carrying.

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

**"Go to the beacon" needs a mast in earshot, and now says so.** The wheel
offered the order whenever a mast existed *anywhere* while the server wants one
within `BEACON_CALL_RADIUS`, so out in the city you could pick it, watch
nothing happen, and not even be charged for it. `beaconInEarshot` gates the
option client-side and the server shouts `BEACON_TOO_FAR_LINE` rather than
dropping the message. In range it always worked: measured, 31 civilians sent at
once.

**The cure gun is the only thing that tells you about yourself.** `selfInfected`
is null on the wire unless one is in hand, so the answer isn't merely hidden by
the client — it never leaves the server.

## Not built yet

- **The zombie dog master.** Lobby team 2 has two dog slots and they work — you
  can sit in one, the server counts it and logs it — but there is no dog, so
  whoever took one spawns as an officer.
- Zombie master (the playable zombie) — `zombieMaster` type exists, unused
- Victory condition fires but has only been observed once, via a bot

The **tracker dart** is gone — the item, `world.trackedTargets`, the `'dart'`
shot kind and `TRACKER_DART_MS` with it. It marked a target for a hunt nothing
ever consumed, so it was a gun that took a slot and did nothing, and every bot
in the city was told to walk past it by name. Nothing else read the mark.

## How the user likes to work

- **Verify behaviour from a spectator socket**, not a player one — a player
  connection is fog-limited and gives misleading counts. Note that `spectate`
  restarts the round, so to observe a live game use two sockets (one player, one
  spectator) or read the global counters in the state message.
- **Two ways to test without touching his game**, and they cover almost
  everything:
  - *Headless.* Import `createWorld` and run the tick order above in a loop
    under `npx tsx`. No socket, no port, no disturbance. This is the right tool
    for anything about behaviour, and it can measure what a spectator can't.
  - *A second server.* `PORT=8090 npx tsx src/index.ts`, then open the client
    with `?server=8090`. That's the only way to exercise lobbies, chat, pausing
    and the front end, and it leaves 8080 alone.
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

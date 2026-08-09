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
emplacements → interactions → shooting → air support → ducks → fires →
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

Zombies roll two of their own: `smartZombie` decides how *well* one searches —
every zombie leaves an emptied room now, see **Rooms** below — and `freshUntil`
makes anything newly turned ignore doors entirely while there is prey about.

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
- **Every gun is in every city, derived from the registry.**
  `GUARANTEED_ITEMS` was a hand-kept list of the rare ones, so adding a gun and
  forgetting to list it produced maps that simply didn't have it.
  `GUARANTEE_EVERY_GUN` walks `ITEMS` instead — rarity 0 excluded, since those
  are placed by their own roll. Measured over five cities: ~29 pieces of loot
  in buildings, no gun missing in any of them.
- **A duplicate gun is ammunition, not a gun.** Picking up a second of
  something already in the bag strips it for its rounds rather than taking a
  slot — carrying two of the same is strictly worse than one loaded one, since
  you can only fire the one. Checked *ahead* of the free-slot case for that
  reason. Bots understand it through `lootWanted`, which scores a duplicate by
  how empty the copy they carry is (`BOT_REFILL_APPETITE`), so a bot with a
  full rifle ignores one and a bot down to its last few crosses the street.
- **Bots walk past the dart gun and the riot shield** (`BOT_IGNORES`). Both
  already scored zero, since neither has a damage figure; the set says so out
  loud so giving the dart one later doesn't send every bot after it.

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

**Drawing it is `drawFlameStream`, not three strokes.** Ruled lines read as a
laser sight. It is a row of `FLAME_BLOBS` overlapping circles along the throw,
fattest at the midpoint (6.6 → 15.7 → 3.4 px), lifted off the ground by
`FLAME_ARC_LIFT` on a sine so it rises and comes back down, with a flattened
black ellipse tracking it along the *unlifted* line — without the shadow the
lift reads as the stream being aimed off to one side rather than as height.
Every blob wobbles across the line so the edge is ragged.

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

- **Everything expensive is budgeted or cached.** A\* is capped at
  `PATH_BUDGET_PER_TICK` (10) searches; AI perception runs at 10Hz staggered per
  entity, not per tick; bush scanning and refuge choice are cached per entity.
- **The danger field is the scaling primitive.** One BFS from all zombies at 6Hz
  serves every human in O(1). Prefer adding to it over per-entity searches.
  The **room map** is the second one, and the same trick: build the answer once
  for everybody rather than letting each entity go and look. `RoomMap` costs
  1-8ms alongside `generateMap`, once per round, and occupancy is two counters
  folded into the survivor walk the tick was already paying for.
- Current cost: **~2.4ms median / 3.2ms p95 per 33.3ms tick at 411 entities.**
  A headless harness driving only `updateAi` + collision measures ~1.0ms median
  / 2.3ms p95 — not comparable to the figure above, which includes fog and
  per-viewer serialisation.
- `generateMap` costs ~7ms, once per round. The connectivity repair pass builds
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
- `TEST_DROP_ALL_ITEMS = true` — one of every item spawns around player one
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

## Not built yet

- **The zombie dog master.** Lobby team 2 has two dog slots and they work — you
  can sit in one, the server counts it and logs it — but there is no dog, so
  whoever took one spawns as an officer.
- Zombie master (the playable zombie) — `zombieMaster` type exists, unused
- Riot shield is collected and shown on the HUD but has **no effect**
- Tracker dart marks targets (`world.trackedTargets`) but nothing consumes it
- Victory condition fires but has only been observed once, via a bot

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

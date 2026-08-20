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

### A grab is about two seconds

`GRAPPLE_MIN_MS` 1s to `GRAPPLE_MAX_MS` 3s, rolled as the **average of two
randoms** rather than one. That makes it triangular: mode and mean both land on
2.0s and both ends are rare, where a flat roll over the same range gives the
same average while making a 1s scuffle and a 3s pin equally likely. A grab
wants a typical length you can learn. Sampled over 200k rolls: mean 2001ms,
median 2002ms, p10 1448, p90 2554, **3%** over 2.75s and nothing over 3s.

A vest is the exception and stays at `KEVLAR_GRAPPLE_MS` — half a second of
scuffle it loses, which is the point of wearing one.

### A joining zombie does not reset the grapple clock

`endsAt` is set **only inside `if (!session)`** in `updateZombie` — creating the
session. Everything after that is `session.zombieIds.add(e.id)`, so a second or
third zombie piling on inherits the deadline the first one set and cannot push
it back. Measured with a staged pile, on the older 1.0-2.2s window: the
deadline was +1805ms when the first grabbed and +1805ms after a second joined,
moved by **0ms**, and it resolved at +1833ms — one tick past, which is the 30Hz
granularity.

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
- **It comes in at the breach**, with the rest of the outbreak.

**The horde is its lives.** Shot down, the dog comes back **out of a shambler**:
one somewhere on the map stops being a shambler and stands up as the dog, at
that body's position, on full health. Run out of shamblers and the next death
is the end of it — no entity, out of the round, and the HUD says so.

**Dying is something you watch.** The body stays exactly where it fell for
`DOG_DEATH_MS`, greyed and sprawled, and only then does the animal rise
somewhere else — cutting straight to the new one gives being killed no weight
at all, you would simply find yourself elsewhere. The screen holds on the body
for the first `DOG_FADE_FROM` of that window and then goes to black, and comes
back off it faster than it went. Measured: flagged dead for **2400ms of a
2400ms window**, then up on full health 1859px away with the horde one shorter.

- **The body it leaves is permanent.** `world.corpses` is never trimmed, so
  four deaths leave four bodies for the rest of the round — the only lasting
  mark the officers get for having killed one. Sent unfogged: a handful in a
  whole round, and a corpse should not blink out because you turned round.
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

**The dog's camera is pulled out to `DOG_CAMERA_ZOOM` (1.6), and it is a balance
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
  below 1.0 and hands the dog the whole street. 1.6 is the loosest zoom that
  clears it: 675 world px vertically, 337 at rest and **580 with the pan against
  SWAT's 560**.
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
scroll — is simply not drawn for a dog.

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
- **Running somewhere is not the same as running there in a straight line.**
  `escapeDestination` scores a bearing at its far end and at its midpoint on
  the danger field and *nothing in between*, and `headingToward` then routes
  around walls — which a body is not. So a zombie sixty pixels along the chosen
  line cost that line nothing and the bot sprinted into it with the whole
  street open beside it. `dodgeThreats` is the near field: the closest thing
  inside `BOT_DODGE_RANGE` that the running line points at, gone round on
  whichever side has more room, swinging wider the closer it is. It returns the
  heading **unchanged** when neither way round is walkable, which is exactly
  the cornered case — pressing on is right there. `skirtThreat` is the civilian
  version and reads only the one tracked threat, which for a bot is routinely
  not the one it is about to run into.
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
  on the road for forty. Every visible decal of a given age goes into **one
  path filled once** — four alpha bands for two hundred marks — which is the
  park's mistake avoided again, in red. `kind` gates it, so a cure and a flame
  draw none.
- **The vignette is one cached image.** Built at viewport size and blitted,
  under the HUD and over the fog, so it frames the world without dimming
  anything you have to read.

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
Deliberately not in the nav grid — routes are planned as though it weren't
there and whoever walks into one deals with it — and it can't be destroyed.

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

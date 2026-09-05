# Sound effects

The zombie recordings under `zombie/` are from
[Mixkit](https://mixkit.co/free-sound-effects/), under the
[Mixkit Sound Effects Free License](https://mixkit.co/license/):
royalty-free, no attribution required, usable in commercial projects.
Fetched from `assets.mixkit.co` on 2026-09-04.

| File | Source title |
|---|---|
| `zombie/groan-01-growl.mp3` | Zombie monster growl |
| `zombie/groan-02-creature-breath.mp3` | Terrifying Creature Breath |
| `zombie/groan-03-demon-breathing.mp3` | Creepy demon heavy breathing |
| `zombie/groan-04-breath.mp3` | Single zombie breath |
| `zombie/groan-05-gasp.mp3` | Gasping zombie |
| `zombie/groan-07-calm-growl.mp3` | Monster calm growl |
| `zombie/groan-08-male-growl.mp3` | Male sleep growl |
| `zombie/groan-09-monster-grunt.mp3` | Fantasy monster grunt |
| `zombie/groan-10-dying-pain.mp3` | Monster dying in pain |
| `zombie/attack-01-grunt.mp3` | Angry zombie grunting |
| `zombie/attack-02-roar.mp3` | Frightening zombie roar |
| `zombie/attack-04-growl.mp3` | Wild creature growl |
| `zombie/attack-06-screech.mp3` | Creature long screech |
| `zombie/attack-07-scream.mp3` | Monster creature scream |
| `zombie/attack-08-creature-roar.mp3` | Nasty criature roar |
| `zombie/attack-09-small-growl.mp3` | Small monster growl |
| `zombie/attack-10-pain-gasp.mp3` | Monster pain gasp |
| `zombie/attack-11-aggressive-gasp.mp3` | Monster aggressive gasp |
| `zombie/attack-12-snarl.mp3` | Monster aggressive snarl |
| `zombie/hit-01-pain.mp3` | Exclamation of pain from a zombie — played sometimes when a zombie takes a hit, not on the grapple/claw bark |
| `human/hiding-sob.mp3` | Creature sobbing in fear — repurposed for a person, not a zombie: it plays, sparingly, for someone genuinely hiding in a bush. Moved out of `zombie/` for that reason; same file, same source, same licence. |

Dropped: `groan-06-growl-short.mp3` ("Monster growl") — too high and
animal-sounding, read as a cat rather than a zombie. `zombie/attack-05-hurt.mp3`
("Creature cry of hurt") is also gone — it read too much like a person in pain
to sit in the zombie attack-bark pool.

## Weapons

The recordings under `weapons/` are from [Freesound](https://freesound.org/),
each one individually marked **Creative Commons 0** on its own page: "You can
copy, modify, distribute and perform the sound, even for commercial purposes,
all without the need of asking permission to the author." No attribution is
required by the licence, and it is written down here anyway, the same as the
Mixkit table above. Fetched (the public preview stream, not the login-gated
original master — same audio, a lower-bitrate encode of it) on 2026-09-04.

Mixkit was tried first, to keep sourcing all the sfx from one place, and its
own "gun"/"gunshot"/"weapon"/"pistol" categories turned out to hold nothing
that reads as an actual firearm — laser zaps, 8-bit blips, and foley like a
chamber spin or a handgun click, never a report. Freesound's library is far
larger and its per-upload CC0 tag is exact rather than a blanket site licence,
so each file below is checked individually rather than assumed from the
search filter.

| File | Source title | Author | Source |
|---|---|---|---|
| `weapons/pistol-01-makarov.mp3` | Makarov Shoot.wav | coolabc | [569174](https://freesound.org/people/coolabc/sounds/569174/) |
| `weapons/pistol-02-snappy.mp3` | Single Pistol Gunshot 3.3.wav | morganpurkis | [392229](https://freesound.org/people/morganpurkis/sounds/392229/) |
| `weapons/pistol-03-indoor.mp3` | Small pistol gunshot indoors | acidsnowflake | [402789](https://freesound.org/people/acidsnowflake/sounds/402789/) |
| `weapons/rifle-01-single.mp3` | Rifle gunshot, one shot | felix.blume | [710084](https://freesound.org/people/felix.blume/sounds/710084/) |
| `weapons/sniper-01-shot.mp3` | Sniper Shot | LeMudCrab | [163460](https://freesound.org/people/LeMudCrab/sounds/163460/) |
| `weapons/sniper-02-barrett.mp3` | Barrett M82A1 Sniper Shot from Wooden Platform Hanging from Metal Chains 6 | qubodup | [855597](https://freesound.org/people/qubodup/sounds/855597/) |
| `weapons/shotgun-01-blast.mp3` | shotgun shoot | MrGungus | [773873](https://freesound.org/people/MrGungus/sounds/773873/) |
| `weapons/mg-01-single.mp3` | Machine Gun 001 - single shot.ogg | pgi | [212601](https://freesound.org/people/pgi/sounds/212601/) |
| `weapons/mg-02-single.mp3` | Machine Gun 002 - single shot.ogg | pgi | [212607](https://freesound.org/people/pgi/sounds/212607/) |
| `weapons/heavymg-01-m240.mp3` | M240 Machine Gun Single Shot | qubodup | [854641](https://freesound.org/people/qubodup/sounds/854641/) |
| `weapons/heavymg-02-dshk.mp3` | dshk_01.wav (single empty shot of a DShK) | greatmganga | [122103](https://freesound.org/people/greatmganga/sounds/122103/) |

Grouped by weapon *family*, not by which gun in the registry fires them: the
bolt action, the semi-auto and the charge rifle all fire the same rifle round
and share `rifle-*`, exactly as `gunVoice` in `combat.ts` groups them
server-side. The flamethrower has no file here at all — it is a continuous
stream with its own established sound design (see `sprayFlame`), not a
discrete report, and the cure gun's beam isn't a gunshot either.

**Going forward, every sound this game gets should be sourced this way** —
found, checked for its own explicit licence, and written down here — rather
than left permanently synthesised. Synthesis stays only as the brief fallback
for whatever hasn't loaded yet (or the day a recording turns up for something
that still has none, such as the dog's roar, which has no real-world thing to
go and record).

# FOUNDRY — Tactical FPS

An original round-based tactical FPS in the Counter-Strike style: 5v5, you
plus four Guard bots defending bomb sites A and B against five Strike bots.
Short rounds, money and a buy menu between rounds, a plant/defuse objective,
and gunplay where accuracy beats speed. Single-player vs bots, in the browser.

## Run it

```sh
node serve.ts
```

Then open http://127.0.0.1:8080/ in desktop Chrome and click **CLICK TO PLAY**.
Any static file server works too — `game/` has no build step and the page
makes zero network requests once loaded. Requires Node 22+ for `serve.ts`
and `main.ts` (type stripping); the game itself needs only a browser.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look, click to shoot |
| R | Reload |
| Q / 1 / 2 / wheel | Switch weapon |
| G / 3 | Throw selected charge |
| 4 / 5 / 6 | Select frag / flash / smoke charge |
| Right click | Scope (LR-88 Marksman only) |
| Ctrl / C | Crouch (steadier aim) |
| Space | Jump |
| B | Buy menu (freeze time only) |
| E (hold) | Defuse the Furnace Core |

## How a round plays

Freeze time (6s, buy weapons/armor/charges/kit) → live round (100s). Strike
wins by eliminating Guard or detonating the planted Furnace Core; Guard wins
by eliminating Strike, holding until time expires, or defusing. Kills pay
$300, round wins $3250, losses $1400 rising with consecutive losses. First
to 7 rounds takes the match; if neither side reaches 7 after 12 rounds, the
side ahead wins, and a tied 6–6 is a draw.

The objective is the **Furnace Core**: a charge the Strike carrier plants at
Site A (Furnace) or Site B (Yard). A 40-second fuse starts on the plant.
Guard defuses in 5 seconds, or 2.5 seconds with a defuse kit ($400,
Guard-only, buyable in the buy menu).

## Features

- **Minimap** (top-left): map outline, site A/B labels, teammate dots,
  player arrow, and enemy dots only while an enemy was recently seen or
  heard — no wallhack. A location label names the area you are standing in.
- **Radio callouts**: named Guard bots call contact, rotations, plants, and
  defuses on real perception events.
- **Three charges**: Frag ($300), Flash ($200 — blinds facing agents briefly),
  Smoke ($250 — blocks sight for players and bots for 12s). Select with 4/5/6,
  throw with G/3.
- **Defuse kit**: halves defuse time; a HUD indicator shows when you hold one.
- **Match-end scoreboard**: per-player K/A/D, headshot %, damage, and cash,
  plus a round-over summary line.
- **Name tags**: teammates always; enemies only while visible and recently
  seen/heard, with a health bar.

## Layout

- `game/index.html` — page, HUD, import map (`three` → vendored build)
- `game/src/` — one single-job module per system:
  `config`, `math`, `state`, `collide`, `map`, `weapons`, `bots`, `rounds`,
  `audio`, `fx`, `hud`, `input`, `player`, `main`
- `game/vendor/three/` — three.js 0.187.0, vendored byte-for-byte from npm
- `screenshots/` — real in-browser renders
- `main.ts` — dossier builder entrypoint (copies `game/` + `screenshots/`,
  writes `dossier.json` via `vendor/makefun-threejs.ts`)
- `serve.ts` — local static server for play

## Tuning changes (v2 vs v1)

- Match format: first to 5 → first to 7, max 12 rounds, draw possible;
  match-end display lasts 8s.
- Team size: 3v3 → 5v5. Two extra spawns per team. New Guard roles
  holdMid/holdCon; new Strike roles push2/flank. Guard bots carry defuse
  kits from round 3.
- Grenade pool 6 → 8 slots (three charge kinds). Smoke pool: 4 clouds.
- Lighting/exposure brightened (exposure 1.35, hemisphere 1.05, sun 3.0,
  fog 48–130) and Strike suits brightened; amber/teal site colors unchanged.
- Economy unchanged. Gunplay and bot perception unchanged except flash
  blindness, smoke vision blocking, and shared seen/heard intel.

## Capture aid

`?debug=1` exposes a read-only `window.__foundry()` snapshot (positions,
phase, bomb state, radio lines) used by screenshot tooling. It is off by
default, returns a plain-object copy, and cannot change game state.

## Notes

- The simulation runs at a fixed 60 Hz step, kept apart from rendering; the
  renderer only mirrors the single state object.
- All art is procedural geometry and canvas textures; all sound is
  synthesized with WebAudio. No asset files, no fetches.
- Map, names, weapons, and sounds are original creations for this game.

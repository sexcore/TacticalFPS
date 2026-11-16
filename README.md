# FOUNDRY — Tactical FPS

An original round-based tactical FPS in the Counter-Strike style: 3v3, you
plus two Guard bots defending bomb sites A and B against three Strike bots.
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
| G / 3 | Throw frag charge |
| Right click | Scope (LR-88 Marksman only) |
| Ctrl / C | Crouch (steadier aim) |
| Space | Jump |
| B | Buy menu (freeze time only) |
| E (hold) | Defuse the charge |

## How a round plays

Freeze time (6s, buy weapons/armor/grenades) → live round (100s). Strike wins
by eliminating Guard or detonating the planted charge; Guard wins by
eliminating Strike, holding until time expires, or defusing. Kills pay $300,
round wins $3250, losses $1400 rising with consecutive losses. First to 5
rounds takes the match.

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

## Notes

- The simulation runs at a fixed 60 Hz step, kept apart from rendering; the
  renderer only mirrors the single state object.
- All art is procedural geometry and canvas textures; all sound is
  synthesized with WebAudio. No asset files, no fetches.
- Map, names, weapons, and sounds are original creations for this game.

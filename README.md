# AG-NC7-FoamArt-Fabric

**Sibling spike repo** — Fabric.js v7 custom-controls experiment.  
**Not** FoamArt Studio. Main product stays Three.js in `AG-NC7-FoamArt-Studio`.

## Purpose

Test Fabric v7 mouse precision and custom bbox controls (clone / delete) in isolation before any merge decision.

Implements JM / CRA checklist:

- `new Control({ ... })` for delete + clone
- `target.clone()` as **Promise** (v7)
- `renderIcon` with `util.degreesToRadians` + preloaded icon canvas
- Per-object `rect.controls.deleteControl` / `rect.controls.cloneControl`

## Run (AG Mini / MCM)

```bash
cd AG-NC7-FoamArt-Fabric
npm install
npm run dev
```

Open:

- http://localhost:3010
- http://100.64.95.27:3010 (Tailscale, if dev server bound to host)

## Test

1. Click **Add rectangle** (or use the auto-placed first rect)
2. Select the shape — green **+** (clone), red **×** (delete) above corners
3. Drag standard handles to resize — compare feel to [Fabric demo](https://fabricjs.com/demos/custom-controls/)
4. Clone should offset +10 px; delete removes object

## GitHub

Create empty repo `AG-NC7-FoamArt-Fabric` on GitHub when ready, then:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## Team

| Who | Role |
|-----|------|
| BK | Owner — says Go / save points |
| JM | Fabric v7 patterns & gotchas |
| CRA | Spike scaffold on MCM |

## Save game

Main Studio save point: commit `44aae16` on `AG-NC7-FoamArt-Studio` main (Three.js production path).

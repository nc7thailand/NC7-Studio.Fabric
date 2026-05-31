# NC7 Studio.Fabric — Cutover prep (Phase 7)

**Cutover rule (BK + JM):** Fabric replaces legacy Three.js Studio only after **100% parity** and **BK sign-off**.

Parity checklist in [README.md](README.md) is **✅ complete** as of Phase 6.

---

## Quick verify (5 min)

Dev server (Mac Mini):

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric
npm run dev
```

| Check | URL / action |
|-------|----------------|
| Canvas + demos | http://100.64.95.27:3010 |
| File → upload SVG | Object on bed, sidebar sync |
| Tools → Trace Image | PNG trace → auto-select (F-50) |
| Undo / Nest / F6 | Toolbar + keyboard |
| Dev Lab | Tools → Canvas Feature Lab |

Use **http://100.64.95.27:3010** from Air/phone (Tailscale). Port **3010** required — bare IP refuses.

---

## BK sign-off (when happy)

- [ ] Daily layout workflow feels OK on Fabric
- [ ] Trace Image quality acceptable vs legacy `/vectorizer`
- [ ] No blockers for CNC export path (loops / perimeter)
- [ ] JM reviewed Fabric v7 gotchas (if needed)
- [ ] **Go** or **Not yet** — BK decides cutover date

**Not yet?** Stay on legacy Studio (`AG-NC7-FoamArt-Studio` :3009). Fabric remains sibling spike until BK says go.

---

## GitHub save game (optional)

Repo is **local only** on Mini through Phase 6. To back up:

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric
# create repo NC7-Studio.Fabric on GitHub first, then:
git remote add origin git@github.com:YOUR_ORG/NC7-Studio.Fabric.git
git push -u origin main
```

Ask CRA: `[RUN] push fabric to github` when ready.

---

## Legacy Studio

**Do not delete** `AG-NC7-FoamArt-Studio` until cutover is live and BK confirms.

| Repo | Role | Port |
|------|------|------|
| `AG-NC7-FoamArt-Studio` | Production Three.js | 3009 |
| `NC7-Studio.Fabric` | Fabric engine (this repo) | 3010 |

---

## Known simplifications vs legacy (edit later OK)

- Vectorizer: single upload panel vs 3-step wizard; threshold + turd size only
- Auto-nest: row shelf packing, not full bin-packing with rotation
- Loop QA: Fabric path approximation, not full Three.js loop engine
- History: no drag coalescing on every pixel of move

These were accepted for v1 ship-first; polish can follow post-cutover.

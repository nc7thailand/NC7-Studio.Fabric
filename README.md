# NC7 Studio.Fabric

**NC7 Studio.Fabric** — Fabric.js engine sibling repo (**Choice A**).  
Legacy Three.js production app: `AG-NC7-FoamArt-Studio` (untouched).

**Cutover rule (BK + JM):** NC7 Studio.Fabric replaces Studio only at **100% feature parity** with legacy.

---

## Phase 7 — Cutover prep (current)

| Item | Status |
|------|--------|
| Parity checklist 100% | ✅ |
| [CUTOVER.md](CUTOVER.md) BK sign-off guide | ✅ |
| `.cursor/` Auto-review permissions | ✅ committed |
| GitHub push | ⬜ BK asks when ready |

---

## Phase 6 — V-01 potrace WASM vectorizer

```text
src/
├── components/
│   ├── StudioShell/          # Core UI layout & sidebar
│   ├── CanvasViewport/       # Fabric mount + scene bridge
│   └── DevLab/               # Feature Lab panel
├── modules/
│   ├── canvas/               # Module 1: Fabric.js canvas engine
│   ├── devlab/               # Module 2: Feature Lab toggles
│   ├── history/              # Global undo / redo
│   ├── svg/                  # SVG import helpers
│   └── vectorizer/           # Module 3: esm-potrace-wasm pipeline
│       └── VectorCore.ts
└── main.ts
```

### Phase 6 delivered

| Item | Status |
|------|--------|
| V-01 esm-potrace-wasm trace (PNG/JPG → SVG) | ✅ |
| Trace Image panel with threshold / turd size | ✅ |
| Progress status (tracing…, done, error) | ✅ |
| Import handoff + F-50 auto-select | ✅ |
| GlobalHistoryStack on trace import | ✅ |
| Dev Lab flag V-01 | ✅ |

### Phase 5 delivered

| Item | Status |
|------|--------|
| Clipboard F-04 / F-02 / F-06 (Cmd+C/V, multi-paste stepping) | ✅ |
| Duplicate F-01 (Cmd+D, +10 mm, green dot) | ✅ |
| Cycle focus F-12 (F6) | ✅ |
| Transform HUD + commit F-31 | ✅ |
| Import handoff F-50 (SVG auto-select) | ✅ |
| Dev Lab flags for clipboard, selection, F-31 | ✅ |

---

## Run

```bash
cd NC7-Studio.Fabric
npm install
npm run dev
```

- http://localhost:3010  
- http://100.64.95.27:3010 (Tailscale on MCM/Air when dev server running)

---

## Legacy Studio parity checklist

Track against **Three.js** `AG-NC7-FoamArt-Studio` (`canvasFeatureFlags.js`).

| ID | Feature | Legacy | NC7 Studio.Fabric |
|----|---------|--------|-------------------|
| **Core** |
| CORE-MOVE | Move object | ✅ | ✅ Fabric native |
| CORE-RESIZE | Resize handles | ✅ | ✅ Fabric native |
| CORE-SELECT | Single-click select | ✅ | ✅ |
| CORE-UNDO | Undo stack | ✅ | ✅ Phase 4 |
| CORE-NEST | Auto-nest | ✅ | ✅ Phase 4 |
| CORE-CLAMP | Margin clamp | ✅ | ✅ Phase 3 |
| **Clipboard** |
| F-04 | Deep clone safety | ✅ | ✅ Phase 5 |
| F-01 | Duplicate + offset | ✅ | ✅ Phase 5 |
| F-02 | Keyboard copy/paste | ✅ | ✅ Phase 5 |
| F-06 | Multi-paste stepping | ✅ | ✅ Phase 5 |
| **Selection** |
| F-10 | Deselect on empty canvas | ✅ | ✅ Fabric default |
| F-11 | Sidebar ↔ canvas sync | ✅ | ✅ Phase 2 |
| F-12 | Cycle focus (F6) | ✅ | ✅ Phase 5 |
| **Transform** |
| F-21 | Rotate handle | ✅ | ✅ Fabric mtr |
| F-22 | Bbox action dots | ✅ | ✅ |
| F-31 | Transform commit + HUD | ✅ | ✅ Phase 5 |
| F-32 | Redo | ✅ | ✅ Phase 4 |
| F-33 | 1:1 transform tracking | ✅ | ✅ native Fabric |
| **Display / CNC QA** |
| F-40 | Loop list | ✅ | ✅ Phase 4 |
| F-47 | Perimeter mm | ✅ | ✅ Phase 4 |
| F-53 | Loop count badge | ✅ | ✅ Phase 4 |
| **Handoff** |
| F-50 | Auto-select after import | ✅ | ✅ Phase 5/6 |
| V-01 | VectorCore pipeline | ✅ `/vectorizer` | ✅ Phase 6 WASM |
| **Studio shell** |
| Load SVG / demo file | ✅ | ✅ Phase 2 |
| Foam bed + margins visual | ✅ | ✅ Phase 2b/3 |
| Vectorizer → Studio route | ✅ | ✅ Trace Image panel |
| Feature Lab UI page | ✅ `/dev/canvas-features` | ✅ Dev Lab panel |
| Global history toolbar | ✅ | ✅ Phase 4 |

**Legend:** ✅ done · 🔶 partial · ⬜ not started

---

## Git / save game

| Repo | Role | Last known good |
|------|------|-----------------|
| `AG-NC7-FoamArt-Studio` | Production (Three.js) | GitHub `main` · `44aae16` |
| `NC7-Studio.Fabric` | Fabric engine (this repo) | local · Phase 7 |

**GitHub repo name (suggested):** `NC7-Studio.Fabric`

---

## Team

| Nickname | Role |
|----------|------|
| **BK** | Owner — Go / cutover decision |
| **JM** | Fabric v7 architecture & gotchas |
| **CRA** | Scaffold on MacBook Air M4 |

---

## Next phases (planned)

1. **Phase 2** — Dev Lab UI, sidebar object list sync, load SVG ✅
2. **Phase 3** — Foam bed margins, VectorCore port, vectorizer handoff ✅
3. **Phase 4** — Undo/history, auto-nest, CNC loop QA ✅
4. **Phase 5** — Clipboard, F-12, transform HUD, import handoff ✅
5. **Phase 6** — V-01 esm-potrace-wasm, vectorizer → canvas pipeline ✅
6. **Phase 7** — Cutover prep, CUTOVER.md, save game ✅
7. **Cutover** — BK sign-off → switch production when ready

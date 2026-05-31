# NC7 Studio.Fabric

**NC7 Studio.Fabric** — Fabric.js engine sibling repo (**Choice A**).  
Legacy Three.js production app: `AG-NC7-FoamArt-Studio` (untouched).

**Cutover rule (BK + JM):** NC7 Studio.Fabric replaces Studio only at **100% feature parity** with legacy.

---

## Phase 1 — modular architecture (current)

```text
src/
├── components/
│   └── StudioShell/          # Core UI layout & sidebar
├── modules/
│   ├── canvas/               # Module 1: Fabric.js canvas engine
│   │   ├── FabricCanvas.ts
│   │   └── controls/         # Custom delete / clone handles
│   ├── devlab/               # Module 2: Feature Lab toggles
│   │   └── LabOptions.ts
│   └── vectorizer/           # Module 3: Vector pipeline stub
│       └── VectorCore.ts
└── main.ts
```

### Phase 1 delivered

| Item | Status |
|------|--------|
| Studio shell (header, sidebar, toolbar, canvas bed) | ✅ |
| Fabric v7 canvas wrapper (`FabricCanvas`) | ✅ |
| Global action controls on `object:added` (F-22) | ✅ |
| Green clone (+10px, async `clone().then`) | ✅ |
| Red delete (`mouseUpHandler`) | ✅ |
| `renderIcon` + `degreesToRadians` | ✅ |
| Dev Lab state (`LabOptions.ts`, localStorage) | ✅ scaffold |
| Vectorizer entry (`VectorCore.ts`) | ✅ stub |
| TypeScript + Vite | ✅ |

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
| CORE-UNDO | Undo stack | ✅ | ⬜ Phase 2+ |
| CORE-NEST | Auto-nest | ✅ | ⬜ Phase 4+ |
| CORE-CLAMP | Margin clamp | ✅ | ✅ Phase 3 |
| **Clipboard** |
| F-04 | Deep clone safety | ✅ | ⬜ |
| F-01 | Duplicate + offset | ✅ | 🔶 +10px clone dot only |
| F-02 | Keyboard copy/paste | ✅ | ⬜ |
| F-06 | Multi-paste stepping | ✅ | ⬜ |
| **Selection** |
| F-10 | Deselect on empty canvas | ✅ | ✅ Fabric default |
| F-11 | Sidebar ↔ canvas sync | ✅ | ⬜ Phase 2 |
| F-12 | Cycle focus (F6) | ✅ | ⬜ |
| **Transform** |
| F-21 | Rotate handle | ✅ | 🔶 Fabric mtr (default) |
| F-22 | Bbox action dots | ✅ | ✅ |
| F-31 | Transform commit + HUD | ✅ | ⬜ |
| F-32 | Redo | ✅ | ⬜ |
| F-33 | 1:1 transform tracking | ✅ | ✅ native Fabric |
| **Display / CNC QA** |
| F-40 | Loop list | ✅ | ⬜ |
| F-47 | Perimeter mm | ✅ | ⬜ |
| F-53 | Loop count badge | ✅ | ⬜ |
| **Handoff** |
| F-50 | Auto-select after import | ✅ | 🔶 stub handoff |
| V-01 | VectorCore pipeline | ✅ `/vectorizer` | 🔶 Phase 3 stub UI |
| **Studio shell** |
| Load SVG / demo file | ✅ | ⬜ Phase 2 |
| Foam bed + margins visual | ✅ | ✅ Phase 2b/3 |
| Vectorizer → Studio route | ✅ | 🔶 Trace Image panel (stub) |
| Feature Lab UI page | ✅ `/dev/canvas-features` | ⬜ Phase 2 |
| Global history toolbar | ✅ | ⬜ Phase 2+ |

**Legend:** ✅ done · 🔶 partial · ⬜ not started

---

## Git / save game

| Repo | Role | Last known good |
|------|------|-----------------|
| `AG-NC7-FoamArt-Studio` | Production (Three.js) | GitHub `main` · `44aae16` |
| `NC7-Studio.Fabric` | Fabric engine (this repo) | local · Phase 3 |

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

1. **Phase 2** — Dev Lab UI, sidebar object list sync, load SVG  
2. **Phase 3** — Foam bed margins, VectorCore port, vectorizer handoff  
3. **Phase 4** — Undo/history, auto-nest, CNC loop QA  
4. **Cutover** — BK sign-off at checklist 100%

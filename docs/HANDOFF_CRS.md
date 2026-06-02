# HANDOFF: CRA → CRS (Cloud Remote Studio)

**Prepared by:** CRA (the writer) — desktop Cursor agent on Mac  
**For:** **CRS** — Cursor Cloud Agent (`cursor.com/agents`, phone / cloud)  
**Owner:** BK  
**Date:** June 2026  

BK is moving primary chat/planning to **CRS on cloud**. MacBook Air / local CRA rests. **Mac Mini (AGM)** remains dev host for `:3010` / `:3009`.

---

## 1. Repos and URLs

| Role | Local folder (Mac) | GitHub | Port |
|------|-------------------|--------|------|
| **This repo (coordination + legacy)** | `AG-NC7-FoamArt-Studio` | https://github.com/nc7thailand/AG-NC7-FoamArt-Studio | **3009** |
| **Fabric foam bed (main engine)** | `NC7-Studio.Fabric` | https://github.com/nc7thailand/NC7-Studio.Fabric | **3010** |

**BK rule:** Primary **coordination** and team docs live in **this repo**. Most **Fabric bed code** lives in the **sibling** `NC7-Studio.Fabric` repo. Read both when coding.

**Cursor sidebar naming (confusing but normal):**

- `ag-nc7-foamart-studio` + **no cloud icon** = local Mac session (CRA)
- `nc7-foam-art-studio` + **cloud icon** = cloud session (CRS)

Cloud agents use **GitHub**, not Tailscale IP `100.64.x.x`.

---

## 2. Git state (at handover)

### AG-NC7-FoamArt-Studio (this repo)

| Item | Value |
|------|--------|
| **Branch** | `main` |
| **Latest commit** | `a252995` — docs(TEAM): savepoint unified-open-svg-handoff baseline |
| **Tags** | `savepoint/traced-content-collection` (legacy :3009 handoff era) |
| **Remote** | `git@github.com:nc7thailand/AG-NC7-FoamArt-Studio.git` |

### NC7-Studio.Fabric (sibling — read for bed work)

| Item | Value |
|------|--------|
| **Branch** | `main` |
| **Current save point tag** | **`savepoint/unified-open-svg-handoff`** |
| **Tag commit** | `aeb5e12` — chore(savepoint): vectorizer Send uses Open SVG door |
| **Prior tags** | `savepoint/svg-group-import-bounds`, `savepoint/traced-content-collection` |
| **Remote** | `git@github.com:nc7thailand/NC7-Studio.Fabric.git` |

**Reset Fabric to save point:**

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric
git fetch origin --tags
git checkout savepoint/unified-open-svg-handoff
```

---

## 3. What works now (BK verified)

| Flow | Result |
|------|--------|
| Inkscape trace → **Menu → Open SVG** | Perfect on foam bed |
| Vectorcore trace → download → **Open SVG** | Perfect |
| Vectorcore trace → **Send to canvas** | Matches Open (same pipeline) |
| **Save canvas → Open** | Full bed scale, same loop count |
| Multiple objects on bed | Stack (no auto-clear), one group per file |
| Yellow selection bbox | Synced to cut paths after load |
| File panel | **Object list only** (upload removed on purpose) |

**Do not use sidebar upload** — removed; it used wrong import path and broke art.

---

## 4. What must NOT be changed without BK sign-off

- **Single import door:** Menu → **Open SVG** → `openSvgLayout()` in `NC7-Studio.Fabric`
- **Vectorizer Send** must call **`openSvgLayout`**, not `importSvg` (no 300 mm shrink, no `isolateTracedContentSvg` rebuild on Send)
- **No sidebar upload UI** in File panel
- **No auto-clear** on import (stack objects)
- **No per-path normalize experiments** that crashed load (reverted once; fragile)
- **Legacy :3009** vectorizer export contract: `<g id="traced_content">` paths only

---

## 5. Dev server and URLs

**Fabric (primary bed UI):**

```bash
cd ~/Documents/GitHub/NC7-Studio.Fabric
npm install
npm run dev
```

| Where | URL |
|-------|-----|
| Local | http://localhost:3010 |
| Tailscale (Mac Mini typical) | http://100.64.95.27:3010 (IP may change — check Tailscale) |

**Legacy vectorizer / FoamArt:**

```bash
cd ~/Documents/GitHub/AG-NC7-FoamArt-Studio
# Next.js dev — port 3009 (see package.json in repo)
```

| Where | URL |
|-------|-----|
| Local | http://localhost:3009/vectorizer |
| Embed in Fabric | http://localhost:3010/vectorcore → iframe :3009 |

**Cloud agents (CRS):** cannot run `:3010` locally. Use GitHub + docs; AGM runs dev on Mini when BK says `[RUN]` on Mac.

---

## 6. Important files (Fabric — NC7-Studio.Fabric)

| Path | Purpose |
|------|---------|
| `src/components/StudioShell/StudioShell.ts` | Shell UI, vectorizer handoff listener |
| `src/modules/canvas/FabricCanvas.ts` | `openSvgLayout`, `importVectorizerSvg` |
| `src/modules/svg/svgImport.ts` | Group import, `loadSvgLayoutAsGroup` |
| `src/modules/svg/importBoundsSync.ts` | Yellow bbox sync after load |
| `src/modules/svg/strayPathFilter.ts` | White-rect / outlier filter |
| `src/modules/vectorizer/vectorizerPause.ts` | `VECTORIZER_PAUSED` flag |
| `src/modules/vectorizer/pendingSvgHandoff.ts` | `NC7_PENDING_SVG` localStorage |
| `src/components/Sidebar/SidebarPanel.ts` | File panel (list only) |
| `CUTOVER.md`, `README.md` | Parity + cutover checklist |

**Legacy :3009 (this repo):**

| Path | Purpose |
|------|---------|
| `modules/vectorizer/VectorizerContainer.js` | Send to Studio, embed |
| `modules/vectorizer/lib/tracingEngine.js` | `generateSVG`, `#traced_content` |
| `TEAM.md` | People, save points, session modes |
| `AGENTS.md` | Agent rules pointer |

---

## 7. Known bugs / paused work

| Item | Status |
|------|--------|
| **Vector Linking module** | Not built — **next task** (see §8) |
| Loop 2 offset (bird) | Fixed by unified Open SVG door for Send; do not revert to `importSvg` handoff |
| Layout-preserving import (no per-path normalize) | Attempted → **crash**; reverted; needs careful redesign |
| `rawSvgPreview.ts` (Fabric) | Untracked orphan from buffer experiment — **do not commit** |
| `app/api/trace/`, `lib/` (this repo) | Untracked local experiments — **not pushed**; ask BK before commit |
| CUTOVER | Parity checklist done on paper; BK has not signed off production switch |

**Vectorizer pause:** `VECTORIZER_PAUSED` in Fabric `vectorizerPause.ts` — when `true`, trace UI off; Open SVG still works.

---

## 8. Next module: Vector Linking

**Reference:** abandonware **Vector Linker** (CNC Tools World) — hot-wire / styrofoam CAM. BK has VMware Win11 + screenshots + sample G-code.

**Purpose:** After art is on bed, **link cut paths** for the machine — not import/bbox.

**BK rules:**

1. One **START** point above the sheet  
2. **Auto-link** all shapes into one tour  
3. **Manual link** by clicking (edit order)  
4. **Out-and-back:** leave START → cut all linked vectors → return on **same path**  
5. **Simulate** cut path  
6. **G-code v1:** G1 only, steady feedrate (VectorLinker parity first)

**Pipeline:**

```
Trace / Open SVG  →  geometry on bed  ✅
Vector Linking    →  cut order        ⬜ NEXT
Export .tap/.nc   →  machine          ⬜
```

**Concept only until BK says `[RUN]` on Mac.**

---

## 9. Team and session modes

| Name | Role |
|------|------|
| **BK** | Owner, final decisions |
| **CRA** | Writer — desktop Mac agent (handed off to CRS for cloud) |
| **CRS** | Cloud Remote Studio — you, phone/cloud agent |
| **AGM** | Mac Mini — git, dev server, Docker |
| **JM** | Gemini — plans, diagnosis, letters |

| Signal | Meaning |
|--------|---------|
| `[chat on]` | Talk only, no code |
| `[RUN]` | OK to implement (prefer Mac/AGM for `:3010`) |
| `[hear]` | Short acks, latest message only |
| `[talk]` | Full replies again |
| `[sts]` | One step per message |
| `[undo]` | Revert one step at a time |

---

## 10. Instructions for CRS (cloud agent)

1. **Read this file first**, then `TEAM.md`, then Fabric `README.md` / `CUTOVER.md` on GitHub.  
2. **Default mode:** `[chat on]` — planning, JM drafts, Vector Linking concept.  
3. **Before claiming code state:** `git pull` on both repos; verify tag `savepoint/unified-open-svg-handoff` on Fabric.  
4. **Do not** reintroduce sidebar upload or `importSvg` handoff path.  
5. **Coding from cloud:** open PRs against `main`; BK/AGM reviews on Mac Mini.  
6. **Heavy `[RUN]`** (foam bed, VMware, G-code samples): tell BK to run on **Mac Mini with AGM/CRA**, or pull your PR locally.  
7. **When replying to BK:** attribute CRA’s prior work; you are continuation, not a reset.  
8. **Acknowledge startup:**

   > Cloud agent CRS ready — read `docs/HANDOFF_CRS.md`. Vector Linking concept mode; `[chat on]` unless BK says `[RUN]`.

---

## 11. Local-only / not on GitHub

| Item | Location | Action |
|------|----------|--------|
| `rawSvgPreview.ts` | NC7-Studio.Fabric (untracked) | Ignore or delete on Mac |
| `app/api/trace/`, `lib/` | AG-NC7-FoamArt-Studio (untracked) | BK to review before any commit |
| Tailscale IP | Network | Not in repo; use for browser only |
| VectorLinker install | BK VMware Win11 | Not in repo; screenshots/G-code when BK sends |
| Cursor local chat history | Mac Air | Not synced to cloud; this file replaces it |

---

## 12. CRA sign-off

Handover complete. All documented state is on GitHub after push of this file.

**Fabric save point:** `savepoint/unified-open-svg-handoff` @ `aeb5e12`  
**This repo handoff commit:** see `git log -1 docs/HANDOFF_CRS.md`

— CRA (the writer), for CRS

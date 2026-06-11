# Vector Linker — BK reference spec (from VMware / CNC Tools World)

**Status:** Source of truth for NC7 linker parity.  
**Audience:** BK, agents, implementers.  
**Reference app:** Vector Linker (abandonware, hot-wire / styrofoam CAM).

This document captures BK’s walkthrough (CRS relay chat, June 2026). Read this before changing linker logic.

---

## 1. What linker is

Linker runs **after** art is on the bed. It does **not** move layout geometry.

**Job:** Define how the hot wire travels:

- Where it **starts** (always visible blue dot)
- **Order** of cut segments via **links** between **nodes**
- **Direction** along each black path segment (`<` / `>`)
- **Simulation** of the linked tour only
- **Export** `.tap` G-code (G90, G1, steady feed)

**Not linker:** move drawing, resize, nest (NC7: exit Link with `<<` to edit layout).

---

## 2. Visual language (Vector Linker)

| Element | Meaning |
|--------|---------|
| **Black line** | Cut path (foam contour segment) |
| **Red dot** | **Node** (vertex on path). Hover → popup `X ###.### , Y ####.###` (absolute) |
| **Blue dot (top)** | **START** — always shown, even before any link |
| **Green line** | **Link** (through-foam connector between two nodes) |
| **Green → blue** | Link hovered |
| **`<` / `>`** | Cut direction on segment (zoom in to see; NC7 may use larger glyphs) |
| **Grey/magenta** | Unlinked geometry during simulation |

**Linked export:** One continuous tour — saved SVG is **one `<polyline>`** (all contours + connectors), not separate letter groups.

---

## 3. Coordinate systems

### Vector Linker G-code (ABC examples)

- `G90` `G21` (mm)
- `G1 F1000`, `M3 S1000` (heat/spindle on)
- **START / home:** `(0, 15)` — duplicated at open and close of tour
- **Cut area:** mostly **negative Y** (e.g. `Y-177`, `Y-7.88`)
- **No G0** — all moves `G1` (through-foam connectors included)
- **Out-and-back:** same `X Y` repeated twice in a row on an edge

### Vector Linker linked SVG (Example 3)

- `viewBox="0 -199.908 499.802 194.908"`
- START/END polyline point: `(0, -199.908)` — same geometry as G-code with **Y offset** (~214.9 mm shift vs `.tap`)

### NC7 Studio.Fabric (target)

- **G90 absolute** from block **top-left (0,0)**
- **X+** right · **Y+** up (above bed) · **Y−** down
- Default START: **X0, Y20** mm above top-left (panel + drag)
- Export must map bed geometry → BK’s machine convention consistently (document any Y flip vs Vector Linker samples)

---

## 4. Core data model (correct mental model)

**Wrong (early NC7 prototype):** treat each closed path as a “loop”, greedy order, dashed air between loop centroids.

**Correct (Vector Linker):**

```
Node     — red dot on a path polyline (vertex)
Segment  — black edge between two nodes (cut along foam)
Link     — green connector: node A → node B (through foam, straight G1 in export)
Tour     — graph of links + path traversal; one continuous polyline when fully linked
```

**Rules:**

1. A node may have **at most one exit link** — delete old link before creating a new one from that node.
2. Links connect **nodes**, not arbitrary curve points (prefer straights on stems for letters like **B**).
3. **Inner before outer** per letter where applicable (e.g. A: hole → outer; B: stem ↔ bowls then exit to C).
4. **START** is separate from first link target; fully linked tour returns to START (duplicate point in G-code).

---

## 5. User workflows

### 5.1 Load (unlinked)

- ABC = **separate contours** (black + red nodes)
- Blue START at top — **always visible**
- No green connectors yet

### 5.2 Auto link

- Software proposes green connectors + tour order
- Rough auto order (Example 5): START → A (outer + inner) → … → B → … → C
- BK may **delete bad links** and **re-link manually**
- Auto alone is a **draft** — production trust needs manual fix (especially **B**)

### 5.3 Manual link

1. **Click** start **node**
2. **Drag** — rubber-band line follows cursor
3. **Click** end **node** → link becomes **green**

### 5.4 Delete link

- Hover link: green → blue
- **Right-click** → delete link (path geometry unchanged)

### 5.5 Add node

- Hover black path → cursor shows **+**
- Right-click → **Add point** → new red node on segment

### 5.6 Reverse cut direction

- Toolbar: reverse direction on selected path/segment (`<` / `>` flip)

### 5.7 Pan / zoom

- **Mouse wheel** — zoom
- **Left-click + drag** on empty space — pan (release to stop)

### 5.8 Simulation

- Animates **linked** black path from blue START
- **Unlinked** stays grey — not in sim
- Speed slider = **preview only** (not machine feed from Setup)

### 5.9 Save / export

| Condition | Behavior |
|-----------|----------|
| **All vectors linked** | Save → `.tap`, **no alarm**, same folder + basename as source `.svg` |
| **Some unlinked** | Alarm: **“The drawing contains unconnected objects. Are you sure you want to save?”** Yes / No |
| **Yes (unlinked)** | Export anyway — software **auto-stitches** open ends with G1 jumps; **no START**, **no** out-and-back home |

---

## 6. ABC Example 1 — artifacts

| File | Description |
|------|-------------|
| Inkscape original | ABC, white fill red stroke, 3+ contours per letter rules |
| `ABC1_auto_no_user_edit.tap` | Auto link only |
| Manual-edited `.tap` | Reordered A→C first; removed bad detour; straight connector A→C |
| Linked `.svg` | Single `<polyline>` — full tour |
| `abc_no_link.tap` | Unlinked save → Yes on alarm (auto-stitch, no START/home) |

See `examples/gcode/` and `examples/notes/abc-example-1.md`.

### G-code read — auto only (`ABC1_auto_no_user_edit.tap`)

- START `(0, 15)` ×2 at end → out-and-back home
- Long straight `G1` connectors (through foam)
- Duplicate points on edges (out-and-back rule)
- B inner hole `(83.531, -47.342)` before outer loop
- One continuous tour

### G-code read — no link (Yes on save alarm)

- **No** `(0, 15)` START
- **No** return home
- Machine-chosen `G1` stitches between open contours
- Not the same as a deliberate linked tour

### BK-approved B link pattern

- **4 internal** green links: stem ↔ each bowl (on straight segments)
- **1 external** link: B → C (middle-right to C)
- Inner loops before outer on B

---

## 7. NC7 toolbar parity (Vector Linker → NC7 Link mode)

| Vector Linker | NC7 |
|---------------|-----|
| Set start point | ✅ |
| Move drawing | ❌ skip |
| Reverse cut direction | ✅ |
| Auto link | ✅ |
| Simulation + speed slider | ✅ |
| Undo / redo / settings | ✅ must have |
| Save → `.tap` | NC7: export G-code (menu or save flow) |

---

## 8. What early NC7 linker got wrong

1. **Loop-centric auto** (centroid sort) instead of **node + link graph**
2. **Air segments** as tour geometry instead of explicit **green links** between nodes
3. No **one-link-per-node** rule
4. No **hover / right-click** link edit UX
5. No **unlinked save alarm** + different export behavior
6. Simulation included naive “air” moves rather than Vector Linker’s linked-only trace
7. Direction markers and node coordinate popups not matching VL

**Rebuild linker around:** nodes, segments, links, tour graph → flatten to one polyline → G90 G-code.

---

## 9. Implementation phasing (suggested)

1. **Node graph model** — extract nodes from paths; store links separately from geometry  
2. **Overlay** — black paths, red nodes, green links, blue START, `<`/`>`  
3. **Manual link** — click-drag-click; delete on right-click; one exit per node  
4. **Auto link v2** — VL-style heuristics (inner-before-outer, B pattern); BK can override  
5. **Simulation** — linked tour only  
6. **Export** — linked: START + out-and-back; unlinked Yes: stitch mode  
7. **Save alarm** — exact VL wording optional  

---

## 10. Open / waiting from BK

- [x] Inkscape source `.svg` in `examples/svg/abc-inkscape-original.svg`
- [x] Screenshots in `examples/screenshots/`
- [x] “Not link” example file (`examples/gcode/abc_no_link.tap`)

---

*Captured from BK ↔ CRS walkthrough. Do not replace with agent guesses — update this file when BK corrects.*

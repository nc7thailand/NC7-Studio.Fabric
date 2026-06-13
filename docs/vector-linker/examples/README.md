# Vector Linker — reference examples

Isolated area for BK reference material (Vector Linker / hot-wire CAM parity research).

**Not app source** — do not import from here at runtime.

**Read first:** [`../BK_LINKER_SPEC.md`](../BK_LINKER_SPEC.md) — full linker logic from BK’s Vector Linker walkthrough.

## Layout

```
docs/vector-linker/examples/
├── README.md          ← this file
├── svg/               ← input SVG files
├── gcode/             ← .tap / .nc machine output
├── screenshots/       ← Vector Linker UI captures
└── notes/             ← step-by-step notes per example
```

## How to add files

**Flat** (single file):

- `gcode/bird-01.tap`
- `svg/bird-01.svg`
- `screenshots/bird-01-ui.png`

**Grouped** (recommended for multi-file sets):

```
two-letters/
├── notes.md
├── input.svg
├── output.tap
└── screenshot.png
```

Or use subfolders under each type, e.g. `svg/two-letters/input.svg`.

## Ideal first example

Screenshot + SVG + G-code + short notes (START position, link order, anything non-obvious).

## NC7 linker alignment

When reviewing an example, compare against:

- G90 absolute coordinates (block top-left origin; Y+ up)
- START above sheet → cut tour → out-and-back return on same air path
- G1-only export, steady feed from Setup

See also `docs/LINKER_WORKSPACE_MEMO.txt` and BK spec when provided.

## Recovered screenshots (2026-06-11)

CRS chat images were **not in git**, but Cursor cached them on the Mac Mini when BK attached them in cloud chat. Recovered from:

- `~/Library/Application Support/Cursor/User/workspaceStorage/empty-window/images/`
- `~/.cursor/projects/Users-nc7foamart-Documents-GitHub-AG-NC7-FoamArt-Studio/assets/`

Copied into `screenshots/`:

| File | What it shows |
|------|----------------|
| `ABC1-noLink.png` | ABC after load in VectorLinker — save without Auto Link (transformed polyline, no green links) |
| `abc-linked-full-window-vm.png` | ABC linked — full Vector Linker window in VMware Win11 |
| `vl-start-screen-toolbar.png` | VL start screen + toolbar icons |
| `abc-unlinked-no-green.png` | ABC before linking (no green links) |
| `abc-linked-green-links-overview.png` | ABC with green links + blue START |
| `abc-linked-all-letters.png` | ABC linked path overview |
| `abc-linked-hover-b-stem.png` | ABC linked, hover on B stem |
| `abc-link-detail-a-to-b.png` | A→B link detail |
| `unlinked-save-alarm-dialog.png` | “Unconnected objects” save dialog |
| `context-menu-add-point.png` | Right-click → Add point |
| `link-green-direction-arrows.png` | Green link + direction arrows |
| `direction-arrow-on-segment.png` | `<` direction on segment |
| `link-on-b-bowl.png` | Link on B inner bowl |
| `link-hover-cyan-b-stem.png` | Hover link → cyan highlight |
| `manual-link-drag-cyan.png` | Manual link drag (cyan line) |

**Not Vector Linker ABC:** The wedding couple SVG is NC7’s **app dummy** (`public/dummy-wedding01.svg`, Tools → “Dummy add Wedding”) — not Example 1 art.

**In repo (gcode):**
- `ABC1_auto_no_user_edit.tap` — auto link only
- `ABC1_manual_edited.tap` — auto + BK manual edits (A→C earlier, no 282/297 detour, B bowls last)
- `abc_no_link.tap` — unlinked save → Yes on alarm (no START/home, auto-stitch G1)

**In repo (svg):** `abc-linked-export.svg` — one `<polyline>`, manual-edited tour (matches `ABC1_manual_edited.tap`).

**In repo (svg):** `abc-inkscape-original.svg` — Inkscape `ABC1.svg` (Arial bold, white fill, red stroke, one text path).

**Still missing for ABC Example 1:** simulation captures only.

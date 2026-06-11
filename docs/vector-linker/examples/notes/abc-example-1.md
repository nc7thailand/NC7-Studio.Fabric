# ABC Example 1 — Vector Linker reference

## Art

- **Letters:** ABC (not AI — thumbnail was misleading)
- **Source:** Inkscape, white fill, red stroke
- **Contours:** Multiple per letter; link order rule: **inner before outer** per shape (e.g. A hole → A outer)

## Files (place in repo when available)

| File | Notes |
|------|--------|
| `../svg/abc-inkscape-original.svg` | Unlinked source (`ABC1.svg`) ✅ in repo |
| `../gcode/ABC1_auto_no_user_edit.tap` | Auto link only ✅ in repo |
| `../gcode/ABC1_manual_edited.tap` | Auto + BK manual link edits ✅ in repo |
| `../svg/abc-linked-export.svg` | Single `<polyline>` full tour ✅ in repo |
| `../gcode/abc_no_link.tap` | Save with unlinked alarm → Yes ✅ in repo |

## Auto-only tour (summary)

- START/END: `(0, 15)` duplicated
- Through-foam: all `G1`, no `G0`
- Out-and-back: duplicate consecutive XY (e.g. `169.716,-7.884` ×2)
- B hole cut at `(83.531, -47.342)` appears before outer B loop

## Manual edit vs auto (BK)

- Tour order changed: **A → C** earlier in sequence (`297.55,-87.15` → `298.88,-87.55`, not via `282.23,-69.31`)
- Removed bad auto detour (`282.227902` → `297.550867` jump)
- **B** cut after **C** outer (`245.52,-177` → `222.40,-177` → bowls → home)
- `X366.633904 Y-38.177356` (auto had `Y-37.376289`)

## Linked SVG (Example 3)

- One `<polyline>` — entire tour
- Size: 499.802 × 194.908 mm
- START in SVG space: `(0, -199.908)` — same path as G-code with Y offset

## B link pattern (BK approved)

1. Four **internal** links: vertical stem ↔ each bowl (on straight segments)
2. One **external** link: B → C
3. Inner bowl loops before outer perimeter

## Save behaviors

| Mode | START (0,15) | Return home | Tour |
|------|----------------|-------------|------|
| Fully linked | Yes | Yes | User-defined links |
| Unlinked + Yes on alarm | No | No | Auto-stitch G1 jumps (`abc_no_link.tap`) |

Alarm text (Vector Linker):

> **Are you sure?**  
> The drawing contains unconnected objects. Are you sure you want to save?

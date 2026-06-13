# ABC1 Raw vs Linked SVG Comparison

Source files:

- `/Users/nc7foamart/Library/CloudStorage/GoogleDrive-parinypusree@gmail.com/My Drive/VectorLinkerDemo/ABC1.svg.txt`
- `/Users/nc7foamart/Library/CloudStorage/GoogleDrive-parinypusree@gmail.com/My Drive/VectorLinkerDemo/ABC1-linked.svg.txt`

This note is analysis only. It does not assume any current NC7 linker engine.

## What The Files Are

`ABC1.svg.txt` is the raw geometry.

- SVG size: `1299mm x 600mm`
- `viewBox="0 0 1299 600"`
- One visible geometry element: a single `<path id="text1" aria-label="ABC">`
- That path is a compound glyph path containing multiple subpaths for A, B, and C.
- It does not encode a cutting order or linking tour.

`ABC1-linked.svg.txt` is the linked result.

- SVG size: `571.505mm x 220mm`
- `viewBox="0 -20 571.505 220"`
- One visible geometry element: a single `<polyline>`
- The polyline starts at `0,-20`.
- The polyline ends by returning to `0,-20 0,-20`.
- This file is already a merged tour: cut geometry and connector moves are mixed into one ordered point list.

## Main Finding

The linked file is not a simple object-sort result.

It is an ordered polyline derived from compound glyph geometry. The important operation is not "sort A, B, C objects"; it is:

1. Split the raw compound path into contours.
2. Flatten curves into dense polyline points.
3. Choose an ordered traversal through selected contour sections.
4. Insert bridge / turn points.
5. Emit one continuous polyline.

## Start And Coordinate Frame

Linked SVG begins with:

```text
0,-20
75.3299,3.29816
0,196.702
41.4248,196.702
57.3879,152.771
69.3932,120.185
122.164,120.185
122.164,120.185
95.5146,48.4169
69.3932,120.185
...
```

The linked coordinate frame is cropped compared to raw:

- Raw `viewBox`: `0 0 1299 600`
- Linked `viewBox`: `0 -20 571.505 220`

The linked START is `0,-20`, above the artwork in SVG coordinates.

## A Letter Behavior

Raw A contains at least two subpaths:

- A outer contour, including points like:
  - `75.329899,3.2977203`
  - `0,196.70163`
  - `194.06354,196.70163`
  - `116.62282,3.2977203`
- A inner triangle, including:
  - `122.16372,120.18439`
  - `95.514618,48.416504`
  - `69.393217,120.18439`

Linked A does not simply cut all outer first, then all inner.

It begins:

```text
0,-20
75.3299,3.29816
0,196.702
41.4248,196.702
57.3879,152.771
69.3932,120.185
122.164,120.185
122.164,120.185
95.5146,48.4169
69.3932,120.185
57.3879,152.771
134.697,152.771
151.583,196.702
194.064,196.702
...
```

Important observations:

- The tour enters A at the top/apex: `75.3299,3.29816`.
- It walks a partial outer path down to the left/bottom side.
- It then crosses into the inner triangle region.
- The point `122.164,120.185` appears twice consecutively.
- After the inner triangle sequence, it returns into the outer A path and continues toward the right side.

That repeated point is significant. It likely marks a turn, boundary, or bridge transition in the linked tour.

## B Letter Behavior

Raw B uses a mix of commands: `M`, `h`, `q`, `v`, `z`, and relative subpaths.

Linked B is a dense polyline. Curves from raw are flattened into many small coordinate steps, for example around the lower B area:

```text
280.739,196.702
282.283,196.691
283.803,196.679
285.298,196.666
...
```

This means any reproduction of the linked SVG must include curve flattening, not only curve endpoints.

## C Letter Behavior

Raw C is also curve-based. Linked C is heavily sampled into many points.

One important repeated coordinate appears in the C region:

```text
571.505,137.599
533.642,125.594
533.642,125.594
533.32,126.952
...
```

The duplicated `533.642,125.594` likely marks a boundary / turn / bridge transition, similar to duplicated points seen in A.

## What Raw Does Not Contain

The raw SVG does not directly contain:

- START point
- cutting order
- connector order
- curve sampling density
- final one-piece tour

Raw contains geometry only.

## What Linked Adds

The linked SVG adds:

- START at `0,-20`
- one continuous ordered polyline
- flattened curves
- repeated transition points
- partial traversal across contours
- a final return to START

## Practical Conclusion

The target behavior should be understood as:

```text
compound glyph path -> contours -> flattened point loops -> ordered single polyline tour
```

Not as:

```text
objects -> centroid sort -> straight links
```

The evidence from these two files shows that the linked result is a specific ordered tour through glyph contour geometry. The core problem is deriving that ordered polyline from the raw compound SVG path.


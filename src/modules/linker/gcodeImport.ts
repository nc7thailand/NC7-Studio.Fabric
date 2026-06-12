import type { G90Point } from './linkerTypes';

/** Parse Vector Linker–style `.tap` / G90 G1 XY rows (ignores comments and other codes). */
export function parseGcodeTap(text: string): G90Point[] {
  const points: G90Point[] = [];
  let pendingX: number | null = null;
  let pendingY: number | null = null;

  const flush = (): void => {
    if (pendingX != null && pendingY != null) {
      points.push({ x: pendingX, y: pendingY });
    }
    pendingX = null;
    pendingY = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/;.*$/, '').trim();
    if (!line) continue;

    const tokens = line.split(/\s+/);
    for (const token of tokens) {
      const head = token[0]?.toUpperCase();
      const value = parseFloat(token.slice(1));
      if (!Number.isFinite(value)) continue;

      if (head === 'X') {
        flush();
        pendingX = value;
      } else if (head === 'Y' && pendingX != null) {
        pendingY = value;
        flush();
      }
    }
  }

  flush();
  return points;
}

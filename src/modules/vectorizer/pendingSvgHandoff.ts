/** Cross-tab SVG relay — main canvas listens via `storage` events. */
export const PENDING_SVG_KEY = 'NC7_PENDING_SVG';

/** @deprecated Legacy key — cleared on read if present. */
const LEGACY_PENDING_SVG_KEY = 'foamart:fabric:vectorcore:pendingSvg';

export const LEGACY_VECTORIZER_PORT = 3009;

export const VECTORIZER_TAB_CLOSE_DELAY_MS = 100;

export interface PendingSvgStoragePayload {
  svg: string;
  name?: string;
  timestamp: number;
}

export interface PendingSvgPayload {
  svgText: string;
  name?: string;
}

export function getLegacyVectorizerUrl(embedFabric = true): string {
  const env = import.meta.env.VITE_LEGACY_VECTORIZER_URL as string | undefined;
  if (env) {
    const base = env.replace(/\/$/, '');
    return embedFabric ? `${base}?embed=fabric` : base;
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const base = `http://${host}:${LEGACY_VECTORIZER_PORT}/vectorizer`;
  return embedFabric ? `${base}?embed=fabric` : base;
}

export function getLegacyVectorizerOrigin(): string {
  const url = new URL(getLegacyVectorizerUrl(false));
  return url.origin;
}

export function parsePendingSvgStorage(raw: string): PendingSvgPayload | null {
  try {
    const parsed = JSON.parse(raw) as {
      svg?: string;
      svgText?: string;
      name?: string;
    };
    const svgText =
      typeof parsed.svg === 'string'
        ? parsed.svg
        : typeof parsed.svgText === 'string'
          ? parsed.svgText
          : null;
    if (!svgText?.trim()) return null;
    return {
      svgText,
      name: typeof parsed.name === 'string' ? parsed.name : 'traced_image.svg',
    };
  } catch {
    return null;
  }
}

/** Vectorizer tab: persist SVG, then close after a short flush delay. */
export function commitPendingSvgHandoff(svgText: string, name = 'traced_image.svg'): void {
  const payload: PendingSvgStoragePayload = {
    svg: svgText,
    name,
    timestamp: Date.now(),
  };
  window.localStorage.setItem(PENDING_SVG_KEY, JSON.stringify(payload));

  window.setTimeout(() => {
    window.close();
    if (!window.closed) {
      window.location.href = '/';
    }
  }, VECTORIZER_TAB_CLOSE_DELAY_MS);
}

export function readPendingSvg(): PendingSvgPayload | null {
  try {
    const raw =
      window.localStorage.getItem(PENDING_SVG_KEY) ??
      window.localStorage.getItem(LEGACY_PENDING_SVG_KEY);
    if (!raw) return null;
    return parsePendingSvgStorage(raw);
  } catch {
    return null;
  }
}

export function clearPendingSvg(): void {
  try {
    window.localStorage.removeItem(PENDING_SVG_KEY);
    window.localStorage.removeItem(LEGACY_PENDING_SVG_KEY);
  } catch {
    // ignore
  }
}

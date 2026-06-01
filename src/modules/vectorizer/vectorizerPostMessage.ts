import {
  LEGACY_VECTORIZER_PORT,
  PENDING_SVG_KEY,
  commitPendingSvgHandoff,
  getLegacyVectorizerOrigin,
  parsePendingSvgStorage,
} from './pendingSvgHandoff';

export const VECTORIZER_MESSAGE = {
  EXPORT: 'foamart:vectorizer:export',
  CLOSE: 'foamart:vectorizer:close',
} as const;

export interface VectorizerExportData {
  svgText: string;
  name: string;
}

/** Parse iframe → /vectorcore tab postMessage (bridge only, not main canvas). */
export function parseVectorizerExportMessage(data: unknown): VectorizerExportData | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== VECTORIZER_MESSAGE.EXPORT) return null;

  const svgText =
    typeof msg.payload === 'string'
      ? msg.payload
      : typeof msg.svg === 'string'
        ? msg.svg
        : null;

  if (!svgText?.trim()) return null;

  const name =
    typeof msg.name === 'string' && msg.name.trim()
      ? msg.name.trim()
      : 'traced_image.svg';

  return { svgText, name };
}

export function isLegacyVectorizerOrigin(origin: string): boolean {
  if (!origin) return false;
  const expected = getLegacyVectorizerOrigin();
  if (origin === expected) return true;
  try {
    const received = new URL(origin);
    const legacy = new URL(expected);
    return (
      received.protocol === legacy.protocol &&
      received.hostname === legacy.hostname &&
      received.port === String(LEGACY_VECTORIZER_PORT)
    );
  } catch {
    return false;
  }
}

export type VectorizerExportHandler = (data: VectorizerExportData) => void;

/**
 * /vectorcore tab only: listen for :3009 iframe export, write localStorage, close tab.
 * Main canvas must NOT use this — it uses bindVectorizerStorageHandoffListener.
 */
export function bindVectorizerIframeBridgeListener(handler: VectorizerExportHandler): () => void {
  const listener = (event: MessageEvent) => {
    if (!isLegacyVectorizerOrigin(event.origin)) return;

    const exportData = parseVectorizerExportMessage(event.data);
    if (exportData) {
      handler(exportData);
      return;
    }

    const msg = event.data as { type?: string } | null;
    if (msg?.type === VECTORIZER_MESSAGE.CLOSE) {
      window.close();
      if (!window.closed) window.location.href = '/';
    }
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Persist SVG for main tab `storage` listener, then autoclose vectorizer tab. */
export function relayVectorizerExportViaStorage(data: VectorizerExportData): void {
  commitPendingSvgHandoff(data.svgText, data.name);
}

/** Main canvas: react to NC7_PENDING_SVG writes from the vectorizer tab. */
export function bindVectorizerStorageHandoffListener(handler: VectorizerExportHandler): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key !== PENDING_SVG_KEY || !event.newValue) return;
    const parsed = parsePendingSvgStorage(event.newValue);
    if (!parsed) return;
    handler({
      svgText: parsed.svgText,
      name: parsed.name ?? 'traced_image.svg',
    });
  };

  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

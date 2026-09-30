import { getLegacyVectorizerUrl } from '../modules/vectorizer/pendingSvgHandoff';
import {
  bindVectorizerIframeBridgeListener,
  relayVectorizerExportViaStorage,
} from '../modules/vectorizer/vectorizerPostMessage';

/** Legacy :3009 iframe is HTTP-only on the Mini — blocked by Mixed Content under HTTPS. */
function canEmbedLegacyVectorizer(): boolean {
  if (typeof window === 'undefined') return false;
  const env = import.meta.env.VITE_LEGACY_VECTORIZER_URL as string | undefined;
  if (env) {
    try {
      const u = new URL(env);
      // Only embed if schemes match (HTTPS page needs HTTPS iframe).
      return u.protocol === window.location.protocol;
    } catch {
      return false;
    }
  }
  // Default Mini URL is http://host:3009 — safe only on local HTTP pages.
  return (
    window.location.protocol === 'http:' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('100.'))
  );
}

export function mountVectorCoreEmbed(mountSelector = '#app'): () => void {
  const root = document.querySelector(mountSelector);
  if (!(root instanceof HTMLElement)) throw new Error('VectorCoreEmbed: mount missing');

  if (!canEmbedLegacyVectorizer()) {
    root.innerHTML = `
      <div class="vectorizer-paused-screen">
        <h1>Use Bitmap Trace</h1>
        <p>
          The legacy vectorizer embed requires HTTP on port 3009 and cannot load inside
          this HTTPS app (browser Mixed Content block).
        </p>
        <p>
          Use <strong>Tools → Trace Image (Bitmap)</strong> on the foam bed canvas instead.
        </p>
        <p><a href="/">← Back to NC7 Canvas</a></p>
      </div>
    `;
    return () => {};
  }

  const iframeSrc = getLegacyVectorizerUrl(true);

  root.innerHTML = `
    <div class="vectorcore-embed">
      <iframe
        id="legacy-vectorizer-frame"
        class="vectorcore-embed-frame"
        src="${iframeSrc}"
        title="FoamArt Legacy Vectorizer"
        allow="camera *; fullscreen"
      ></iframe>
    </div>
  `;

  return bindVectorizerIframeBridgeListener((data) => {
    relayVectorizerExportViaStorage(data);
  });
}

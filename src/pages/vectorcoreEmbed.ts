import { getLegacyVectorizerUrl } from '../modules/vectorizer/pendingSvgHandoff';
import { VECTORIZER_PAUSED, VECTORIZER_PAUSED_MESSAGE } from '../modules/vectorizer/vectorizerPause';
import {
  bindVectorizerIframeBridgeListener,
  relayVectorizerExportViaStorage,
} from '../modules/vectorizer/vectorizerPostMessage';

export function mountVectorCoreEmbed(mountSelector = '#app'): () => void {
  const root = document.querySelector(mountSelector);
  if (!(root instanceof HTMLElement)) throw new Error('VectorCoreEmbed: mount missing');

  if (VECTORIZER_PAUSED) {
    root.innerHTML = `
      <div class="vectorizer-paused-screen">
        <h1>Vectorizer paused</h1>
        <p>${VECTORIZER_PAUSED_MESSAGE}</p>
        <p><a href="/">Back to foam bed canvas</a></p>
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

import { getLegacyVectorizerUrl } from '../modules/vectorizer/pendingSvgHandoff';
import {
  bindVectorizerIframeBridgeListener,
  relayVectorizerExportViaStorage,
} from '../modules/vectorizer/vectorizerPostMessage';

export function mountVectorCoreEmbed(mountSelector = '#app'): () => void {
  const root = document.querySelector(mountSelector);
  if (!(root instanceof HTMLElement)) throw new Error('VectorCoreEmbed: mount missing');

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

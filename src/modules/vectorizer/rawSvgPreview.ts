const TRACED_CONTENT_GROUP_ID = 'traced_content';

/** Count `<path>` nodes inside handoff SVG (for buffer inspect). */
export function countTracedPathsInSvg(svgText: string): number {
  if (typeof DOMParser === 'undefined') return 0;
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const traced = doc.querySelector(`#${TRACED_CONTENT_GROUP_ID}`);
    const root = traced ?? doc.querySelector('svg');
    if (!root) return 0;
    return root.querySelectorAll('path').length;
  } catch {
    return 0;
  }
}

/** Browser-native SVG preview — same rendering idea as :3009 export step. */
export function renderRawSvgPreview(host: HTMLElement, svgText: string): void {
  host.replaceChildren();
  const inner = document.createElement('div');
  inner.className = 'raw-svg-preview-inner';
  inner.innerHTML = svgText;
  const svg = inner.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    if (!svg.getAttribute('preserveAspectRatio')) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }
  host.appendChild(inner);
}

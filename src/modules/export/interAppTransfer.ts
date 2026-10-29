/**
 * Inter-App Transfer module
 * Enables 1-Click transfer of 2D/3D geometry from NC7 Studio Canvas
 * to NC7 PathFinder (2D CNC toolpathing) and NC7 3dSym (3D symmetric converter).
 */

export type TargetApp = 'pathfinder' | '3dsym';

export interface InterAppTransferOptions {
  target: TargetApp;
  svgContent: string;
  dxfContent?: string;
  filename?: string;
}

export const APP_TARGET_URLS: Record<TargetApp, string> = {
  pathfinder: 'https://pathfinder.nc7foamart.com/',
  '3dsym': 'https://3dfreeform.nc7foamart.com/3dsym/',
};

export interface TransferPayload {
  type: 'NC7_TRANSFER_FILE';
  version: '1.0';
  source: 'NC7_STUDIO_CANVAS';
  target: TargetApp;
  format: 'svg' | 'dxf';
  filename: string;
  content: string;
  dxfContent?: string;
  timestamp: number;
}

/**
 * Display a temporary floating toast in the Studio shell.
 */
export function showTransferToast(message: string, isError = false): void {
  if (typeof document === 'undefined') return;
  let toastContainer = document.getElementById('nc7-transfer-toast');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'nc7-transfer-toast';
    toastContainer.className = 'transfer-toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `transfer-toast ${isError ? 'transfer-toast--error' : ''}`;
  toast.innerHTML = message;
  toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('transfer-toast--fadeout');
    window.setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/**
 * Executes the inter-app transfer:
 * 1. Opens target app in a new browser tab.
 * 2. Streams the payload via postMessage with active handshake.
 * 3. Copies content to clipboard and triggers quiet SVG download for zero-friction fallback.
 */
export function sendToTargetApp(options: InterAppTransferOptions): Window | null {
  const { target, svgContent, dxfContent, filename } = options;

  if (!svgContent || svgContent.trim().length === 0) {
    showTransferToast('Cannot send: canvas layout is empty.', true);
    return null;
  }

  const targetUrl = APP_TARGET_URLS[target];
  const targetLabel = target === 'pathfinder' ? 'PathFinder' : '3dSym';
  const outName = filename || (target === 'pathfinder' ? 'canvas-layout.svg' : 'canvas-profile.svg');

  const payload: TransferPayload = {
    type: 'NC7_TRANSFER_FILE',
    version: '1.0',
    source: 'NC7_STUDIO_CANVAS',
    target,
    format: 'svg',
    filename: outName,
    content: svgContent,
    dxfContent: dxfContent || undefined,
    timestamp: Date.now(),
  };

  // 1. Copy SVG to clipboard for instant 1-click Ctrl+V / Paste if user needs it
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(svgContent).catch(() => {});
  }

  // 2. Open target app in a new browser tab
  const newTab = window.open(targetUrl, '_blank');
  if (!newTab) {
    showTransferToast('Popup blocked! Please allow popups to open ' + targetLabel, true);
    return null;
  }

  showTransferToast(`Sending to <strong>${targetLabel}</strong>… Opened in new tab!`);

  // 3. PostMessage Handshake & Repeat Ping
  // Pings the new tab every 400ms for up to 15s until acknowledged or closed
  let attempts = 0;
  const maxAttempts = 35;

  let timer: number | undefined;

  const onAck = (event: MessageEvent) => {
    if (event.data?.type === 'NC7_TRANSFER_ACK') {
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener('message', onAck);
      showTransferToast(`Successfully sent to <strong>${targetLabel}</strong>! ✓`);
      return;
    }
    if (event.data?.type === 'NC7_TARGET_READY') {
      try {
        newTab.postMessage(payload, '*');
      } catch {
        /* cross-origin catch */
      }
    }
  };
  window.addEventListener('message', onAck);

  timer = window.setInterval(() => {
    attempts++;
    if (!newTab || newTab.closed || attempts > maxAttempts) {
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener('message', onAck);
      return;
    }
    try {
      newTab.postMessage(payload, '*');
    } catch {
      /* cross-origin catch */
    }
  }, 400);

  // 4. Also store in local/session storage if available
  try {
    sessionStorage.setItem('nc7_pending_transfer', JSON.stringify(payload));
  } catch {
    /* ignore sandbox restrictions */
  }

  return newTab;
}

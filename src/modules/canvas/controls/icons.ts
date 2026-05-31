export const CONTROL_SIZE = 24;

export function makeIconCanvas(label: string, fill: string, stroke = '#fff'): HTMLCanvasElement {
  const size = CONTROL_SIZE * 2;
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) return el;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.font = `bold ${size * 0.45}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 1);

  return el;
}

export const deleteIcon = makeIconCanvas('×', '#ef4444');
export const cloneIcon = makeIconCanvas('+', '#22c55e');

/** Preload complete before any Control render (JM gotcha). */
export function iconsReady(): boolean {
  return deleteIcon.width > 0 && cloneIcon.width > 0;
}

/**
 * Fabric v7 custom controls — delete + clone (demo parity).
 * Icons are preloaded canvas elements before controls attach (JM gotcha).
 */

import { Control, util } from 'fabric';

const CONTROL_SIZE = 24;

/** @param {string} label Single char label for spike icons */
function makeIconCanvas(label, fill, stroke = '#fff') {
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

/**
 * @param {HTMLCanvasElement} icon
 * @returns {Control['render']}
 */
export function renderIcon(icon) {
  return function renderIconControl(ctx, left, top, _styleOverride, fabricObject) {
    const size = this.cornerSize || CONTROL_SIZE;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(util.degreesToRadians(fabricObject.angle || 0));
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  };
}

/**
 * @param {import('fabric').Canvas} canvas
 * @param {import('fabric').FabricObject} target
 */
export function deleteObject(_eventData, transform) {
  const target = transform.target;
  const canvas = target.canvas;
  if (!canvas) return true;
  canvas.remove(target);
  canvas.requestRenderAll();
  return true;
}

/**
 * Fabric v7: target.clone() returns a Promise.
 * @param {import('fabric').Canvas} canvas
 */
export function cloneObject(_eventData, transform) {
  const target = transform.target;
  const canvas = target.canvas;
  if (!canvas) return true;

  target
    .clone()
    .then((cloned) => {
      cloned.set({
        left: (cloned.left || 0) + 10,
        top: (cloned.top || 0) + 10,
        evented: true,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.requestRenderAll();
    })
    .catch((err) => {
      console.error('[fabric-spike] clone failed', err);
    });

  return true;
}

/** Shared control instances (attached per object in controls map). */
export const deleteControl = new Control({
  x: 0.5,
  y: -0.5,
  offsetY: -16,
  offsetX: 16,
  cursorStyle: 'pointer',
  mouseUpHandler: deleteObject,
  render: renderIcon(deleteIcon),
  cornerSize: CONTROL_SIZE,
  sizeX: CONTROL_SIZE,
  sizeY: CONTROL_SIZE,
});

export const cloneControl = new Control({
  x: -0.5,
  y: -0.5,
  offsetY: -16,
  offsetX: -16,
  cursorStyle: 'pointer',
  mouseUpHandler: cloneObject,
  render: renderIcon(cloneIcon),
  cornerSize: CONTROL_SIZE,
  sizeX: CONTROL_SIZE,
  sizeY: CONTROL_SIZE,
});

/**
 * Attach JM-style controls on a single object: rect.controls.deleteControl / cloneControl
 * @param {import('fabric').FabricObject} obj
 */
export function attachCustomControls(obj) {
  if (!obj.controls) {
    obj.controls = {};
  }
  obj.controls.deleteControl = deleteControl;
  obj.controls.cloneControl = cloneControl;
}

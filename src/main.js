import { Canvas, Rect } from 'fabric';
import { attachCustomControls } from './fabricCustomControls.js';

const canvasEl = document.getElementById('fabric-canvas');
const addBtn = document.getElementById('add-rect');

if (!(canvasEl instanceof HTMLCanvasElement) || !(addBtn instanceof HTMLButtonElement)) {
  throw new Error('Fabric spike: missing canvas or button element');
}

function resizeCanvas(canvas) {
  const wrap = document.getElementById('canvas-wrap');
  const width = wrap?.clientWidth || 900;
  const height = Math.max(480, Math.floor(window.innerHeight * 0.65));
  canvas.setDimensions({ width, height });
  canvas.requestRenderAll();
}

const canvas = new Canvas(canvasEl, {
  backgroundColor: '#111827',
  selection: true,
  preserveObjectStacking: true,
});

resizeCanvas(canvas);
window.addEventListener('resize', () => resizeCanvas(canvas));

let rectCount = 0;

function addRectangle() {
  rectCount += 1;
  const rect = new Rect({
    left: 120 + (rectCount % 5) * 24,
    top: 100 + (rectCount % 5) * 18,
    fill: '#6366f1',
    width: 160,
    height: 100,
    opacity: 0.92,
    stroke: '#a5b4fc',
    strokeWidth: 1,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#6366f1',
    borderColor: '#6366f1',
    transparentCorners: false,
  });

  attachCustomControls(rect);

  canvas.add(rect);
  canvas.setActiveObject(rect);
  canvas.requestRenderAll();
}

addBtn.addEventListener('click', addRectangle);

addRectangle();

console.info('[fabric-spike] Fabric v7 custom controls ready — port 3010');

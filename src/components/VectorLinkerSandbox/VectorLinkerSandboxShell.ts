import { Canvas, Group, Path, Point, Polyline, Polygon, util, type FabricObject } from 'fabric';
import { mountCanvasViewport, type CanvasViewportHandle } from '../CanvasViewport/CanvasViewport';
import { drawLinkerStartPoint } from '../../modules/canvas/linkerOverlays';
import {
  DEFAULT_LINKER_START_POINT,
  resolveLinkerStartPointMm,
  type LinkerStartPointConfig,
} from '../../modules/linker/linkerStartPoint';
import {
  buildLinkerNoLinkFromSvgText,
  formatLinkerFrameSvgFilled,
  LINKER_SANDBOX_OBJECT_FILL,
  sandboxCanvasViewBox,
  type LinkerLoadTransformResult,
} from '../../modules/linker/linkerLoadTransform';
import { sandboxSvgUserPointToBed } from '../../modules/svg/pathCncGeometry';
import sandboxDefaultSvgText from '../../assets/vector-linker-sandbox/ABC1.svg?raw';

const { transformPoint } = util;

interface SvgXmlLine {
  number: number;
  text: string;
}

interface SandboxStep {
  index: number;
  point: { x: number; y: number };
  lineNumber: number;
  column: number;
  source: 'polyline' | 'path' | 'start';
}

const SIM_BUTTONS = [
  { id: 'first', label: '|<' },
  { id: 'backFast', label: '<<' },
  { id: 'back', label: '<' },
  { id: 'play', label: '||' },
  { id: 'forward', label: '>' },
  { id: 'forwardFast', label: '>>' },
  { id: 'last', label: '>|' },
] as const;

type SimButtonId = (typeof SIM_BUTTONS)[number]['id'];

const SANDBOX_SHAPE_STROKE = '#854d0e';
const SANDBOX_SHAPE_STROKE_WIDTH = 1;
const SANDBOX_WIRE_STROKE = '#3b82f6';
const SANDBOX_WIRE_STROKE_WIDTH = 3;
const SANDBOX_FILL = LINKER_SANDBOX_OBJECT_FILL;
const SANDBOX_START_POINT: LinkerStartPointConfig = { ...DEFAULT_LINKER_START_POINT };
const SANDBOX_NODE_DOT_RADIUS = 4;
const SANDBOX_NODE_DOT_FILL = '#ef4444';
const SANDBOX_NODE_DOT_STROKE = '#991b1b';
const SANDBOX_LOOP_NODE_FILL = '#22c55e';
const SANDBOX_LOOP_NODE_STROKE = '#14532d';
const SANDBOX_LOOP_MARKER_RADIUS = 7;
const PANEL_COORD_MIN_WRAP = 96;
const PANEL_POLYLINE_PAIRS_PER_ROW = 4;
const PANEL_PATH_WRAP = true;
/** Sandbox default — Inkscape ABC1 (1299×600 mm), bundled at build time. */
const SANDBOX_AUTO_LOAD_SVG_NAME = 'ABC1.svg';

function buildLineStarts(xml: string): number[] {
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of xml.split(/\r?\n/)) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  return lineStarts;
}

/** Panel-only layout: break long polyline/path coordinate strings across multiple lines. */
function formatSvgXmlForPanel(xml: string): string {
  let out = xml.replace(
    /(<polyline\b[^>]*\bpoints\s*=\s*")([\s\S]*?)(")/gi,
    (_match, open: string, points: string, close: string) => {
      const trimmed = points.trim();
      if (trimmed.length <= PANEL_COORD_MIN_WRAP) return `${open}${points}${close}`;
      const nums = parseNumberList(trimmed);
      if (nums.length < 4) return `${open}${points}${close}`;
      const rows: string[] = [];
      for (let i = 0; i + 1 < nums.length; i += PANEL_POLYLINE_PAIRS_PER_ROW * 2) {
        const chunk: string[] = [];
        for (let j = 0; j < PANEL_POLYLINE_PAIRS_PER_ROW * 2 && i + j + 1 < nums.length; j += 2) {
          chunk.push(`${nums[i + j]},${nums[i + j + 1]}`);
        }
        rows.push(`    ${chunk.join(' ')}`);
      }
      return `${open}\n${rows.join('\n')}\n  ${close}`;
    }
  );

  out = out.replace(
    /(\bd\s*=\s*")([\s\S]*?)(")/g,
    (_match, open: string, d: string, close: string) => {
      const trimmed = d.replace(/\s+/g, ' ').trim();
      if (!PANEL_PATH_WRAP || trimmed.length <= PANEL_COORD_MIN_WRAP) {
        return `${open}${d}${close}`;
      }
      const tokens =
        trimmed.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
      if (tokens.length === 0) return `${open}${d}${close}`;

      const rows: string[] = [];
      let cmd = '';
      let i = 0;
      while (i < tokens.length) {
        if (/^[A-Za-z]$/.test(tokens[i])) {
          cmd = tokens[i];
          i += 1;
        }
        const upper = cmd.toUpperCase();
        const relative = cmd === cmd.toLowerCase();
        if (upper === 'M' || upper === 'L') {
          const nx = tokens[i];
          const ny = tokens[i + 1];
          if (ny == null) break;
          rows.push(`    ${cmd} ${nx},${ny}`);
          i += 2;
          if (upper === 'M') cmd = relative ? 'l' : 'L';
        } else if (upper === 'H' || upper === 'V') {
          rows.push(`    ${cmd} ${tokens[i]}`);
          i += 1;
        } else if (upper === 'C' && tokens[i + 5] != null) {
          rows.push(
            `    ${cmd} ${tokens[i]},${tokens[i + 1]} ${tokens[i + 2]},${tokens[i + 3]} ${tokens[i + 4]},${tokens[i + 5]}`
          );
          i += 6;
        } else if (upper === 'Q' && tokens[i + 3] != null) {
          rows.push(`    ${cmd} ${tokens[i]},${tokens[i + 1]} ${tokens[i + 2]},${tokens[i + 3]}`);
          i += 4;
        } else if (upper === 'Z') {
          rows.push(`    ${cmd}`);
          i += 1;
        } else {
          i += 1;
        }
      }
      if (rows.length === 0) return `${open}${d}${close}`;
      return `${open}\n${rows.join('\n')}\n  ${close}`;
    }
  );

  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitXmlLines(xml: string): SvgXmlLine[] {
  return xml.split(/\r?\n/).map((text, index) => ({ number: index + 1, text }));
}

function parseNumberList(value: string): number[] {
  return (value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
}

function parsePolylineSteps(xml: string): SandboxStep[] {
  const steps: SandboxStep[] = [];
  const lineStarts = buildLineStarts(xml);

  const attrRegex = /<polyline\b[^>]*\bpoints\s*=\s*"([\s\S]*?)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(xml))) {
    const attrText = match[1];
    const attrStart = match.index + match[0].indexOf('"') + 1;
    const numbers = parseNumberList(attrText);
    let searchFrom = 0;
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const pairText = `${numbers[i]},${numbers[i + 1]}`;
      const localColumn = attrText.indexOf(pairText, searchFrom);
      if (localColumn >= 0) searchFrom = localColumn + pairText.length;
      const absoluteIndex = attrStart + Math.max(0, localColumn);
      const lineIndex = findLineIndex(lineStarts, absoluteIndex);
      steps.push({
        index: steps.length,
        point: { x: numbers[i], y: numbers[i + 1] },
        lineNumber: lineIndex + 1,
        column: Math.max(1, absoluteIndex - lineStarts[lineIndex] + 1),
        source: 'polyline',
      });
    }
  }
  return steps;
}

function parsePathSteps(xml: string): SandboxStep[] {
  const steps: SandboxStep[] = [];
  const lineStarts = buildLineStarts(xml);
  const dRegex = /\bd\s*=\s*"([\s\S]*?)"/g;
  let match: RegExpExecArray | null;

  while ((match = dRegex.exec(xml))) {
    const d = match[1];
    const attrStart = match.index + match[0].indexOf('"') + 1;
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
    let cmd = '';
    let x = 0;
    let y = 0;
    let i = 0;
    while (i < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[i])) {
        cmd = tokens[i];
        i += 1;
      }
      const upper = cmd.toUpperCase();
      const relative = cmd === cmd.toLowerCase();
      if (upper === 'M' || upper === 'L') {
        const nx = Number(tokens[i]);
        const ny = Number(tokens[i + 1]);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
        x = relative ? x + nx : nx;
        y = relative ? y + ny : ny;
        const tokenAt = d.indexOf(tokens[i], Math.max(0, i > 1 ? d.indexOf(tokens[i - 1]) : 0));
        const localColumn = tokenAt >= 0 ? tokenAt : d.indexOf(`${nx}`);
        const absoluteIndex = attrStart + Math.max(0, localColumn);
        const lineIndex = findLineIndex(lineStarts, absoluteIndex);
        steps.push({
          index: steps.length,
          point: { x, y },
          lineNumber: lineIndex + 1,
          column: Math.max(1, absoluteIndex - lineStarts[lineIndex] + 1),
          source: 'path',
        });
        i += 2;
        if (upper === 'M') cmd = relative ? 'l' : 'L';
      } else if (upper === 'H') {
        const nx = Number(tokens[i]);
        if (!Number.isFinite(nx)) break;
        x = relative ? x + nx : nx;
        const localColumn = d.indexOf(tokens[i], Math.max(0, d.lastIndexOf(cmd)));
        const absoluteIndex = attrStart + Math.max(0, localColumn);
        const lineIndex = findLineIndex(lineStarts, absoluteIndex);
        steps.push({
          index: steps.length,
          point: { x, y },
          lineNumber: lineIndex + 1,
          column: Math.max(1, absoluteIndex - lineStarts[lineIndex] + 1),
          source: 'path',
        });
        i += 1;
      } else if (upper === 'V') {
        const ny = Number(tokens[i]);
        if (!Number.isFinite(ny)) break;
        y = relative ? y + ny : ny;
        const localColumn = d.indexOf(tokens[i], Math.max(0, d.lastIndexOf(cmd)));
        const absoluteIndex = attrStart + Math.max(0, localColumn);
        const lineIndex = findLineIndex(lineStarts, absoluteIndex);
        steps.push({
          index: steps.length,
          point: { x, y },
          lineNumber: lineIndex + 1,
          column: Math.max(1, absoluteIndex - lineStarts[lineIndex] + 1),
          source: 'path',
        });
        i += 1;
      } else {
        i += 1;
      }
    }
  }
  return steps;
}

function parseSvgSteps(xml: string): SandboxStep[] {
  const polyline = parsePolylineSteps(xml);
  return polyline.length > 0 ? polyline : parsePathSteps(xml);
}

function findLineIndex(lineStarts: number[], absoluteIndex: number): number {
  let best = 0;
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i] <= absoluteIndex) best = i;
    else break;
  }
  return best;
}

function applySandboxVisibleStyle(obj: FabricObject): void {
  const isWirePolyline = obj instanceof Polyline && !(obj instanceof Polygon);
  const isEvenOddFill = obj instanceof Path;
  obj.set({
    stroke: isWirePolyline ? 'transparent' : SANDBOX_SHAPE_STROKE,
    strokeWidth: isWirePolyline ? 0 : SANDBOX_SHAPE_STROKE_WIDTH,
    fill: isWirePolyline ? 'transparent' : isEvenOddFill ? SANDBOX_FILL : 'transparent',
    ...(isEvenOddFill ? { fillRule: 'evenodd' as const } : {}),
    strokeUniform: true,
    opacity: 1,
    objectCaching: false,
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
  });
  if (obj instanceof Group) {
    for (const child of obj.getObjects()) {
      applySandboxVisibleStyle(child);
    }
  }
  obj.setCoords();
}

function findSvgImportRoot(objects: FabricObject[]): FabricObject | null {
  for (const obj of objects) {
    if (obj instanceof Group) {
      const vectorChildren = obj.getObjects().filter(
        (child) => child instanceof Path || child instanceof Polyline || child instanceof Polygon
      );
      if (vectorChildren.length > 1) return obj;
      const nested = findSvgImportRoot(obj.getObjects());
      if (nested) return nested;
      return obj;
    }
    if (obj instanceof Path || obj instanceof Polyline || obj instanceof Polygon) return obj;
  }
  return objects[0] ?? null;
}

function buildStepsFromLinkerLoad(
  linkerLoad: LinkerLoadTransformResult,
  panelXml: string
): SandboxStep[] {
  const parsed = parsePolylineSteps(panelXml);
  const { points } = linkerLoad;
  if (parsed.length === points.length) {
    return parsed.map((step, index) => ({
      ...step,
      index,
      point: { x: points[index].x, y: points[index].y },
    }));
  }
  return points.map((point, index) => ({
    index,
    point: { x: point.x, y: point.y },
    lineNumber: 1,
    column: 1,
    source: 'polyline' as const,
  }));
}

function buildLinkedSimSteps(geometrySteps: SandboxStep[]): SandboxStep[] {
  const start: SandboxStep = {
    index: 0,
    point: { x: SANDBOX_START_POINT.xMm, y: SANDBOX_START_POINT.yMm },
    lineNumber: 0,
    column: 0,
    source: 'start',
  };
  return [start, ...geometrySteps.map((step, index) => ({ ...step, index: index + 1 }))];
}

interface SandboxLoadXml {
  panelXml: string;
  canvasXml: string;
  noLinkApplied: boolean;
  linkerLoad: LinkerLoadTransformResult | null;
}

function resolveSandboxLoadXml(rawXml: string): SandboxLoadXml {
  try {
    const linkerLoad = buildLinkerNoLinkFromSvgText(rawXml);
    return {
      panelXml: formatSvgXmlForPanel(linkerLoad.svgText),
      canvasXml: formatLinkerFrameSvgFilled(
        linkerLoad.contours,
        linkerLoad.points,
        sandboxCanvasViewBox(linkerLoad.viewBox)
      ),
      noLinkApplied: true,
      linkerLoad,
    };
  } catch (error) {
    console.warn('[VectorLinkerSandbox] NoLink transform skipped; showing raw SVG.', error);
    return {
      panelXml: formatSvgXmlForPanel(rawXml),
      canvasXml: rawXml,
      noLinkApplied: false,
      linkerLoad: null,
    };
  }
}

export class VectorLinkerSandboxShell {
  private root: HTMLElement;
  private canvas: CanvasViewportHandle | null = null;
  private importRoot: FabricObject | null = null;
  private linkerLoad: LinkerLoadTransformResult | null = null;
  private geometrySteps: SandboxStep[] = [];
  private linked = false;
  private lines: SvgXmlLine[] = [];
  private steps: SandboxStep[] = [];
  private currentStep = 0;
  private playing = false;
  private playTimer: number | null = null;
  private textPanelKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private noLinkApplied = false;
  private readonly onCanvasAfterRender = (opt: { ctx: CanvasRenderingContext2D }) => {
    this.drawWireCursor(opt.ctx);
  };

  constructor(mountSelector = '#app') {
    const el = document.querySelector(mountSelector);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`VectorLinkerSandboxShell: mount ${mountSelector} not found`);
    }
    this.root = el;
  }

  mount(): void {
    this.root.innerHTML = this.render();
    this.bind();
    const canvasEl = this.root.querySelector('#vls-canvas');
    const mountEl = this.root.querySelector('#vls-canvas-mount');
    if (!(canvasEl instanceof HTMLCanvasElement) || !(mountEl instanceof HTMLElement)) {
      throw new Error('VectorLinkerSandboxShell: canvas mount missing');
    }

    this.canvas = mountCanvasViewport(mountEl, canvasEl);
    this.canvas.fabric.canvas.on('after:render', this.onCanvasAfterRender);
    this.canvas.fabric.canvas.selection = false;
    this.canvas.fabric.canvas.skipTargetFind = true;
    this.canvas.setLinkerStartPoint(SANDBOX_START_POINT);
    this.canvas.setLinkerMode(false);
    this.canvas.fabric.syncDimensions();
    this.canvas.resetView();
    this.renderXmlPanel();
    this.syncStepUi();
    void this.scheduleAutoLoadDummySvg();
  }

  private async scheduleAutoLoadDummySvg(): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    this.canvas?.fabric.syncDimensions();
    try {
      await this.autoLoadDummySvg();
    } catch (error) {
      console.warn('[VectorLinkerSandbox] auto-load SVG failed.', error);
      const readout = this.root.querySelector('#vls-step-readout');
      if (readout) readout.textContent = 'Auto-load ABC1 failed — use Load .svg';
      const loadMode = this.root.querySelector('#vls-load-mode');
      if (loadMode) loadMode.textContent = 'Auto-load failed';
    }
  }

  /** Auto-load ABC1 on open — same pipeline as Load .svg (File → loadSvgFile). */
  private async autoLoadDummySvg(): Promise<void> {
    if (!sandboxDefaultSvgText?.trim()) {
      throw new Error('Bundled ABC1.svg is empty');
    }
    await this.loadSvgText(sandboxDefaultSvgText, SANDBOX_AUTO_LOAD_SVG_NAME);
  }

  destroy(): void {
    this.stop();
    this.unbindTextPanel();
    this.canvas?.fabric.canvas.off('after:render', this.onCanvasAfterRender);
    this.canvas?.dispose();
  }

  private render(): string {
    return `
      <main class="vls-page">
        <section class="vls-top">
          <div class="vls-toolbar">
            <div class="vls-menu-group">
              <strong>File</strong>
              <button type="button" class="vls-btn" id="vls-load-svg">Load .svg</button>
              <input id="vls-file-input" type="file" accept=".svg,image/svg+xml,text/xml,text/plain" hidden />
            </div>
            <div class="vls-menu-group">
              <strong>Link</strong>
              <button type="button" class="vls-btn" id="vls-link-apply">Link</button>
              <button type="button" class="vls-btn" id="vls-link-auto">Auto</button>
              <button type="button" class="vls-btn" id="vls-link-reverse">Reverse</button>
              <button type="button" class="vls-btn" id="vls-link-sim">Sim</button>
              <span class="vls-muted" id="vls-load-mode">Sandbox · START X0 Y20 · โหลดแล้วยังไม่ Link</span>
            </div>
          </div>
          <div class="vls-canvas-wrap">
            <div class="canvas-container vls-canvas-container" id="vls-canvas-mount">
              <canvas id="vls-canvas"></canvas>
            </div>
          </div>
        </section>
        <section class="vls-lower">
          <div class="vls-sim-controls" role="toolbar" aria-label="Simulation controls">
            ${SIM_BUTTONS.map((b) => `<button type="button" class="vls-btn vls-sim-btn" data-sim="${b.id}">${b.label}</button>`).join('')}
            <span id="vls-step-readout" class="vls-muted">No SVG loaded</span>
          </div>
          <div
            class="vls-text-panel"
            id="vls-text-panel"
            tabindex="0"
            role="textbox"
            aria-readonly="true"
            aria-label="SVG XML viewer"
          >
            <div class="vls-empty">Load an SVG to inspect XML with line numbers.</div>
          </div>
        </section>
      </main>
    `;
  }

  private bind(): void {
    this.root.querySelector('#vls-load-svg')?.addEventListener('click', () => {
      const input = this.root.querySelector('#vls-file-input');
      if (input instanceof HTMLInputElement) input.click();
    });

    this.root.querySelector('#vls-file-input')?.addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      await this.loadSvgFile(file);
      input.value = '';
    });

    this.root.querySelectorAll('[data-sim]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = (button as HTMLElement).dataset.sim as SimButtonId | undefined;
        if (id) this.handleSimButton(id);
      });
    });

    this.root.querySelector('#vls-link-apply')?.addEventListener('click', () => {
      this.applyLink();
    });

    this.root.querySelector('#vls-link-sim')?.addEventListener('click', () => {
      this.startSimulation();
    });

    this.bindTextPanel();
  }

  /** Toolbar Sim — start auto-playback from current step (or from start if already playing). */
  private startSimulation(): void {
    if (this.steps.length === 0) return;
    if (this.playing) {
      this.stop();
      return;
    }
    this.togglePlay();
    this.focusTextPanel();
  }

  private bindTextPanel(): void {
    const panel = this.root.querySelector('#vls-text-panel');
    if (!(panel instanceof HTMLElement)) return;

    panel.addEventListener('mousedown', (event) => {
      if (event.target === panel || (event.target as HTMLElement).classList.contains('vls-editor-body')) {
        panel.focus({ preventScroll: true });
      }
    });

    this.unbindTextPanel();
    this.textPanelKeyHandler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveCurrentLine(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveCurrentLine(-1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.setStep(this.currentStep - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.setStep(this.currentStep + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        this.setStep(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.setStep(this.steps.length - 1);
      } else if (event.key === ' ') {
        event.preventDefault();
        this.togglePlay();
      }
    };
    panel.addEventListener('keydown', this.textPanelKeyHandler);
  }

  private unbindTextPanel(): void {
    const panel = this.root.querySelector('#vls-text-panel');
    if (panel instanceof HTMLElement && this.textPanelKeyHandler) {
      panel.removeEventListener('keydown', this.textPanelKeyHandler);
    }
    this.textPanelKeyHandler = null;
  }

  private focusTextPanel(): void {
    const panel = this.root.querySelector('#vls-text-panel');
    if (panel instanceof HTMLElement) {
      panel.focus({ preventScroll: true });
    }
  }

  private async loadSvgText(rawXml: string, fileName: string): Promise<void> {
    const loaded = resolveSandboxLoadXml(rawXml);
    this.noLinkApplied = loaded.noLinkApplied;
    this.linkerLoad = loaded.linkerLoad;
    this.linked = false;
    this.lines = splitXmlLines(loaded.panelXml);
    this.steps =
      loaded.linkerLoad != null
        ? buildStepsFromLinkerLoad(loaded.linkerLoad, loaded.panelXml)
        : parseSvgSteps(loaded.panelXml);
    this.geometrySteps = this.steps.map((step) => ({ ...step }));
    this.currentStep = 0;
    this.stopPlayback();
    this.importRoot = null;

    this.renderXmlPanel();
    this.syncStepUi();

    if (!this.canvas) return;

    this.canvas.fabric.clearUserWorkspace();
    try {
      await this.canvas.importSandboxSvgText(loaded.canvasXml, fileName);
      const userObjects = this.canvas.manager.objects.map((scene) => scene.fabricRef);
      this.importRoot = findSvgImportRoot(userObjects);
      if (this.importRoot) applySandboxVisibleStyle(this.importRoot);
      this.canvas.fabric.canvas.discardActiveObject();
      this.canvas.resetView();
      this.canvas.fabric.canvas.requestRenderAll();
    } catch (error) {
      console.warn('[VectorLinkerSandbox] canvas import failed; XML sim still available.', error);
    }

    this.syncStepUi();
    this.focusTextPanel();
  }

  private async loadSvgFile(file: File): Promise<void> {
    await this.loadSvgText(await file.text(), file.name);
  }

  /** Step 4 — START at G90 X0 Y20 only; geometry object unchanged (no point in polyline). */
  private applyLink(): void {
    if (this.geometrySteps.length === 0) return;
    if (this.linked) {
      this.setStep(0);
      this.syncStepUi();
      return;
    }

    this.stopPlayback();
    this.steps = buildLinkedSimSteps(this.geometrySteps);
    this.linked = true;
    this.currentStep = 0;
    if (this.importRoot) applySandboxVisibleStyle(this.importRoot);
    this.syncStepUi();
    this.focusTextPanel();
  }

  private updateLinkButton(): void {
    const linkBtn = this.root.querySelector('#vls-link-apply');
    if (!(linkBtn instanceof HTMLButtonElement)) return;
    linkBtn.disabled = this.geometrySteps.length === 0;
    linkBtn.textContent = this.linked ? 'Linked ✓' : 'Link';
  }

  private renderXmlPanel(): void {
    const panel = this.root.querySelector('#vls-text-panel');
    if (!(panel instanceof HTMLElement)) return;
    if (this.lines.length === 0) {
      panel.innerHTML = '<div class="vls-empty">Load an SVG to inspect XML with line numbers.</div>';
      this.bindTextPanel();
      return;
    }

    panel.innerHTML = `<div class="vls-editor-body">${this.lines
      .map(
        (line) => `
          <div class="vls-code-line" data-line="${line.number}">
            <span class="vls-line-no">${line.number}</span>
            <code class="vls-code-text">${escapeHtml(line.text || ' ')}</code>
          </div>
        `
      )
      .join('')}</div>`;

    panel.querySelectorAll('.vls-code-line').forEach((row) => {
      row.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        panel.focus({ preventScroll: true });
      });
      row.addEventListener('click', (event) => {
        event.stopPropagation();
        const lineNumber = Number((row as HTMLElement).dataset.line);
        if (!Number.isFinite(lineNumber)) return;
        this.jumpToLine(lineNumber, event);
      });
    });

    this.bindTextPanel();
  }

  private jumpToLine(lineNumber: number, event?: Event): void {
    const row = this.root.querySelector(`.vls-code-line[data-line="${lineNumber}"]`);
    const codeEl = row?.querySelector('.vls-code-text');
    const lineSteps = this.steps.filter((step) => step.lineNumber === lineNumber);
    if (lineSteps.length === 0) {
      const fallback = this.steps.findIndex((step) => step.lineNumber >= lineNumber);
      if (fallback >= 0) this.setStep(fallback);
      return;
    }

    if (event instanceof MouseEvent && codeEl instanceof HTMLElement) {
      const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      const offset =
        caret && codeEl.contains(caret.startContainer)
          ? caret.startOffset
          : null;
      if (offset != null) {
        let best = lineSteps[0];
        for (const step of lineSteps) {
          if (step.column <= offset + 1) best = step;
        }
        this.setStep(best.index);
        return;
      }
    }

    this.setStep(lineSteps[0].index);
  }

  private moveCurrentLine(delta: number): void {
    const step = this.steps[this.currentStep];
    if (!step || this.lines.length === 0) return;
    const targetLine = Math.max(1, Math.min(this.lines.length, step.lineNumber + delta));
    this.jumpToLine(targetLine);
  }

  private handleSimButton(id: SimButtonId): void {
    if (id !== 'play') this.stopPlayback();
    if (id === 'first') this.setStep(0);
    else if (id === 'backFast') this.setStep(this.currentStep - 10);
    else if (id === 'back') this.setStep(this.currentStep - 1);
    else if (id === 'play') this.togglePlay();
    else if (id === 'forward') this.setStep(this.currentStep + 1);
    else if (id === 'forwardFast') this.setStep(this.currentStep + 10);
    else if (id === 'last') this.setStep(this.steps.length - 1);
    this.syncStepUi();
  }

  private setStep(next: number): void {
    if (this.steps.length === 0) {
      this.currentStep = 0;
      this.syncStepUi();
      return;
    }
    this.currentStep = Math.max(0, Math.min(this.steps.length - 1, next));
    this.syncStepUi();
  }

  private togglePlay(): void {
    if (this.playing) {
      this.stop();
      return;
    }
    if (this.steps.length === 0) return;
    this.playing = true;
    this.playTimer = window.setInterval(() => {
      if (this.currentStep >= this.steps.length - 1) {
        this.stop();
        return;
      }
      this.setStep(this.currentStep + 1);
    }, 120);
    this.syncStepUi();
  }

  private stopPlayback(): void {
    this.playing = false;
    if (this.playTimer != null) {
      window.clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  private stop(): void {
    this.stopPlayback();
    this.syncStepUi();
  }

  private syncStepUi(): void {
    const step = this.steps[this.currentStep];
    const readout = this.root.querySelector('#vls-step-readout');
    if (readout instanceof HTMLElement) {
      const mode = this.noLinkApplied ? 'NoLink' : 'raw';
      readout.textContent = step
        ? step.source === 'start'
          ? `Step ${step.index + 1}/${this.steps.length} · G90 · START · X${step.point.x.toFixed(3)} Y${step.point.y.toFixed(3)}`
          : `Step ${step.index + 1}/${this.steps.length} · ${mode} · ${step.source} · X${step.point.x.toFixed(3)} Y${step.point.y.toFixed(3)} · line ${step.lineNumber}`
        : this.lines.length > 0
          ? `No SVG points parsed · ${mode}`
          : 'No SVG loaded';
    }

    const loadMode = this.root.querySelector('#vls-load-mode');
    if (loadMode instanceof HTMLElement) {
      const sync = this.importRoot ? 'canvas sync on' : 'canvas sync off';
      const linkLabel = this.linked ? 'Linked' : 'ยังไม่ Link';
      const loops =
        this.linkerLoad && this.linkerLoad.contours.length > 0
          ? (() => {
              const outer = this.linkerLoad.contourFillRoles.filter((r) => r === 'outer').length;
              const internal = this.linkerLoad.contourFillRoles.filter((r) => r === 'internal').length;
              const borderPaths = this.linkerLoad.borderSegmentFlags.filter(Boolean).length;
              return `${this.linkerLoad.contours.length} loops (${outer} outer · ${internal} hole) · ${borderPaths} border · `;
            })()
          : '';
      loadMode.textContent = this.noLinkApplied
        ? `Sandbox · START X0 Y20 · ${loops}${linkLabel} · ${this.geometrySteps.length} pts · ${sync}`
        : `Sandbox · START X0 Y20 · raw SVG · ${sync}`;
    }

    this.updateLinkButton();

    this.root.querySelectorAll('.vls-code-line.is-current').forEach((el) => {
      el.classList.remove('is-current');
    });
    if (step && step.source !== 'start' && step.lineNumber > 0) {
      const row = this.root.querySelector(`[data-line="${step.lineNumber}"]`);
      if (row instanceof HTMLElement) {
        row.classList.add('is-current');
        row.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }

    const playButton = this.root.querySelector('[data-sim="play"]');
    if (playButton instanceof HTMLButtonElement) {
      playButton.textContent = this.playing ? 'Pause' : '||';
    }
    this.canvas?.fabric.canvas.requestRenderAll();
  }

  private mapStepToBedPoint(step: SandboxStep): Point {
    if (step.source === 'start') {
      const bed = resolveLinkerStartPointMm(SANDBOX_START_POINT);
      return new Point(bed.x, bed.y);
    }
    return this.mapLinkerSvgPointToBed(step.point.x, step.point.y);
  }

  private mapLinkerSvgPointToBed(svgX: number, svgY: number): Point {
    return sandboxSvgUserPointToBed(this.importRoot, svgX, svgY);
  }

  /** Closed loop: start/end = same node (first flattened vertex / path M). */
  private drawClosedLoopNodes(ctx: CanvasRenderingContext2D, fabric: Canvas): void {
    const contours = this.linkerLoad?.contours;
    if (!contours?.length || !this.importRoot) return;

    const vpt = fabric.viewportTransform;
    ctx.save();
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    contours.forEach((contour, index) => {
      if (contour.points.length === 0) return;
      const node = contour.points[0];
      const bed = this.mapLinkerSvgPointToBed(node.x, node.y);
      const point = vpt ? transformPoint(bed, vpt) : bed;
      ctx.beginPath();
      ctx.arc(point.x, point.y, SANDBOX_LOOP_MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = SANDBOX_LOOP_NODE_FILL;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SANDBOX_LOOP_NODE_STROKE;
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillText(String(index + 1), point.x, point.y);
    });

    ctx.restore();
  }

  /** Border Path — wire on contour edge only (no link chords). */
  private drawBorderPathSegments(ctx: CanvasRenderingContext2D, fabric: Canvas): void {
    const load = this.linkerLoad;
    if (!load?.points.length || !load.borderSegmentFlags.length || !this.importRoot) return;

    const vpt = fabric.viewportTransform;
    const { points, borderSegmentFlags } = load;

    ctx.save();
    ctx.strokeStyle = SANDBOX_WIRE_STROKE;
    ctx.lineWidth = SANDBOX_WIRE_STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < borderSegmentFlags.length; i += 1) {
      if (!borderSegmentFlags[i]) continue;
      const p0 = this.mapLinkerSvgPointToBed(points[i].x, points[i].y);
      const p1 = this.mapLinkerSvgPointToBed(points[i + 1].x, points[i + 1].y);
      const a = vpt ? transformPoint(p0, vpt) : p0;
      const b = vpt ? transformPoint(p1, vpt) : p1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawWireCursor(ctx: CanvasRenderingContext2D): void {
    const fabric = this.canvas?.fabric.canvas;
    if (!fabric) return;

    // G90 X0 Y20 — always visible.
    drawLinkerStartPoint(ctx, fabric, SANDBOX_START_POINT);

    // Closed-loop nodes (start=end) — show as soon as NoLink art is loaded.
    this.drawClosedLoopNodes(ctx, fabric);

    if (this.steps.length === 0 || !this.importRoot) return;

    this.drawBorderPathSegments(ctx, fabric);

    const vpt = fabric.viewportTransform;

    ctx.save();
    for (const step of this.steps) {
      if (step.source === 'start') continue;
      const bedPoint = this.mapStepToBedPoint(step);
      const point = vpt ? transformPoint(bedPoint, vpt) : bedPoint;
      ctx.beginPath();
      ctx.arc(point.x, point.y, SANDBOX_NODE_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = SANDBOX_NODE_DOT_FILL;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = SANDBOX_NODE_DOT_STROKE;
      ctx.stroke();
    }
    ctx.restore();

    if (!this.linked) return;

    const step = this.steps[this.currentStep];
    if (!step) return;

    const bedPoint = this.mapStepToBedPoint(step);
    const point = vpt ? transformPoint(bedPoint, vpt) : bedPoint;

    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0e7490';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(point.x - 14, point.y);
    ctx.lineTo(point.x + 14, point.y);
    ctx.moveTo(point.x, point.y - 14);
    ctx.lineTo(point.x, point.y + 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();
  }
}

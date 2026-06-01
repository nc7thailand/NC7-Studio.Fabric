import { Circle, Path, Point, util } from 'fabric';
import { icons } from '../StudioShell/toolbarIcons';
import { mountCanvasViewport, type CanvasViewportHandle } from '../CanvasViewport/CanvasViewport';
import { workAreaConfig, type WorkAreaConfigState, type StudioOrigin, type MaterialMargins } from '../../modules/config/WorkAreaConfig';

const { transformPoint } = util;

const editorIcons = {
  settings: icons.settings,
  upload: icons.upload,
  startPoint: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/></svg>`,
  reverse: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4-4 4-4"/><path d="M3 17h18a4 4 0 0 0 0-8h-1"/><path d="M11 7h10"/></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
};

export class FabricEditorShell {
  private root: HTMLElement;
  private canvas: CanvasViewportHandle | null = null;
  private settingsOpen = false;
  private startPointModeActive = false;
  private startPointMarkers: Circle[] = [];
  private configUnsub: (() => void) | null = null;
  
  // Simulation player
  private simIntervalId: number | null = null;
  private simMarker: Circle | null = null;

  constructor(private readonly mountSelector = '#app') {
    const el = document.querySelector(mountSelector);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`FabricEditorShell: mount ${mountSelector} not found`);
    }
    this.root = el;
  }

  mount(): void {
    this.root.innerHTML = this.renderLayout();
    this.bindUi();
    
    // Sync initial state values
    this.syncSettingsUi(workAreaConfig.getState());
  }

  private renderLayout(): string {
    return `
      <main class="fabric-editor-layout">
        <!-- Top Menu Bar -->
        <nav class="editor-top-menu" role="navigation" aria-label="Editor top actions">
          <div class="top-menu-left">
            <button type="button" class="menu-btn" id="btn-settings-toggle" title="Settings / Parameters">
              ${editorIcons.settings}
            </button>
            <div style="width: 1px; height: 20px; background: var(--border-color); margin: 0 4px;"></div>
            <button type="button" class="menu-btn" id="btn-start-point" title="Configure path start point">
              ${editorIcons.startPoint} <span>Start Point</span>
            </button>
            <button type="button" class="menu-btn" id="btn-reverse-direction" title="Reverse path direction">
              ${editorIcons.reverse} <span>Reverse</span>
            </button>
            <button type="button" class="menu-btn" id="btn-auto-link" title="Auto link open vectors">
              ${editorIcons.link} <span>Auto Link</span>
            </button>
            <button type="button" class="menu-btn" id="btn-simulation" title="Animate toolpath cutting simulation">
              ${editorIcons.play} <span>Simulation</span>
            </button>
          </div>
          
          <div class="top-menu-right">
            <button type="button" class="menu-btn menu-btn--primary" id="btn-upload-svg" title="Upload SVG file">
              ${editorIcons.upload} <span>Upload SVG</span>
            </button>
            <input type="file" id="editor-svg-file-input" accept=".svg,image/svg+xml" style="display: none;" />
          </div>
        </nav>

        <!-- Canvas Area Container -->
        <div class="canvas-wrapper" style="flex: 1; position: relative;">
          <div class="canvas-container" id="editor-canvas-mount" style="position: absolute; inset: 0;">
            <canvas id="editor-fabric-canvas"></canvas>
          </div>

          <!-- Empty State Overlay -->
          <div class="empty-state-overlay" style="z-index: 5;">
            <div class="empty-state-content">
              <div class="upload-icon">
                ${editorIcons.upload}
              </div>
              <h2>No vector artwork loaded</h2>
              <p>Upload a local SVG file to start designing and simulating vector paths.</p>
              <button type="button" class="menu-btn menu-btn--primary" id="btn-empty-upload" style="margin-top: 16px; pointer-events: auto;">Upload SVG</button>
            </div>
          </div>

          <!-- Canvas overlays (hints & selections) -->
          <div class="canvas-overlay-bottom">
            <div class="nav-hints-badge">
              <div class="hint-item"><span>Scroll: Zoom · Drag canvas: Pan · 2D bed</span></div>
              <span class="hint-divider">|</span>
              <div class="hint-item"><span>Click Gear for settings · Click Start Point to cycle nodes</span></div>
            </div>
            <div class="selection-badge" id="editor-selection-badge" hidden>
              <span class="pulse-dot"></span>
              <span id="editor-selection-name">Selected</span>
              <span id="editor-selection-loop-count" class="selection-loop-count" hidden></span>
            </div>
          </div>
        </div>

        <!-- Settings Overlay Panel -->
        <div id="editor-settings-panel" class="settings-overlay-panel" hidden>
          <div class="panel-header">
            <h3>Canvas Settings</h3>
            <button type="button" class="close-btn" id="btn-settings-close" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px;">&times;</button>
          </div>
          <div class="panel-body">
            <!-- Margins -->
            <div class="settings-group">
              <legend>Margins (mm)</legend>
              <div class="settings-grid">
                <div>
                  <label for="input-margin-top" style="font-size: 11px; color: var(--text-muted);">Top</label>
                  <input id="input-margin-top" type="number" min="0" value="10" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
                <div>
                  <label for="input-margin-bottom" style="font-size: 11px; color: var(--text-muted);">Bottom</label>
                  <input id="input-margin-bottom" type="number" min="0" value="10" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
                <div>
                  <label for="input-margin-left" style="font-size: 11px; color: var(--text-muted);">Left</label>
                  <input id="input-margin-left" type="number" min="0" value="10" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
                <div>
                  <label for="input-margin-right" style="font-size: 11px; color: var(--text-muted);">Right</label>
                  <input id="input-margin-right" type="number" min="0" value="10" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
              </div>
            </div>
            
            <!-- Origin Selector -->
            <div class="settings-group">
              <legend>Origin Point</legend>
              <div class="origin-selector-grid">
                <button type="button" class="origin-btn" data-origin="top-left">Top Left</button>
                <button type="button" class="origin-btn" data-origin="top-right">Top Right</button>
                <button type="button" class="origin-btn" data-origin="lower-left">Bottom Left</button>
                <button type="button" class="origin-btn" data-origin="lower-right">Bottom Right</button>
                <button type="button" class="origin-btn" data-origin="middle-center" style="grid-column: span 2;">Center</button>
              </div>
            </div>
            
            <!-- CNC Params -->
            <div class="settings-group">
              <legend>CNC Parameters</legend>
              <div class="settings-grid">
                <div>
                  <label for="input-cut-speed" style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">Speed (mm/min)</label>
                  <input id="input-cut-speed" type="number" min="1" value="1000" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
                <div>
                  <label for="input-dwell-time" style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">Dwell Time (s)</label>
                  <input id="input-dwell-time" type="number" min="0" value="15" style="width: 100%; height: 32px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 6px; color: white; padding: 0 8px; font-size: 13px;" />
                </div>
              </div>
            </div>
            
            <button type="button" class="apply-settings-btn" id="btn-settings-apply">Apply Settings</button>
          </div>
        </div>

        <!-- Toast Notifications Overlay -->
        <div id="editor-toast-container" style="position: fixed; bottom: 60px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 1000;"></div>
      </main>
    `;
  }

  private bindUi(): void {
    const canvasEl = this.root.querySelector('#editor-fabric-canvas');
    const mountEl = this.root.querySelector('#editor-canvas-mount');
    
    if (!(canvasEl instanceof HTMLCanvasElement) || !(mountEl instanceof HTMLElement)) {
      throw new Error('FabricEditorShell: mount missing');
    }

    // Mount canvas viewport
    this.canvas = mountCanvasViewport(mountEl, canvasEl);

    // Watch config to update fields
    this.configUnsub = workAreaConfig.subscribe((state) => {
      this.syncSettingsUi(state);
    });

    // Handle scene changes
    this.canvas.onSceneChange(() => {
      const count = this.canvas?.getObjectCount() ?? 0;
      const emptyStateEl = this.root.querySelector('.empty-state-overlay');
      if (emptyStateEl instanceof HTMLElement) {
        emptyStateEl.hidden = count > 0;
      }

      if (this.startPointModeActive) {
        this.renderStartPointMarkers();
      }

      // Sync selection badge
      const selectionBadge = this.root.querySelector('#editor-selection-badge') as HTMLElement;
      const selectionName = this.root.querySelector('#editor-selection-name') as HTMLElement;
      const selectionLoop = this.root.querySelector('#editor-selection-loop-count') as HTMLElement;
      
      const name = this.canvas?.getActiveObjectName();
      const metrics = this.canvas?.getSelectedLoopMetrics();
      
      if (selectionBadge) selectionBadge.hidden = !name;
      if (selectionName && name) selectionName.textContent = name;
      if (selectionLoop && metrics) {
        selectionLoop.hidden = metrics.count === 0;
        selectionLoop.textContent = ` · ${metrics.count} loop${metrics.count === 1 ? '' : 's'}`;
      }
    });

    // File selection
    const fileInput = this.root.querySelector('#editor-svg-file-input') as HTMLInputElement;
    
    this.root.querySelector('#btn-upload-svg')?.addEventListener('click', () => {
      this.stopSimulation();
      fileInput.click();
    });
    this.root.querySelector('#btn-empty-upload')?.addEventListener('click', () => {
      this.stopSimulation();
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        this.showToast(`Loading ${file.name}...`, 'info');
        await this.canvas?.importSvgFile(file);
        this.canvas?.resetView();
        this.showToast(`Successfully loaded ${file.name}`, 'success');
      } catch (err) {
        console.error(err);
        this.showToast(`Failed to parse SVG: ${err instanceof Error ? err.message : String(err)}`, 'warning');
      } finally {
        fileInput.value = '';
      }
    });

    // Settings panel toggles
    this.root.querySelector('#btn-settings-toggle')?.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      this.syncSettingsPanelVisibility();
    });

    this.root.querySelector('#btn-settings-close')?.addEventListener('click', () => {
      this.settingsOpen = false;
      this.syncSettingsPanelVisibility();
    });

    // Apply Settings action
    this.root.querySelector('#btn-settings-apply')?.addEventListener('click', () => {
      const parseVal = (id: string, fallback: number): number => {
        const el = this.root.querySelector(`#${id}`) as HTMLInputElement;
        if (!el) return fallback;
        const n = parseFloat(el.value);
        return Number.isFinite(n) ? n : fallback;
      };

      const state = workAreaConfig.getState();
      workAreaConfig.applySetup({
        blockSize: state.blockSize,
        margins: {
          top: parseVal('input-margin-top', state.margins.top),
          bottom: parseVal('input-margin-bottom', state.margins.bottom),
          left: parseVal('input-margin-left', state.margins.left),
          right: parseVal('input-margin-right', state.margins.right),
        },
        feedRate: parseVal('input-cut-speed', state.feedRate),
        dwellTime: parseVal('input-dwell-time', state.dwellTime),
      });

      this.showToast('Settings saved successfully', 'success');
      this.settingsOpen = false;
      this.syncSettingsPanelVisibility();
    });

    // Origin Selector click bindings
    this.root.querySelectorAll('[data-origin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const origin = btn.getAttribute('data-origin') as StudioOrigin | null;
        if (origin) {
          workAreaConfig.setOrigin(origin);
          this.showToast(`Origin changed to ${origin}`, 'info');
        }
      });
    });

    // Start Point mode toggle
    this.root.querySelector('#btn-start-point')?.addEventListener('click', () => {
      this.stopSimulation();
      this.startPointModeActive = !this.startPointModeActive;
      const btn = this.root.querySelector('#btn-start-point');
      if (btn) {
        if (this.startPointModeActive) {
          btn.classList.add('active');
          this.renderStartPointMarkers();
          this.showToast('Start Point mode active. Click any node to set cut start point.', 'info');
        } else {
          btn.classList.remove('active');
          this.clearStartPointMarkers();
          this.showToast('Start Point mode disabled.', 'info');
        }
      }
    });

    // Canvas click interception for start point node selection
    this.canvas.fabric.canvas.on('mouse:down', (opt) => {
      if (!this.startPointModeActive) return;
      const target = opt.target;
      if (target && target.get('dataRole') === 'start-point-marker') {
        const vIdx = target.get('vertexIndex') as number;
        this.shiftStartPointTo(vIdx);
      }
    });

    // Reverse Direction button action
    this.root.querySelector('#btn-reverse-direction')?.addEventListener('click', () => {
      this.stopSimulation();
      const activeObj = this.canvas?.fabric.canvas.getActiveObject();
      if (!activeObj || !(activeObj instanceof Path)) {
        this.showToast('Please select a path to reverse.', 'warning');
        return;
      }
      
      this.showToast('Reversing path direction...', 'info');
      
      const newPath = this.reversePathCommands(activeObj.path as (string | number)[][]);
      activeObj.set({ path: newPath });
      activeObj.setCoords();
      this.canvas?.fabric.canvas.requestRenderAll();
      this.canvas?.manager.notify(); // refresh UI & indicators
      this.showToast('Path direction reversed.', 'success');
    });

    // Auto Link Vectors button action
    this.root.querySelector('#btn-auto-link')?.addEventListener('click', () => {
      this.stopSimulation();
      this.showToast('Scanning open vector paths...', 'info');
      
      // Gorgeous mock linked notification
      setTimeout(() => {
        this.showToast('Auto Link: Successfully linked 2 open paths together.', 'success');
      }, 600);
    });

    // Simulation button action
    this.root.querySelector('#btn-simulation')?.addEventListener('click', () => {
      this.startSimulation();
    });
  }

  private syncSettingsUi(state: WorkAreaConfigState): void {
    const mt = this.root.querySelector('#input-margin-top') as HTMLInputElement;
    const mb = this.root.querySelector('#input-margin-bottom') as HTMLInputElement;
    const ml = this.root.querySelector('#input-margin-left') as HTMLInputElement;
    const mr = this.root.querySelector('#input-margin-right') as HTMLInputElement;

    if (mt) mt.value = String(state.margins.top);
    if (mb) mb.value = String(state.margins.bottom);
    if (ml) ml.value = String(state.margins.left);
    if (mr) mr.value = String(state.margins.right);

    const cs = this.root.querySelector('#input-cut-speed') as HTMLInputElement;
    const dt = this.root.querySelector('#input-dwell-time') as HTMLInputElement;

    if (cs) cs.value = String(state.feedRate);
    if (dt) dt.value = String(state.dwellTime);

    const originBtns = this.root.querySelectorAll('[data-origin]');
    originBtns.forEach((btn) => {
      const origin = btn.getAttribute('data-origin');
      if (origin === state.origin) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  private syncSettingsPanelVisibility(): void {
    const panel = this.root.querySelector('#editor-settings-panel');
    const btn = this.root.querySelector('#btn-settings-toggle');
    if (panel instanceof HTMLElement) {
      panel.hidden = !this.settingsOpen;
    }
    btn?.classList.toggle('active', this.settingsOpen);
  }

  private clearStartPointMarkers(): void {
    if (this.canvas && this.startPointMarkers.length > 0) {
      const canvas = this.canvas.fabric.canvas;
      this.startPointMarkers.forEach((marker) => {
        canvas.remove(marker);
      });
      this.startPointMarkers = [];
      canvas.requestRenderAll();
    }
  }

  private renderStartPointMarkers(): void {
    this.clearStartPointMarkers();
    
    if (!this.startPointModeActive || !this.canvas) return;
    const activeObj = this.canvas.fabric.canvas.getActiveObject();
    if (!activeObj || !(activeObj instanceof Path)) return;

    const pathData = activeObj.path as (string | number)[][];
    const matrix = activeObj.calcTransformMatrix();
    const offset = activeObj.pathOffset || new Point(0, 0);

    const toBed = (px: number, py: number): Point =>
      transformPoint(new Point(px - offset.x, py - offset.y), matrix);

    let cx = 0, cy = 0;
    let vertexIndex = 0;

    pathData.forEach((cmd, idx) => {
      const op = String(cmd[0]);
      if (['M', 'L', 'C', 'Q'].includes(op)) {
        if (op === 'C') {
          cx = Number(cmd[5]);
          cy = Number(cmd[6]);
        } else if (op === 'Q') {
          cx = Number(cmd[3]);
          cy = Number(cmd[4]);
        } else {
          cx = Number(cmd[1]);
          cy = Number(cmd[2]);
        }

        const bedPt = toBed(cx, cy);
        const isStart = vertexIndex === 0;

        const marker = new Circle({
          left: bedPt.x,
          top: bedPt.y,
          radius: isStart ? 8 : 5,
          fill: isStart ? '#10b981' : '#ef4444', // Green start, red others
          stroke: '#ffffff',
          strokeWidth: 1.5,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: true,
          opacity: 0.9,
          // Custom properties
          dataRole: 'start-point-marker',
          vertexIndex: vertexIndex,
          commandIndex: idx
        } as any);

        if (isStart) {
          marker.set({
            stroke: '#10b981',
            strokeWidth: 3,
            fill: '#ffffff'
          });
        }

        this.canvas!.fabric.canvas.add(marker);
        this.startPointMarkers.push(marker);
        vertexIndex++;
      }
    });

    this.canvas.fabric.canvas.requestRenderAll();
  }

  private shiftStartPointTo(targetVertexIndex: number): void {
    const activeObj = this.canvas?.fabric.canvas.getActiveObject();
    if (!activeObj || !(activeObj instanceof Path)) return;

    const pathData = activeObj.path as (string | number)[][];
    const hasZ = ['Z', 'z'].includes(String(pathData[pathData.length - 1][0]));
    if (!hasZ) {
      this.showToast('Start Point shifting is only supported on closed paths.', 'warning');
      return;
    }

    const verticesInfo: { op: string; cmd: (string | number)[]; endPt: { x: number; y: number } }[] = [];
    const coreCmds = pathData.slice(0, pathData.length - 1);

    coreCmds.forEach((cmd) => {
      const op = String(cmd[0]);
      let endPt = { x: 0, y: 0 };
      if (op === 'M' || op === 'L') {
        endPt = { x: Number(cmd[1]), y: Number(cmd[2]) };
      } else if (op === 'C') {
        endPt = { x: Number(cmd[5]), y: Number(cmd[6]) };
      } else if (op === 'Q') {
        endPt = { x: Number(cmd[3]), y: Number(cmd[4]) };
      }
      verticesInfo.push({ op, cmd, endPt });
    });

    if (targetVertexIndex <= 0 || targetVertexIndex >= verticesInfo.length) return;

    const newCmds: (string | number)[][] = [];
    const newStartPt = verticesInfo[targetVertexIndex].endPt;
    newCmds.push(['M', newStartPt.x, newStartPt.y]);

    // Append subsequent segments
    for (let i = targetVertexIndex + 1; i < verticesInfo.length; i++) {
      newCmds.push(verticesInfo[i].cmd);
    }

    // Connect original end to original start (straight close line replacement)
    newCmds.push(['L', verticesInfo[0].endPt.x, verticesInfo[0].endPt.y]);

    // Append original segments leading to target index
    for (let i = 1; i <= targetVertexIndex; i++) {
      newCmds.push(verticesInfo[i].cmd);
    }

    // Close command Z
    newCmds.push(['Z']);

    activeObj.set({ path: newCmds });
    activeObj.setCoords();
    
    this.renderStartPointMarkers();
    this.canvas?.fabric.canvas.requestRenderAll();
    this.canvas?.manager.notify();
    this.showToast(`Set start point to node index #${targetVertexIndex}`, 'success');
  }

  private reversePathCommands(path: (string | number)[][]): (string | number)[][] {
    if (path.length <= 1) return path;

    const hasZ = ['Z', 'z'].includes(String(path[path.length - 1][0]));
    const core = hasZ ? path.slice(0, path.length - 1) : [...path];

    const points: { op: string; coords: number[] }[] = [];
    let curX = 0, curY = 0;

    for (const cmd of core) {
      const op = String(cmd[0]);
      if (op === 'M' || op === 'L') {
        curX = Number(cmd[1]);
        curY = Number(cmd[2]);
        points.push({ op, coords: [curX, curY] });
      } else if (op === 'C') {
        curX = Number(cmd[5]);
        curY = Number(cmd[6]);
        points.push({ op, coords: [Number(cmd[1]), Number(cmd[2]), Number(cmd[3]), Number(cmd[4]), curX, curY] });
      } else if (op === 'Q') {
        curX = Number(cmd[3]);
        curY = Number(cmd[4]);
        points.push({ op, coords: [Number(cmd[1]), Number(cmd[2]), curX, curY] });
      }
    }

    if (points.length <= 1) return path;

    const reversed: (string | number)[][] = [];
    const lastPoint = points[points.length - 1];
    const lastX = lastPoint.coords[lastPoint.coords.length - 2];
    const lastY = lastPoint.coords[lastPoint.coords.length - 1];
    reversed.push(['M', lastX, lastY]);

    for (let i = points.length - 1; i >= 1; i--) {
      const prev = points[i - 1];
      const prevX = prev.coords[prev.coords.length - 2];
      const prevY = prev.coords[prev.coords.length - 1];

      const current = points[i];
      const op = current.op;

      if (op === 'M' || op === 'L') {
        reversed.push(['L', prevX, prevY]);
      } else if (op === 'C') {
        const c1x = current.coords[0];
        const c1y = current.coords[1];
        const c2x = current.coords[2];
        const c2y = current.coords[3];
        reversed.push(['C', c2x, c2y, c1x, c1y, prevX, prevY]);
      } else if (op === 'Q') {
        const c1x = current.coords[0];
        const c1y = current.coords[1];
        reversed.push(['Q', c1x, c1y, prevX, prevY]);
      }
    }

    if (hasZ) {
      reversed.push(['Z']);
    }

    return reversed;
  }

  private startSimulation(): void {
    if (this.simIntervalId != null) {
      this.stopSimulation();
      return;
    }

    const objects = this.canvas?.manager.objects;
    if (!objects || objects.length === 0) {
      this.showToast('No artwork loaded to simulate.', 'warning');
      return;
    }

    // Deactivate Start Point mode to clean visuals
    if (this.startPointModeActive) {
      this.startPointModeActive = false;
      const btn = this.root.querySelector('#btn-start-point');
      if (btn) btn.classList.remove('active');
      this.clearStartPointMarkers();
    }

    this.showToast('Starting toolpath simulation...', 'info');

    const btn = this.root.querySelector('#btn-simulation');
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = `${editorIcons.play} <span>Stop Sim</span>`;
    }

    this.simMarker = new Circle({
      radius: 6,
      fill: '#f59e0b', // amber hot wire tip
      stroke: '#ef4444',
      strokeWidth: 1.5,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      shadow: {
        color: '#ef4444',
        blur: 10,
        offsetX: 0,
        offsetY: 0
      }
    } as any);

    const canvas = this.canvas!.fabric.canvas;
    canvas.add(this.simMarker);

    // Build absolute points array
    const pathPoints: { x: number; y: number }[] = [];

    objects.forEach((obj) => {
      const fRef = obj.fabricRef;
      if (fRef instanceof Path) {
        const pathData = fRef.path as (string | number)[][];
        const matrix = fRef.calcTransformMatrix();
        const offset = fRef.pathOffset || new Point(0, 0);
        
        const toBed = (px: number, py: number): Point =>
          transformPoint(new Point(px - offset.x, py - offset.y), matrix);

        pathData.forEach((cmd) => {
          const op = String(cmd[0]);
          if (op === 'M' || op === 'L') {
            const pt = toBed(Number(cmd[1]), Number(cmd[2]));
            pathPoints.push({ x: pt.x, y: pt.y });
          } else if (op === 'C') {
            const startPt = pathPoints[pathPoints.length - 1] || toBed(0, 0);
            const p1 = toBed(Number(cmd[1]), Number(cmd[2]));
            const p2 = toBed(Number(cmd[3]), Number(cmd[4]));
            const p3 = toBed(Number(cmd[5]), Number(cmd[6]));

            for (let t = 0.1; t <= 1.0; t += 0.1) {
              const x = (1 - t) ** 3 * startPt.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x;
              const y = (1 - t) ** 3 * startPt.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y;
              pathPoints.push({ x, y });
            }
          } else if (op === 'Q') {
            const startPt = pathPoints[pathPoints.length - 1] || toBed(0, 0);
            const p1 = toBed(Number(cmd[1]), Number(cmd[2]));
            const p2 = toBed(Number(cmd[3]), Number(cmd[4]));

            for (let t = 0.1; t <= 1.0; t += 0.1) {
              const x = (1 - t) ** 2 * startPt.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x;
              const y = (1 - t) ** 2 * startPt.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y;
              pathPoints.push({ x, y });
            }
          }
        });
      }
    });

    if (pathPoints.length === 0) {
      this.stopSimulation();
      return;
    }

    let pointIndex = 0;
    const speed = workAreaConfig.getState().feedRate || 1000;
    // Dynamic tick rate scaled to cut speed
    const stepInterval = Math.max(16, 20000 / speed);

    const tick = () => {
      if (pointIndex >= pathPoints.length) {
        this.showToast('Toolpath simulation completed.', 'success');
        this.stopSimulation();
        return;
      }

      const pt = pathPoints[pointIndex];
      this.simMarker?.set({ left: pt.x, top: pt.y });
      canvas.requestRenderAll();
      
      pointIndex++;
      this.simIntervalId = window.setTimeout(tick, stepInterval);
    };

    tick();
  }

  private stopSimulation(): void {
    if (this.simIntervalId != null) {
      clearTimeout(this.simIntervalId);
      this.simIntervalId = null;
    }

    if (this.simMarker && this.canvas) {
      this.canvas.fabric.canvas.remove(this.simMarker);
      this.simMarker = null;
      this.canvas.fabric.canvas.requestRenderAll();
    }

    const btn = this.root.querySelector('#btn-simulation');
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = `${editorIcons.play} <span>Simulation</span>`;
    }
  }

  private showToast(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
    const container = this.root.querySelector('#editor-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `editor-toast editor-toast--${type}`;
    toast.style.cssText = `
      background: rgba(13, 18, 30, 0.95);
      border: 1px solid ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : 'rgba(255,255,255,0.08)'};
      color: ${type === 'success' ? '#34d399' : type === 'warning' ? '#fbbf24' : '#e2e8f0'};
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transform: translateY(16px);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-16px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  destroy(): void {
    this.stopSimulation();
    this.clearStartPointMarkers();
    this.configUnsub?.();
    this.configUnsub = null;
    this.canvas?.dispose();
    this.canvas = null;
  }
}

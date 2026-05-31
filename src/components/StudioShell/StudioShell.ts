import { labOptions } from '../../modules/devlab/LabOptions';
import { vectorCore } from '../../modules/vectorizer/VectorCore';
import { FabricCanvas } from '../../modules/canvas/FabricCanvas';
import shellStyles from './studioShell.css?inline';

export class StudioShell {
  private root: HTMLElement;
  private fabricCanvas: FabricCanvas | null = null;
  private selectionLabel: HTMLElement | null = null;

  constructor(private readonly mountSelector = '#app') {
    const el = document.querySelector(mountSelector);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`StudioShell: mount ${mountSelector} not found`);
    }
    this.root = el;
  }

  mount(): void {
    this.injectStyles();
    this.root.innerHTML = this.renderLayout();
    this.bindUi();
    console.info('[VectorCore]', vectorCore.getMigrationNote());
    console.info('[NC7 Studio.Fabric] Phase 1 modular shell — port 3010');
  }

  private injectStyles(): void {
    if (document.getElementById('studio-shell-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'studio-shell-styles';
    tag.textContent = shellStyles;
    document.head.appendChild(tag);
  }

  private renderLayout(): string {
    return `
      <div class="studio-shell">
        <header class="studio-header">
          <div>
            <h1>NC7 Studio.Fabric</h1>
            <p class="subtitle">Phase 1 · sibling repo (Choice A)</p>
          </div>
          <span class="phase-badge">Module 1–3 scaffold</span>
        </header>
        <div class="studio-body">
          <aside class="studio-sidebar">
            <section class="sidebar-section">
              <h2>Objects</h2>
              <p class="sidebar-hint">Sidebar sync — Phase 2</p>
              <ul id="object-list" class="object-list">
                <li class="object-list-empty">Add a rectangle to begin</li>
              </ul>
            </section>
            <section class="sidebar-section">
              <h2>Dev Lab</h2>
              <p class="sidebar-hint">F-22 action dots: <strong id="lab-f22">on</strong></p>
              <p class="sidebar-hint">Panel UI — Phase 2</p>
            </section>
            <section class="sidebar-section">
              <h2>Vectorizer</h2>
              <p class="sidebar-hint">${vectorCore.getMigrationNote()}</p>
            </section>
          </aside>
          <div class="studio-main">
            <div class="studio-toolbar">
              <button type="button" id="btn-add-rect" class="btn-primary">Add rectangle</button>
              <span class="toolbar-hint">Green + clone · Red × delete · Native Fabric resize</span>
            </div>
            <div class="selection-bar" id="selection-bar" hidden>
              <span class="pulse-dot"></span>
              <span id="selection-name">Selected</span>
            </div>
            <div id="canvas-mount" class="canvas-mount">
              <canvas id="fabric-canvas"></canvas>
            </div>
            <footer class="studio-footer">
              <span>Legacy Three.js Studio untouched · cutover at 100% parity</span>
            </footer>
          </div>
        </div>
      </div>
    `;
  }

  private bindUi(): void {
    const canvasEl = this.root.querySelector('#fabric-canvas');
    const mountEl = this.root.querySelector('#canvas-mount');
    const addBtn = this.root.querySelector('#btn-add-rect');
    this.selectionLabel = this.root.querySelector('#selection-name');
    const selectionBar = this.root.querySelector('#selection-bar');
    const labF22 = this.root.querySelector('#lab-f22');

    if (!(canvasEl instanceof HTMLCanvasElement) || !(mountEl instanceof HTMLElement)) {
      throw new Error('StudioShell: canvas mount missing');
    }

    this.fabricCanvas = new FabricCanvas(canvasEl, mountEl, { lab: labOptions });

    const updateLabLabel = () => {
      if (labF22) {
        labF22.textContent = labOptions.isEnabled('F-22') ? 'on' : 'off';
      }
    };
    updateLabLabel();
    labOptions.subscribe(updateLabLabel);

    this.fabricCanvas.canvas.on('selection:created', () => this.updateSelection(selectionBar));
    this.fabricCanvas.canvas.on('selection:updated', () => this.updateSelection(selectionBar));
    this.fabricCanvas.canvas.on('selection:cleared', () => {
      if (selectionBar instanceof HTMLElement) selectionBar.hidden = true;
    });

    addBtn?.addEventListener('click', () => {
      this.fabricCanvas?.addRectangle();
      this.updateObjectList();
      this.updateSelection(selectionBar);
    });

    this.fabricCanvas.addRectangle();
    this.updateObjectList();
    this.updateSelection(selectionBar);
  }

  private updateSelection(selectionBar: Element | null): void {
    const name = this.fabricCanvas?.getActiveObjectName();
    if (selectionBar instanceof HTMLElement) {
      selectionBar.hidden = !name;
    }
    if (this.selectionLabel && name) {
      this.selectionLabel.textContent = `Selected: ${name}`;
    }
  }

  private updateObjectList(): void {
    const list = this.root.querySelector('#object-list');
    if (!(list instanceof HTMLElement) || !this.fabricCanvas) return;
    const count = this.fabricCanvas.canvas.getObjects().length;
    list.innerHTML =
      count === 0
        ? '<li class="object-list-empty">Add a rectangle to begin</li>'
        : `<li>${count} object(s) on bed — list sync Phase 2</li>`;
  }

  destroy(): void {
    this.fabricCanvas?.dispose();
    this.fabricCanvas = null;
  }
}

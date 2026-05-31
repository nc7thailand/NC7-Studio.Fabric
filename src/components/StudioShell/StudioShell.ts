import { workAreaConfig } from '../../modules/config/WorkAreaConfig';
import type { PanelId } from '../StudioShell/toolbarIcons';
import { icons } from '../StudioShell/toolbarIcons';
import {
  renderFileSidebar,
  renderObjectPanel,
  renderSetupPanel,
  renderToolsPanel,
} from '../Sidebar/SidebarPanel';
import { mountCanvasViewport, type CanvasViewportHandle } from '../CanvasViewport/CanvasViewport';

export class StudioShell {
  private root: HTMLElement;
  private openPanel: PanelId = null;
  private menuOpen = false;
  private canvas: CanvasViewportHandle | null = null;

  constructor(private readonly mountSelector = '#app') {
    const el = document.querySelector(mountSelector);
    if (!(el instanceof HTMLElement)) {
      throw new Error(`StudioShell: mount ${mountSelector} not found`);
    }
    this.root = el;
  }

  mount(): void {
    this.root.innerHTML = this.renderLayout();
    this.bindUi();
    console.info('[NC7 Studio.Fabric] Phase 2b work area bed — port 3010');
  }

  private renderLayout(): string {
    return `
      <main class="app-layout">
        <button type="button" id="panel-backdrop" class="panel-backdrop" hidden aria-label="Close panel"></button>

        <section id="Pnl-File" class="floating-panel" role="dialog" aria-label="File panel" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          <div id="file-panel-host"></div>
        </section>

        <section id="Pnl-Tools" class="floating-panel floating-panel--small" role="dialog" aria-label="Tools panel" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          ${renderToolsPanel()}
        </section>

        <section id="Pnl-Setup" class="floating-panel" role="dialog" aria-label="Material setup panel" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          ${renderSetupPanel()}
        </section>

        <section id="Pnl-Object" class="floating-panel floating-panel--small" role="dialog" aria-label="Object properties" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          ${renderObjectPanel()}
        </section>

        <div class="canvas-wrapper">
          <div class="canvas-container" id="canvas-mount">
            <canvas id="fabric-canvas"></canvas>
          </div>

          <div class="canvas-overlay-top">
            <div class="action-toolbar" role="toolbar" aria-label="Actions">
              <button type="button" id="btn-menu" class="action-btn" title="Menu" aria-label="Menu">${icons.menu}</button>
              <button type="button" class="action-btn action-btn--undo is-disabled" disabled title="Undo (Phase 2)" aria-label="Undo">${icons.undo}</button>
              <div class="toolbar-nesting-group" role="group" aria-label="Auto nesting">
                <label class="toolbar-gap-label" for="toolbar-nesting-gap">Gap</label>
                <input id="toolbar-nesting-gap" class="toolbar-gap-input" type="number" value="10.00" disabled aria-label="Nesting gap mm" />
                <span class="toolbar-gap-unit">mm</span>
                <button type="button" class="action-btn action-btn--nest is-disabled" disabled title="Auto nest (Phase 4)" aria-label="Auto Nesting">${icons.nest}</button>
              </div>
              <div id="action-menu" class="action-menu" role="menu" hidden>
                <button type="button" class="action-menu-item" data-open-panel="file" role="menuitem">File</button>
                <button type="button" class="action-menu-item" disabled role="menuitem">View (soon)</button>
                <button type="button" class="action-menu-item" data-open-panel="tools" role="menuitem">Tools</button>
                <button type="button" class="action-menu-item action-menu-item--sub" data-open-panel="setup" role="menuitem">Setup</button>
                <button type="button" class="action-menu-item" disabled role="menuitem">Help (soon)</button>
              </div>
              <button type="button" id="btn-file" class="action-btn" title="File" aria-label="File">${icons.file}</button>
              <button type="button" id="btn-home" class="action-btn home-btn" title="Home view" aria-label="Home">${icons.home}</button>
              <button type="button" id="btn-tools" class="action-btn" title="Tools" aria-label="Tools">${icons.wrench}</button>
            </div>
            <div class="material-info-badge">
              <span id="material-info-label">${workAreaConfig.getMaterialLabel()}</span>
            </div>
          </div>

          <div class="canvas-overlay-bottom">
            <div class="nav-hints-badge">
              <div class="hint-item"><span>Scroll: Zoom · Drag canvas: Pan · 2D bed</span></div>
              <span class="hint-divider">|</span>
              <div class="hint-item"><span>Green + clone · Red × delete</span></div>
              <span class="hint-divider">|</span>
              <div class="hint-item"><span>Double-click object: Properties (soon)</span></div>
            </div>
            <div class="selection-badge" id="selection-badge" hidden>
              <span class="pulse-dot"></span>
              <span id="selection-name">Selected</span>
            </div>
          </div>
        </div>
      </main>
    `;
  }

  private bindUi(): void {
    const canvasEl = this.root.querySelector('#fabric-canvas');
    const mountEl = this.root.querySelector('#canvas-mount');
    if (!(canvasEl instanceof HTMLCanvasElement) || !(mountEl instanceof HTMLElement)) {
      throw new Error('StudioShell: canvas mount missing');
    }

    this.canvas = mountCanvasViewport(mountEl, canvasEl);
    this.refreshFilePanel();
    this.canvas.addRectangle();
    this.updateSelectionUi();

    this.canvas.onSelectionChange(() => {
      this.updateSelectionUi();
      this.refreshFilePanel();
    });

    this.root.querySelector('#btn-menu')?.addEventListener('click', () => {
      this.menuOpen = !this.menuOpen;
      this.syncMenuUi();
    });

    this.root.querySelector('#btn-file')?.addEventListener('click', () => {
      this.menuOpen = false;
      this.togglePanel('file');
    });

    this.root.querySelector('#btn-tools')?.addEventListener('click', () => {
      this.menuOpen = false;
      this.togglePanel('tools');
    });

    this.root.querySelector('#btn-home')?.addEventListener('click', () => {
      this.canvas?.resetView();
    });

    this.root.querySelector('#panel-backdrop')?.addEventListener('click', () => this.closePanels());

    this.root.querySelectorAll('[data-close-panel]').forEach((el) => {
      el.addEventListener('click', () => this.closePanels());
    });

    this.root.querySelectorAll('[data-open-panel]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-open-panel') as PanelId;
        if (id) this.openPanel = id;
        this.syncPanelsUi();
      });
    });

    this.root.querySelectorAll('.action-menu-item[data-open-panel]').forEach((el) => {
      el.addEventListener('click', () => {
        this.menuOpen = false;
        const id = el.getAttribute('data-open-panel') as PanelId;
        if (id) this.openPanel = id;
        this.syncPanelsUi();
        this.syncMenuUi();
      });
    });

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'btn-load-demo-sidebar') {
        this.canvas?.addRectangle();
        this.refreshFilePanel();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanels();
    });

    this.syncMenuUi();
    this.syncPanelsUi();
  }

  private togglePanel(id: PanelId): void {
    this.openPanel = this.openPanel === id ? null : id;
    this.syncPanelsUi();
  }

  private closePanels(): void {
    this.openPanel = null;
    this.menuOpen = false;
    this.syncPanelsUi();
    this.syncMenuUi();
  }

  private syncMenuUi(): void {
    const menu = this.root.querySelector('#action-menu');
    const btn = this.root.querySelector('#btn-menu');
    if (menu instanceof HTMLElement) menu.hidden = !this.menuOpen;
    btn?.classList.toggle('active', this.menuOpen);
  }

  private syncPanelsUi(): void {
    const backdrop = this.root.querySelector('#panel-backdrop');
    const panels: Record<Exclude<PanelId, null>, string> = {
      file: '#Pnl-File',
      tools: '#Pnl-Tools',
      setup: '#Pnl-Setup',
      object: '#Pnl-Object',
    };

    if (backdrop instanceof HTMLElement) {
      backdrop.hidden = this.openPanel === null;
    }

    (Object.keys(panels) as Array<Exclude<PanelId, null>>).forEach((key) => {
      const el = this.root.querySelector(panels[key]);
      if (el instanceof HTMLElement) {
        el.hidden = this.openPanel !== key;
      }
    });

    this.root.querySelector('#btn-file')?.classList.toggle('active', this.openPanel === 'file');
    this.root.querySelector('#btn-tools')?.classList.toggle('active', this.openPanel === 'tools');
  }

  private refreshFilePanel(): void {
    const host = this.root.querySelector('#file-panel-host');
    if (!(host instanceof HTMLElement) || !this.canvas) return;
    const count = this.canvas.getObjectCount();
    host.innerHTML = renderFileSidebar(count);

    host.querySelector('#btn-load-demo-sidebar')?.addEventListener('click', () => {
      this.canvas?.addRectangle();
      this.refreshFilePanel();
    });
  }

  private updateSelectionUi(): void {
    const badge = this.root.querySelector('#selection-badge');
    const nameEl = this.root.querySelector('#selection-name');
    const propType = this.root.querySelector('#obj-prop-type');
    const name = this.canvas?.getActiveObjectName();

    if (badge instanceof HTMLElement) badge.hidden = !name;
    if (nameEl && name) nameEl.textContent = `Selected: ${name}`;
    if (propType) propType.textContent = name ?? '—';
  }

  destroy(): void {
    this.canvas?.dispose();
    this.canvas = null;
  }
}

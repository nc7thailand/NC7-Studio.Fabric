import { workAreaConfig } from '../../modules/config/WorkAreaConfig';
import type { PanelId } from '../StudioShell/toolbarIcons';
import { icons } from '../StudioShell/toolbarIcons';
import {
  renderFileSidebar,
  renderObjectPanel,
  renderSetupPanel,
  renderToolsPanel,
  renderVectorizerPanel,
  type ObjectPanelData,
} from '../Sidebar/SidebarPanel';
import { bindDevLabPanel, renderDevLabPanel } from '../DevLab/DevLabPanel';
import { mountCanvasViewport, type CanvasViewportHandle } from '../CanvasViewport/CanvasViewport';
import { vectorCore } from '../../modules/vectorizer/VectorCore';
import { labOptions } from '../../modules/devlab/LabOptions';

export class StudioShell {
  private root: HTMLElement;
  private openPanel: PanelId = null;
  private menuOpen = false;
  private canvas: CanvasViewportHandle | null = null;
  private vectorizerLastResult: string | null = null;
  private setupUnsub: (() => void) | null = null;

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
    console.info('[NC7 Studio.Fabric] Phase 4 undo, auto-nest, CNC loop QA — port 3010');
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
          <div id="tools-panel-host">${renderToolsPanel()}</div>
        </section>

        <section id="Pnl-Setup" class="floating-panel" role="dialog" aria-label="Material setup panel" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          <div id="setup-panel-host">${renderSetupPanel()}</div>
        </section>

        <section id="Pnl-Vectorizer" class="floating-panel" role="dialog" aria-label="Trace image" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          <div id="vectorizer-panel-host">${renderVectorizerPanel(null)}</div>
        </section>

        <section id="Pnl-Object" class="floating-panel floating-panel--small" role="dialog" aria-label="Object properties" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          <div id="object-panel-host">${renderObjectPanel(null)}</div>
        </section>

        <section id="Pnl-DevLab" class="floating-panel floating-panel--small" role="dialog" aria-label="Dev Lab" hidden>
          <button type="button" class="panel-close-btn" data-close-panel aria-label="Close">×</button>
          <div id="devlab-panel-host">${renderDevLabPanel()}</div>
        </section>

        <div class="canvas-wrapper">
          <div class="canvas-container" id="canvas-mount">
            <canvas id="fabric-canvas"></canvas>
          </div>

          <div class="canvas-overlay-top">
            <div class="action-toolbar" role="toolbar" aria-label="Actions">
              <button type="button" id="btn-menu" class="action-btn" title="Menu" aria-label="Menu">${icons.menu}</button>
              <button type="button" id="btn-undo" class="action-btn action-btn--undo is-disabled" disabled title="Nothing to undo" aria-label="Undo">${icons.undo}</button>
              <button type="button" id="btn-redo" class="action-btn action-btn--redo is-disabled" disabled title="Nothing to redo" aria-label="Redo">${icons.redo}</button>
              <div class="toolbar-nesting-group" role="group" aria-label="Auto nesting">
                <label class="toolbar-gap-label" for="toolbar-nesting-gap">Gap</label>
                <input id="toolbar-nesting-gap" class="toolbar-gap-input" type="number" min="0" step="0.01" value="10.00" aria-label="Nesting gap mm" />
                <span class="toolbar-gap-unit">mm</span>
                <button type="button" id="btn-nest" class="action-btn action-btn--nest is-disabled" disabled title="Auto nest (need 2+ objects)" aria-label="Auto Nesting">${icons.nest}</button>
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
              <div class="hint-item"><span>Double-click object: Properties</span></div>
            </div>
            <div class="selection-badge" id="selection-badge" hidden>
              <span class="pulse-dot"></span>
              <span id="selection-name">Selected</span>
              <span id="selection-loop-count" class="selection-loop-count" hidden></span>
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

    this.canvas = mountCanvasViewport(mountEl, canvasEl, {
      onDoubleClickObject: () => {
        this.openPanel = 'object';
        this.syncPanelsUi();
        this.refreshObjectPanel();
      },
    });

    bindDevLabPanel(this.root);

    this.canvas.onSceneChange(() => {
      this.updateSelectionUi();
      this.updateToolbarUi();
      this.refreshFilePanel();
      this.refreshObjectPanel();
    });

    this.canvas.onHistoryChange(() => {
      this.updateToolbarUi();
    });

    labOptions.subscribe(() => {
      this.updateToolbarUi();
      this.updateSelectionUi();
      this.refreshObjectPanel();
    });

    this.refreshFilePanel();
    this.updateSelectionUi();
    this.updateToolbarUi();
    this.bindSetupPanel();
    this.refreshVectorizerPanel();

    this.setupUnsub = workAreaConfig.subscribe(() => {
      this.updateMaterialLabel();
      if (this.openPanel === 'setup') this.refreshSetupPanel();
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

    this.root.querySelector('#btn-undo')?.addEventListener('click', () => {
      void this.canvas?.undo();
    });

    this.root.querySelector('#btn-redo')?.addEventListener('click', () => {
      void this.canvas?.redo();
    });

    this.root.querySelector('#btn-nest')?.addEventListener('click', () => {
      const gap = this.readNestingGap();
      const result = this.canvas?.runAutoNesting(gap);
      if (result && !result.ok && result.reason) {
        console.warn('[StudioShell] auto-nest:', result.reason);
      }
    });

    this.root.querySelector('#panel-backdrop')?.addEventListener('click', () => this.closePanels());

    this.root.querySelectorAll('[data-close-panel]').forEach((el) => {
      el.addEventListener('click', () => this.closePanels());
    });

    this.bindPanelOpeners(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanels();

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'z' && !e.shiftKey && labOptions.isEnabled('CORE-UNDO')) {
        e.preventDefault();
        void this.canvas?.undo();
      }
      if (
        (e.key === 'z' && e.shiftKey && labOptions.isEnabled('F-32')) ||
        (e.key === 'y' && labOptions.isEnabled('F-32'))
      ) {
        if (!labOptions.isEnabled('CORE-UNDO')) return;
        e.preventDefault();
        void this.canvas?.redo();
      }
    });

    this.syncMenuUi();
    this.syncPanelsUi();
  }

  private bindPanelOpeners(scope: ParentNode): void {
    scope.querySelectorAll('[data-open-panel]').forEach((el) => {
      el.addEventListener('click', () => {
        this.menuOpen = false;
        const id = el.getAttribute('data-open-panel') as PanelId;
        if (id) this.openPanel = id;
        this.syncPanelsUi();
        this.syncMenuUi();
      });
    });
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
      devlab: '#Pnl-DevLab',
      vectorizer: '#Pnl-Vectorizer',
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

    if (this.openPanel === 'setup') this.refreshSetupPanel();
    if (this.openPanel === 'vectorizer') this.refreshVectorizerPanel();

    this.root.querySelector('#btn-file')?.classList.toggle('active', this.openPanel === 'file');
    this.root.querySelector('#btn-tools')?.classList.toggle('active', this.openPanel === 'tools');
  }

  private refreshFilePanel(): void {
    const host = this.root.querySelector('#file-panel-host');
    if (!(host instanceof HTMLElement) || !this.canvas) return;

    const mgr = this.canvas.manager;
    host.innerHTML = renderFileSidebar(mgr.objects, mgr.selectedObjectId);

    host.querySelector('#btn-load-demo-sidebar')?.addEventListener('click', () => {
      void this.canvas?.loadDemoSvg();
    });

    host.querySelector('#svg-upload')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const files = input.files ? Array.from(input.files) : [];
      void (async () => {
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith('.svg')) continue;
          await this.canvas?.importSvgFile(file);
        }
        input.value = '';
      })();
    });

    host.querySelectorAll('[data-select-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-select-id');
        if (id) this.canvas?.selectObject(id);
      });
    });

    host.querySelectorAll('[data-delete-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-delete-id');
        if (id) this.canvas?.removeObject(id);
      });
    });
  }

  private readNestingGap(): number {
    const el = this.root.querySelector('#toolbar-nesting-gap');
    if (!(el instanceof HTMLInputElement)) return 10;
    const n = parseFloat(el.value);
    return Number.isFinite(n) && n >= 0 ? n : 10;
  }

  private updateToolbarUi(): void {
    if (!this.canvas) return;
    const history = this.canvas.getHistoryState();
    const objectCount = this.canvas.getObjectCount();
    const undoEnabled = history.canUndo && labOptions.isEnabled('CORE-UNDO');
    const redoEnabled =
      history.canRedo && labOptions.isEnabled('CORE-UNDO') && labOptions.isEnabled('F-32');
    const nestEnabled =
      objectCount >= 2 && labOptions.isEnabled('CORE-NEST');

    const undoBtn = this.root.querySelector('#btn-undo');
    if (undoBtn instanceof HTMLButtonElement) {
      undoBtn.disabled = !undoEnabled;
      undoBtn.classList.toggle('is-disabled', !undoEnabled);
      undoBtn.title = undoEnabled ? history.label : 'Nothing to undo';
    }

    const redoBtn = this.root.querySelector('#btn-redo');
    if (redoBtn instanceof HTMLButtonElement) {
      redoBtn.disabled = !redoEnabled;
      redoBtn.classList.toggle('is-disabled', !redoEnabled);
      redoBtn.title = redoEnabled ? history.redoLabel : 'Nothing to redo';
    }

    const nestBtn = this.root.querySelector('#btn-nest');
    if (nestBtn instanceof HTMLButtonElement) {
      nestBtn.disabled = !nestEnabled;
      nestBtn.classList.toggle('is-disabled', !nestEnabled);
      nestBtn.title = nestEnabled
        ? `Auto nest ${objectCount} objects`
        : objectCount < 2
          ? 'Auto nest (need 2+ objects)'
          : 'Auto nest disabled in Feature Lab';
    }

    const gapInput = this.root.querySelector('#toolbar-nesting-gap');
    if (gapInput instanceof HTMLInputElement) {
      gapInput.disabled = !labOptions.isEnabled('CORE-NEST');
    }
  }

  private getObjectPanelData(): ObjectPanelData | null {
    if (!this.canvas) return null;
    const name = this.canvas.getActiveObjectName();
    if (!name) return null;
    const metrics = this.canvas.getSelectedLoopMetrics();
    return {
      name,
      loops: metrics.loops,
      totalPerimeterMm: metrics.totalPerimeterMm,
      showLoops: labOptions.isEnabled('F-40'),
      showPerimeter: labOptions.isEnabled('F-47'),
    };
  }

  private refreshObjectPanel(): void {
    const host = this.root.querySelector('#object-panel-host');
    if (!(host instanceof HTMLElement)) return;
    host.innerHTML = renderObjectPanel(this.getObjectPanelData());
  }

  private refreshSetupPanel(): void {
    const host = this.root.querySelector('#setup-panel-host');
    if (!(host instanceof HTMLElement)) return;
    host.innerHTML = renderSetupPanel();
    this.bindSetupPanel(host);
  }

  private bindSetupPanel(scope: ParentNode = this.root): void {
    const parseNum = (id: string, fallback: number): number => {
      const el = scope.querySelector(`#${id}`);
      if (!(el instanceof HTMLInputElement)) return fallback;
      const n = parseFloat(el.value);
      return Number.isFinite(n) ? n : fallback;
    };

    const applyFromInputs = (fitHome: boolean): void => {
      const cfg = workAreaConfig.getState();
      workAreaConfig.applySetup(
        {
          width: parseNum('setup-width', cfg.blockSize.width),
          height: parseNum('setup-height', cfg.blockSize.height),
        },
        {
          left: parseNum('setup-margin-left', cfg.margins.left),
          right: parseNum('setup-margin-right', cfg.margins.right),
          top: parseNum('setup-margin-top', cfg.margins.top),
          bottom: parseNum('setup-margin-bottom', cfg.margins.bottom),
        }
      );
      this.updateMaterialLabel();
      if (fitHome) this.canvas?.resetView();
    };

    const onFieldChange = (): void => applyFromInputs(false);

    scope.querySelectorAll(
      '#setup-width, #setup-height, #setup-margin-left, #setup-margin-right, #setup-margin-top, #setup-margin-bottom'
    ).forEach((el) => {
      el.addEventListener('change', onFieldChange);
    });

    scope.querySelector('#btn-setup-apply-home')?.addEventListener('click', () => {
      applyFromInputs(true);
    });
  }

  private refreshVectorizerPanel(): void {
    const host = this.root.querySelector('#vectorizer-panel-host');
    if (!(host instanceof HTMLElement)) return;
    host.innerHTML = renderVectorizerPanel(this.vectorizerLastResult);
    this.bindVectorizerPanel(host);
  }

  private bindVectorizerPanel(scope: ParentNode): void {
    scope.querySelector('#trace-image-upload')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      void (async () => {
        const result = await vectorCore.traceImage(file);
        this.vectorizerLastResult = result.summary;
        this.refreshVectorizerPanel();
      })();
    });
  }

  private updateMaterialLabel(): void {
    const el = this.root.querySelector('#material-info-label');
    if (el) el.textContent = workAreaConfig.getMaterialLabel();
  }

  private updateSelectionUi(): void {
    const badge = this.root.querySelector('#selection-badge');
    const nameEl = this.root.querySelector('#selection-name');
    const loopEl = this.root.querySelector('#selection-loop-count');
    const name = this.canvas?.getActiveObjectName();
    const metrics = this.canvas?.getSelectedLoopMetrics();

    if (badge instanceof HTMLElement) badge.hidden = !name;
    if (nameEl && name) nameEl.textContent = name;

    if (loopEl instanceof HTMLElement) {
      const showLoopBadge =
        !!name && labOptions.isEnabled('F-53') && (metrics?.count ?? 0) > 0;
      loopEl.hidden = !showLoopBadge;
      if (showLoopBadge && metrics) {
        loopEl.textContent = ` · ${metrics.count} loop${metrics.count === 1 ? '' : 's'}`;
      }
    }
  }

  destroy(): void {
    this.setupUnsub?.();
    this.setupUnsub = null;
    this.canvas?.dispose();
    this.canvas = null;
  }
}

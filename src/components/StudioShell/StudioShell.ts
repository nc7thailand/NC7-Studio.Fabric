import { workAreaConfig, type StudioOrigin } from '../../modules/config/WorkAreaConfig';
import { icons, type PanelId } from '../StudioShell/toolbarIcons';
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
import type { TransformOverlayDetail, ContextMenuKind } from '../../modules/canvas/FabricCanvas';
import { labOptions } from '../../modules/devlab/LabOptions';
import {
  clearPendingSvg,
  readPendingSvg,
} from '../../modules/vectorizer/pendingSvgHandoff';
import {
  bindVectorizerStorageHandoffListener,
  type VectorizerExportData,
} from '../../modules/vectorizer/vectorizerPostMessage';
import { VECTORIZER_PAUSED } from '../../modules/vectorizer/vectorizerPause';
import {
  LAYOUT_EXPORT_DEFAULT,
  LAYOUT_OPEN_ACCEPT,
  type LayoutExportFormat,
} from '../../modules/cad/fileFormats';

export class StudioShell {
  private root: HTMLElement;
  private openPanel: PanelId = null;
  private nc7MenuOpen = false;
  private canvasMenuOpen = false;
  private canvas: CanvasViewportHandle | null = null;
  private transformOverlay: TransformOverlayDetail | null = null;
  private setupUnsub: (() => void) | null = null;
  private vectorizerStorageUnsub: (() => void) | null = null;
  private nestingPanelOpen = false;
  private objectContextMenuOpen = false;
  private contextMenuKind: ContextMenuKind = 'object';
  private contextMenuClient = { x: 0, y: 0 };
  private objectAspectLocked = true;
  private objectPanelFocusSize = false;
  private exportModalOpen = false;
  private exportFormat: LayoutExportFormat = LAYOUT_EXPORT_DEFAULT;
  private readonly onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this.objectContextMenuOpen) return;
    const menu = this.root.querySelector('#object-context-menu');
    const target = e.target;
    if (menu instanceof HTMLElement && target instanceof Node && menu.contains(target)) return;
    this.closeObjectContextMenu();
  };

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
    console.info('[NC7 Studio.Fabric] Legacy vectorizer embed at /vectorcore — port 3010');
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
          <div id="vectorizer-panel-host">${renderVectorizerPanel()}</div>
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

          <div id="transform-hud" class="transform-dim-overlay" hidden aria-live="polite"></div>

          <div class="canvas-overlay-top">
            <div class="canvas-top-stack">
              <div class="canvas-float-controls" role="toolbar" aria-label="Main actions">
                <div class="floating-menu-anchor">
                  <button type="button" id="btn-nc7-menu" class="floating-menu-btn" title="NC7 menu" aria-label="NC7 menu" aria-haspopup="menu" aria-expanded="false" aria-controls="nc7-menu">NC7</button>
                  <div id="nc7-menu" class="action-menu" role="menu" aria-label="NC7 menu" hidden>
                    <div class="action-menu-submenu" data-menu-submenu>
                      <button type="button" class="action-menu-item action-menu-item--parent" id="btn-nc7-file" aria-haspopup="menu" aria-expanded="false" role="menuitem">
                        File
                        <span class="action-menu-chevron" aria-hidden="true">›</span>
                      </button>
                      <div class="action-menu action-menu--flyout" role="menu" aria-label="File" hidden>
                        <button type="button" class="action-menu-item" id="btn-open-layout" role="menuitem">Open File…</button>
                        <button type="button" class="action-menu-item" id="btn-export-layout" role="menuitem">Export…</button>
                        <button type="button" class="action-menu-item action-menu-item--sub" data-open-panel="file" role="menuitem">Files on bed…</button>
                      </div>
                    </div>
                    <button type="button" class="action-menu-item" id="btn-dummy-abc" data-dummy-add-abc role="menuitem">Add dummy ABC</button>
                    <button type="button" class="action-menu-item" disabled role="menuitem">View (soon)</button>
                    <button type="button" class="action-menu-item" data-open-panel="tools" role="menuitem">Tools</button>
                    <button type="button" class="action-menu-item action-menu-item--sub" data-open-panel="setup" role="menuitem">Setup</button>
                    <button type="button" class="action-menu-item" disabled role="menuitem">Help (soon)</button>
                  </div>
                </div>
                <button type="button" id="btn-canvas-menu" class="floating-menu-btn" hidden title="Canvas tools" aria-label="Canvas tools" aria-haspopup="toolbar" aria-expanded="false" aria-controls="canvas-subtoolbar">Canvas</button>
              </div>
              <div id="canvas-subtoolbar" class="canvas-subtoolbar" role="toolbar" aria-label="Canvas tools" hidden>
                <div class="canvas-subtoolbar-row">
                  <button type="button" id="btn-undo" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon canvas-subtoolbar-btn--undo is-disabled" disabled title="Undo" aria-label="Undo">${icons.undo}</button>
                  <button type="button" id="btn-redo" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon canvas-subtoolbar-btn--redo is-disabled" disabled title="Redo" aria-label="Redo">${icons.redo}</button>
                  <button type="button" id="btn-nest-toggle" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon canvas-subtoolbar-btn--nest is-disabled" disabled title="Auto nest" aria-label="Auto nest" aria-expanded="false" aria-controls="nesting-popup">${icons.nest}</button>
                  <span class="canvas-subtoolbar-divider" aria-hidden="true"></span>
                  <button type="button" id="btn-file" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon" title="File" aria-label="File">${icons.file}</button>
                  <button type="button" id="btn-home" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon" title="Home view" aria-label="Home view">${icons.home}</button>
                  <button type="button" id="btn-tools" class="canvas-subtoolbar-btn canvas-subtoolbar-btn--icon" title="Tools" aria-label="Tools">${icons.wrench}</button>
                </div>
                <div id="nesting-popup" class="canvas-subtoolbar-nest" role="group" aria-label="Auto nesting settings" hidden>
                  <label class="toolbar-gap-label" for="toolbar-nesting-gap">Gap</label>
                  <input id="toolbar-nesting-gap" class="toolbar-gap-input" type="number" min="0" step="0.01" value="10.00" aria-label="Nesting gap mm" />
                  <span class="toolbar-gap-unit">mm</span>
                  <button type="button" id="btn-nest-run" class="nesting-run-btn" disabled>Auto Nesting</button>
                </div>
              </div>
            </div>
          </div>

          <input type="file" id="layout-open-input" accept="${LAYOUT_OPEN_ACCEPT}" hidden aria-hidden="true" />

          <div id="export-format-dialog" class="modal-overlay export-format-dialog" hidden aria-hidden="true">
            <div class="modal-content leave-page-dialog export-format-dialog-content" role="dialog" aria-modal="true" aria-labelledby="export-format-title">
              <h2 id="export-format-title" class="modal-title">Export layout</h2>
              <p class="modal-desc">Choose a download format. SVG is the default for NC7 Studio.</p>
                <fieldset class="export-format-fieldset">
                <legend class="export-format-legend">Format</legend>
                <label class="export-format-option">
                  <input type="radio" name="export-format" value="svg" checked />
                  <span>.svg <em>(default)</em></span>
                </label>
                <label class="export-format-option">
                  <input type="radio" name="export-format" value="dxf" />
                  <span>.dxf</span>
                </label>
                <label class="export-format-option">
                  <input type="radio" name="export-format" value="dwg" />
                  <span>.dwg <em>(falls back to DXF)</em></span>
                </label>
              </fieldset>
              <div class="leave-page-dialog-actions">
                <button type="button" class="leave-page-btn" id="btn-export-cancel">Cancel</button>
                <button type="button" class="leave-page-btn leave-page-btn--primary" id="btn-export-confirm">Download</button>
              </div>
            </div>
          </div>

          <div id="object-context-menu" class="object-context-menu" role="menu" aria-label="Object actions" hidden>
            <button type="button" class="object-context-menu-item" data-ctx-action="size" role="menuitem">Size</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="duplicate" role="menuitem">Duplicate</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="mirror-h" role="menuitem">Mirror horizontal</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="mirror-v" role="menuitem">Mirror vertical</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="copy" role="menuitem">Copy</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="paste" role="menuitem">Paste</button>
            <button type="button" class="object-context-menu-item object-context-menu-item--danger" data-ctx-action="delete" role="menuitem">Delete</button>
            <button type="button" class="object-context-menu-item" data-ctx-action="properties" role="menuitem">Properties</button>
          </div>

          <div class="canvas-overlay-bottom">
            <div class="nav-hints-badge">
              <div class="hint-item"><span>Scroll/pinch: Zoom · Drag empty bed: Pan · 2 fingers: pan view</span></div>
              <span class="hint-divider">|</span>
              <div class="hint-item"><span>Cmd+C/V · Cmd+D duplicate · F6 cycle</span></div>
              <span class="hint-divider">|</span>
              <div class="hint-item"><span>Long-press object: menu · empty bed: Paste</span></div>
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
        this.openObjectPropertiesPanel();
      },
      onObjectContextMenu: (detail) => {
        this.showObjectContextMenu(detail.clientX, detail.clientY, detail.kind);
      },
      onTransformOverlay: (detail) => {
        this.transformOverlay = detail;
        this.syncTransformHud();
      },
    });

    if (!VECTORIZER_PAUSED) {
      void this.stagePendingVectorizerHandoff();
      this.vectorizerStorageUnsub = bindVectorizerStorageHandoffListener((data) => {
        this.stageVectorizerHandoff(data);
      });
    } else {
      clearPendingSvg();
    }

    this.bindVectorCoreLauncher(this.root);

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
      this.syncTransformHud();
    });

    this.bindFilePanelDelegation();
    this.bindDummyArtActions(this.root);
    this.refreshFilePanel();
    this.updateSelectionUi();
    this.updateToolbarUi();
    this.bindSetupPanel();
    this.bindObjectContextMenu();
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);

    this.setupUnsub = workAreaConfig.subscribe(() => {
      if (this.openPanel === 'setup') this.refreshSetupPanel();
    });

    this.root.querySelector('#btn-nc7-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nc7MenuOpen = !this.nc7MenuOpen;
      if (this.nc7MenuOpen) {
        this.canvasMenuOpen = false;
        this.nestingPanelOpen = false;
        this.syncNestingPanelUi();
      }
      this.syncToolbarMenusUi();
    });

    this.root.querySelector('#btn-canvas-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.canvasMenuOpen = !this.canvasMenuOpen;
      if (this.canvasMenuOpen) this.nc7MenuOpen = false;
      this.syncToolbarMenusUi();
    });

    const canvasMenuBtn = this.root.querySelector('#btn-canvas-menu');
    canvasMenuBtn?.addEventListener('focus', () => {
      if (canvasMenuBtn instanceof HTMLButtonElement && canvasMenuBtn.hidden) return;
      this.nc7MenuOpen = false;
      this.canvasMenuOpen = true;
      this.syncToolbarMenusUi();
    });

    const layoutOpenInput = this.root.querySelector('#layout-open-input');
    this.root.querySelector('#btn-open-layout')?.addEventListener('click', () => {
      this.closeToolbarMenus();
      if (layoutOpenInput instanceof HTMLInputElement) {
        layoutOpenInput.value = '';
        layoutOpenInput.click();
      }
    });

    layoutOpenInput?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      void this.importLayoutFile(file);
    });

    this.bindLayoutDropzone(mountEl);
    this.bindExportDialog();

    this.bindActionMenuSubmenus();

    this.root.querySelector('#btn-export-layout')?.addEventListener('click', () => {
      this.closeToolbarMenus();
      this.openExportDialog();
    });

    this.root.querySelector('#btn-file')?.addEventListener('click', () => {
      this.closeNc7Menu();
      this.togglePanel('file');
    });

    this.root.querySelector('#btn-tools')?.addEventListener('click', () => {
      this.closeNc7Menu();
      this.togglePanel('tools');
    });

    this.root.querySelector('#btn-home')?.addEventListener('click', () => {
      this.closeNc7Menu();
      this.canvas?.resetView();
    });

    this.root.querySelector('#btn-undo')?.addEventListener('click', () => {
      this.closeNc7Menu();
      void this.canvas?.undo();
    });

    this.root.querySelector('#btn-redo')?.addEventListener('click', () => {
      this.closeNc7Menu();
      void this.canvas?.redo();
    });

    this.root.querySelector('#btn-nest-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNestingPanel();
    });

    this.root.querySelector('#btn-nest-run')?.addEventListener('click', () => {
      const gap = this.readNestingGap();
      const result = this.canvas?.runAutoNesting(gap);
      if (result && !result.ok && result.reason) {
        console.warn('[StudioShell] auto-nest:', result.reason);
      }
      if (result?.ok) this.closeNestingPanel();
    });

    this.root.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof Node)) return;

      if (this.nc7MenuOpen) {
        const inNc7Menu =
          e.target instanceof Element && e.target.closest('.floating-menu-anchor:has(#nc7-menu)');
        if (!inNc7Menu) {
          this.nc7MenuOpen = false;
          this.syncToolbarMenusUi();
        }
      }

      if (this.canvasMenuOpen) {
        const inCanvasToolbar =
          e.target instanceof Element && e.target.closest('.canvas-top-stack');
        if (!inCanvasToolbar) {
          this.closeCanvasToolbar();
        }
      }

      if (!this.nestingPanelOpen) return;
      const nestRow = this.root.querySelector('#nesting-popup');
      const nestToggle = this.root.querySelector('#btn-nest-toggle');
      if (
        nestRow instanceof HTMLElement &&
        nestToggle instanceof HTMLElement &&
        !nestRow.contains(e.target) &&
        !nestToggle.contains(e.target)
      ) {
        this.closeNestingPanel();
      }
    });

    this.root.querySelector('#panel-backdrop')?.addEventListener('click', () => this.closePanels());

    this.root.querySelectorAll('[data-close-panel]').forEach((el) => {
      el.addEventListener('click', () => this.closePanels());
    });

    this.bindPanelOpeners(this.root);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.objectContextMenuOpen) {
          this.closeObjectContextMenu();
          return;
        }
        if (this.nestingPanelOpen) {
          this.closeNestingPanel();
          return;
        }
        if (this.canvasMenuOpen) {
          this.closeCanvasToolbar();
          return;
        }
        this.closePanels();
      }

      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (labOptions.isEnabled('F-12') && e.key === 'F6') {
        e.preventDefault();
        this.canvas?.cycleFocus();
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === 'd' && labOptions.isEnabled('F-01') && labOptions.isEnabled('F-04')) {
        e.preventDefault();
        void this.canvas?.duplicateSelected();
        return;
      }

      if (e.key === 'c' && labOptions.isEnabled('F-02') && labOptions.isEnabled('F-04')) {
        e.preventDefault();
        this.canvas?.copyToClipboard();
        return;
      }

      if (e.key === 'v' && labOptions.isEnabled('F-02') && labOptions.isEnabled('F-04')) {
        e.preventDefault();
        void this.canvas?.pasteFromClipboard();
        return;
      }

      if (e.key === 'g' && e.shiftKey && labOptions.isEnabled('V-01')) {
        e.preventDefault();
        void this.canvas?.ungroupTracedCollection();
        return;
      }

      if (e.key === 'z' && !e.shiftKey && labOptions.isEnabled('CORE-UNDO')) {
        e.preventDefault();
        void this.canvas?.undo();
        return;
      }
      if (
        (e.key === 'z' && e.shiftKey && labOptions.isEnabled('F-32')) ||
        (e.key === 'y' && labOptions.isEnabled('F-32'))
      ) {
        if (!labOptions.isEnabled('CORE-UNDO') || !labOptions.isEnabled('F-31')) return;
        e.preventDefault();
        void this.canvas?.redo();
      }
    });

    this.syncToolbarMenusUi();
    this.syncPanelsUi();
    this.syncNestingPanelUi();
  }

  private async commitVectorizerHandoff(data: VectorizerExportData): Promise<void> {
    if (VECTORIZER_PAUSED) {
      clearPendingSvg();
      return;
    }
    if (!labOptions.isEnabled('V-01')) {
      console.warn('[StudioShell] V-01 legacy vectorizer handoff is disabled in Dev Lab.');
      clearPendingSvg();
      return;
    }
    if (!data.svgText?.trim()) return;

    clearPendingSvg();

    try {
      await this.canvas?.importVectorizerSvg(
        data.svgText,
        data.name?.trim() || 'traced_image.svg'
      );
      this.updateSelectionUi();
      this.refreshFilePanel();
      this.refreshObjectPanel();
    } catch (err) {
      console.error('[StudioShell] vectorizer import failed', err);
    }
  }

  private stageVectorizerHandoff(data: VectorizerExportData): void {
    void this.commitVectorizerHandoff(data);
  }

  private async stagePendingVectorizerHandoff(): Promise<void> {
    if (VECTORIZER_PAUSED) {
      clearPendingSvg();
      return;
    }
    const payload = readPendingSvg();
    if (!payload?.svgText) return;
    await this.commitVectorizerHandoff({
      svgText: payload.svgText,
      name: payload.name ?? 'traced_image.svg',
    });
  }

  private bindVectorCoreLauncher(scope: ParentNode): void {
    scope.querySelectorAll('[data-open-vectorcore]').forEach((el) => {
      if (VECTORIZER_PAUSED) {
        if (el instanceof HTMLButtonElement) {
          el.disabled = true;
          el.title = 'Vectorizer paused';
        }
        return;
      }
      el.addEventListener('click', () => {
        this.closeToolbarMenus();
        this.closePanels();
        window.open('/vectorcore', '_blank', 'noopener,noreferrer');
      });
    });
  }

  private toggleNestingPanel(): void {
    this.nestingPanelOpen = !this.nestingPanelOpen;
    this.syncNestingPanelUi();
  }

  private closeNestingPanel(): void {
    this.nestingPanelOpen = false;
    this.syncNestingPanelUi();
  }

  private syncNestingPanelUi(): void {
    const popup = this.root.querySelector('#nesting-popup');
    const toggle = this.root.querySelector('#btn-nest-toggle');
    if (popup instanceof HTMLElement) popup.hidden = !this.nestingPanelOpen;
    toggle?.classList.toggle('active', this.nestingPanelOpen);
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute('aria-expanded', String(this.nestingPanelOpen));
    }
  }

  private bindPanelOpeners(scope: ParentNode): void {
    scope.querySelectorAll('[data-open-panel]').forEach((el) => {
      el.addEventListener('click', () => {
        this.closeToolbarMenus();
        this.nestingPanelOpen = false;
        const id = el.getAttribute('data-open-panel') as PanelId;
        if (id) this.openPanel = id;
        this.syncPanelsUi();
        this.syncNestingPanelUi();
      });
    });
  }

  private togglePanel(id: PanelId): void {
    this.nestingPanelOpen = false;
    this.openPanel = this.openPanel === id ? null : id;
    this.syncPanelsUi();
    this.syncNestingPanelUi();
  }

  private openObjectPropertiesPanel(options?: { focusSize?: boolean }): void {
    this.closeObjectContextMenu();
    this.objectPanelFocusSize = options?.focusSize ?? false;
    this.openPanel = 'object';
    this.syncPanelsUi();
    this.refreshObjectPanel();
  }

  private bindObjectContextMenu(): void {
    const menu = this.root.querySelector('#object-context-menu');
    if (!(menu instanceof HTMLElement)) return;

    menu.querySelectorAll('[data-ctx-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.getAttribute('data-ctx-action');
        this.closeObjectContextMenu();
        if (!action) return;

        switch (action) {
          case 'size':
            this.openObjectPropertiesPanel({ focusSize: true });
            break;
          case 'properties':
            this.openObjectPropertiesPanel();
            break;
          case 'duplicate':
            if (labOptions.isEnabled('F-01') && labOptions.isEnabled('F-04')) {
              void this.canvas?.duplicateSelected();
            }
            break;
          case 'mirror-h':
            this.canvas?.mirrorSelectedObject('horizontal');
            break;
          case 'mirror-v':
            this.canvas?.mirrorSelectedObject('vertical');
            break;
          case 'copy':
            if (labOptions.isEnabled('F-02') && labOptions.isEnabled('F-04')) {
              this.canvas?.copyToClipboard();
            }
            break;
          case 'paste':
            if (labOptions.isEnabled('F-02') && labOptions.isEnabled('F-04')) {
              if (this.contextMenuKind === 'canvas') {
                void this.canvas?.pasteFromClipboard({
                  clientX: this.contextMenuClient.x,
                  clientY: this.contextMenuClient.y,
                });
              } else {
                void this.canvas?.pasteFromClipboard();
              }
            }
            break;
          case 'delete': {
            const id = this.canvas?.manager.selectedObjectId;
            if (id) this.canvas?.removeObject(id);
            break;
          }
        }
      });
    });
  }

  private showObjectContextMenu(clientX: number, clientY: number, kind: ContextMenuKind): void {
    this.closeToolbarMenus();
    this.closeNestingPanel();
    this.contextMenuKind = kind;
    this.contextMenuClient = { x: clientX, y: clientY };

    const menu = this.root.querySelector('#object-context-menu');
    if (!(menu instanceof HTMLElement)) return;

    const duplicateOk = labOptions.isEnabled('F-01') && labOptions.isEnabled('F-04');
    const clipboardOk = labOptions.isEnabled('F-02') && labOptions.isEnabled('F-04');

    menu.querySelectorAll('[data-ctx-action]').forEach((el) => {
      const action = el.getAttribute('data-ctx-action');
      if (!(el instanceof HTMLElement)) return;
      if (kind === 'canvas') {
        el.hidden = action !== 'paste';
      } else {
        el.hidden = false;
      }
    });

    menu.querySelector('[data-ctx-action="duplicate"]')?.toggleAttribute('disabled', !duplicateOk);
    menu.querySelector('[data-ctx-action="copy"]')?.toggleAttribute('disabled', !clipboardOk);
    menu.querySelector('[data-ctx-action="paste"]')?.toggleAttribute('disabled', !clipboardOk);

    menu.hidden = false;
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    this.objectContextMenuOpen = true;

    const margin = 8;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';

    if (kind === 'object') {
      this.canvas?.setContextMenuLock(true);
    } else {
      this.canvas?.setContextMenuLock(false);
    }
  }

  private closeObjectContextMenu(): void {
    if (!this.objectContextMenuOpen) return;
    const menu = this.root.querySelector('#object-context-menu');
    if (menu instanceof HTMLElement) {
      menu.hidden = true;
      menu.querySelectorAll('[data-ctx-action]').forEach((el) => {
        if (el instanceof HTMLElement) el.hidden = false;
      });
    }
    this.objectContextMenuOpen = false;
    this.canvas?.setContextMenuLock(false);
  }

  private closePanels(): void {
    this.openPanel = null;
    this.closeObjectContextMenu();
    this.closeToolbarMenus();
    this.nestingPanelOpen = false;
    this.syncPanelsUi();
    this.syncNestingPanelUi();
  }

  private closeNc7Menu(): void {
    this.nc7MenuOpen = false;
    this.syncToolbarMenusUi();
  }

  private closeCanvasToolbar(): void {
    this.canvasMenuOpen = false;
    this.nestingPanelOpen = false;
    this.syncToolbarMenusUi();
    this.syncNestingPanelUi();
  }

  private closeToolbarMenus(): void {
    this.nc7MenuOpen = false;
    this.canvasMenuOpen = false;
    this.root.querySelectorAll('#nc7-menu .action-menu-submenu.is-open').forEach((wrap) => {
      if (!(wrap instanceof HTMLElement)) return;
      wrap.classList.remove('is-open');
      const btn = wrap.querySelector('.action-menu-item--parent');
      const panel = wrap.querySelector('.action-menu--flyout');
      if (btn instanceof HTMLElement) btn.setAttribute('aria-expanded', 'false');
      if (panel instanceof HTMLElement) panel.hidden = true;
    });
    this.syncToolbarMenusUi();
  }

  private syncToolbarMenusUi(): void {
    const nc7Menu = this.root.querySelector('#nc7-menu');
    const nc7Btn = this.root.querySelector('#btn-nc7-menu');
    const canvasSubtoolbar = this.root.querySelector('#canvas-subtoolbar');
    const canvasBtn = this.root.querySelector('#btn-canvas-menu');

    if (nc7Menu instanceof HTMLElement) nc7Menu.hidden = !this.nc7MenuOpen;
    nc7Btn?.classList.toggle('active', this.nc7MenuOpen);
    if (nc7Btn instanceof HTMLButtonElement) {
      nc7Btn.setAttribute('aria-expanded', String(this.nc7MenuOpen));
    }

    if (canvasSubtoolbar instanceof HTMLElement) {
      canvasSubtoolbar.hidden = !this.canvasMenuOpen;
      canvasSubtoolbar.classList.toggle('is-open', this.canvasMenuOpen);
    }
    canvasBtn?.classList.toggle('active', this.canvasMenuOpen);
    if (canvasBtn instanceof HTMLButtonElement) {
      canvasBtn.setAttribute('aria-expanded', String(this.canvasMenuOpen));
    }
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
    if (this.openPanel === 'object') this.refreshObjectPanel();
    if (this.openPanel === 'file') this.refreshFilePanel();

    const fileOpen = this.openPanel === 'file';
    const toolsOpen = this.openPanel === 'tools';
    this.root.querySelector('#btn-file')?.classList.toggle('active', fileOpen);
    const fileMenuBtn = this.root.querySelector('#btn-nc7-file');
    fileMenuBtn?.classList.toggle('active', fileOpen);
    this.root.querySelector('#btn-tools')?.classList.toggle('active', toolsOpen);
  }

  /** One delegated listener — survives file list re-renders. */
  private bindFilePanelDelegation(): void {
    const host = this.root.querySelector('#file-panel-host');
    if (!(host instanceof HTMLElement) || host.dataset.actionsBound === '1') return;
    host.dataset.actionsBound = '1';

    host.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      if (target.closest('[data-dummy-add-abc]')) {
        e.preventDefault();
        void this.runDummyAbcAdd();
        return;
      }
      if (target.closest('[data-dummy-add-wedding]')) {
        e.preventDefault();
        void this.canvas?.loadDummyWeddingSvg();
        return;
      }
      const deleteBtn = target.closest('[data-delete-id]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.getAttribute('data-delete-id');
        if (id) this.canvas?.removeObject(id);
        return;
      }

      const row = target.closest('[data-select-id]');
      if (row) {
        const id = row.getAttribute('data-select-id');
        if (id) this.canvas?.selectObject(id);
      }
    });
  }

  private bindDummyArtActions(scope: ParentNode): void {
    scope.querySelectorAll('[data-dummy-add-abc]').forEach((el) => {
      if (el instanceof HTMLElement && el.dataset.dummyBound === '1') return;
      if (el instanceof HTMLElement) el.dataset.dummyBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        void this.runDummyAbcAdd();
      });
    });
    scope.querySelectorAll('[data-dummy-add-wedding]').forEach((el) => {
      if (el instanceof HTMLElement && el.dataset.dummyBound === '1') return;
      if (el instanceof HTMLElement) el.dataset.dummyBound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        void this.canvas?.loadDummyWeddingSvg();
      });
    });
  }

  /** Nested NC7 menu flyouts (File → …). */
  private bindActionMenuSubmenus(): void {
    const root = this.root.querySelector('#nc7-menu');
    if (!(root instanceof HTMLElement) || root.dataset.submenusBound === '1') return;
    root.dataset.submenusBound = '1';

    const closeFlyouts = (except?: HTMLElement): void => {
      root.querySelectorAll('.action-menu-submenu').forEach((wrap) => {
        if (!(wrap instanceof HTMLElement)) return;
        if (except && (wrap === except || wrap.contains(except))) return;
        wrap.classList.remove('is-open');
        const btn = wrap.querySelector('.action-menu-item--parent');
        const panel = wrap.querySelector('.action-menu--flyout');
        if (btn instanceof HTMLElement) btn.setAttribute('aria-expanded', 'false');
        if (panel instanceof HTMLElement) panel.hidden = true;
      });
    };

    root.querySelectorAll('[data-menu-submenu]').forEach((wrap) => {
      if (!(wrap instanceof HTMLElement)) return;
      const btn = wrap.querySelector('.action-menu-item--parent');
      const panel = wrap.querySelector('.action-menu--flyout');
      if (!(btn instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !wrap.classList.contains('is-open');
        closeFlyouts(open ? wrap : undefined);
        wrap.classList.toggle('is-open', open);
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
    });

    root.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-menu-submenu] .action-menu-item--parent')) return;
      if (target.closest('[data-open-panel]')) {
        this.closeToolbarMenus();
      }
    });
  }

  private async runDummyAbcAdd(): Promise<void> {
    if (!this.canvas) return;
    try {
      await this.canvas.loadDummyAbcSvg();
      this.closeToolbarMenus();
      this.openPanel = null;
      this.syncPanelsUi();
    } catch (err) {
      console.error('[StudioShell] Dummy ABC failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      window.alert(`Could not add dummy ABC: ${detail}`);
    }
  }

  private refreshFilePanel(): void {
    const host = this.root.querySelector('#file-panel-host');
    if (!(host instanceof HTMLElement) || !this.canvas) return;

    const mgr = this.canvas.manager;
    host.innerHTML = renderFileSidebar(mgr.objects, mgr.selectedObjectId);
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
      history.canRedo &&
      labOptions.isEnabled('CORE-UNDO') &&
      labOptions.isEnabled('F-32') &&
      labOptions.isEnabled('F-31');
    const nestFeatureOn = labOptions.isEnabled('CORE-NEST');
    const nestEnabled = objectCount >= 2 && nestFeatureOn;

    const undoBtn = this.root.querySelector('#btn-undo');
    if (undoBtn instanceof HTMLButtonElement) {
      undoBtn.disabled = !undoEnabled;
      undoBtn.classList.toggle('is-disabled', !undoEnabled);
      const undoTitle = undoEnabled ? history.label : 'Nothing to undo';
      undoBtn.title = undoTitle;
      undoBtn.setAttribute('aria-label', undoTitle);
    }

    const redoBtn = this.root.querySelector('#btn-redo');
    if (redoBtn instanceof HTMLButtonElement) {
      redoBtn.disabled = !redoEnabled;
      redoBtn.classList.toggle('is-disabled', !redoEnabled);
      const redoTitle = redoEnabled ? history.redoLabel : 'Nothing to redo';
      redoBtn.title = redoTitle;
      redoBtn.setAttribute('aria-label', redoTitle);
    }

    const nestToggle = this.root.querySelector('#btn-nest-toggle');
    if (nestToggle instanceof HTMLButtonElement) {
      nestToggle.disabled = !nestFeatureOn;
      nestToggle.classList.toggle('is-disabled', !nestFeatureOn);
      const nestTitle = nestFeatureOn ? 'Auto nest' : 'Auto nest disabled in Feature Lab';
      nestToggle.title = nestTitle;
      nestToggle.setAttribute('aria-label', nestTitle);
    }

    const nestRun = this.root.querySelector('#btn-nest-run');
    if (nestRun instanceof HTMLButtonElement) {
      nestRun.disabled = !nestEnabled;
    }

    const gapInput = this.root.querySelector('#toolbar-nesting-gap');
    if (gapInput instanceof HTMLInputElement) {
      gapInput.disabled = !nestFeatureOn;
    }

    const showObjectTools = objectCount > 0;

    const canvasBtn = this.root.querySelector('#btn-canvas-menu');
    if (canvasBtn instanceof HTMLElement) {
      canvasBtn.hidden = !showObjectTools;
      if (!showObjectTools) {
        this.closeCanvasToolbar();
      }
    }

  }

  private getObjectPanelData(): ObjectPanelData | null {
    if (!this.canvas) return null;
    const name = this.canvas.getActiveObjectName();
    if (!name) return null;
    const size = this.canvas.getSelectedObjectSize();
    if (!size) return null;
    const metrics = this.canvas.getSelectedLoopMetrics();
    const unit = workAreaConfig.getState().unit;
    return {
      name,
      width: size.widthMm,
      height: size.heightMm,
      unit,
      aspectLocked: this.objectAspectLocked,
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
    this.bindObjectPanel(host);
  }

  private bindObjectPanel(scope: ParentNode): void {
    const widthEl = scope.querySelector('#obj-prop-width');
    const heightEl = scope.querySelector('#obj-prop-height');
    const lockBtn = scope.querySelector('#obj-prop-aspect-lock');

    lockBtn?.addEventListener('click', () => {
      this.objectAspectLocked = !this.objectAspectLocked;
      if (lockBtn instanceof HTMLButtonElement) {
        lockBtn.classList.toggle('active', this.objectAspectLocked);
        lockBtn.setAttribute('aria-pressed', String(this.objectAspectLocked));
        lockBtn.title = this.objectAspectLocked
          ? 'Aspect ratio locked'
          : 'Aspect ratio unlocked';
        lockBtn.setAttribute(
          'aria-label',
          this.objectAspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'
        );
        lockBtn.textContent = this.objectAspectLocked ? '🔒' : '🔓';
      }
    });

    const parseDisplay = (el: HTMLInputElement): number | null => {
      const n = parseFloat(el.value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const displayToMm = (value: number): number => {
      const unit = workAreaConfig.getState().unit;
      return unit === 'inches' ? value * 25.4 : value;
    };

    const applySize = (changed: 'width' | 'height'): void => {
      if (!(widthEl instanceof HTMLInputElement) || !(heightEl instanceof HTMLInputElement)) {
        return;
      }
      const wDisplay = parseDisplay(widthEl);
      const hDisplay = parseDisplay(heightEl);
      if (wDisplay == null || hDisplay == null) return;

      const ok = this.canvas?.resizeSelectedObjectSize(
        displayToMm(wDisplay),
        displayToMm(hDisplay),
        { lockAspect: this.objectAspectLocked, changed }
      );
      if (ok) this.refreshObjectPanel();
    };

    widthEl?.addEventListener('change', () => applySize('width'));
    heightEl?.addEventListener('change', () => applySize('height'));

    if (this.objectPanelFocusSize && widthEl instanceof HTMLInputElement) {
      this.objectPanelFocusSize = false;
      widthEl.focus();
      widthEl.select();
    }
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
      workAreaConfig.applySetup({
        blockSize: {
          width: parseNum('setup-width', cfg.blockSize.width),
          height: parseNum('setup-height', cfg.blockSize.height),
        },
        margins: {
          left: parseNum('setup-margin-left', cfg.margins.left),
          right: parseNum('setup-margin-right', cfg.margins.right),
          top: parseNum('setup-margin-top', cfg.margins.top),
          bottom: parseNum('setup-margin-bottom', cfg.margins.bottom),
        },
        objectGap: parseNum('setup-object-gap', cfg.objectGap),
        feedRate: parseNum('setup-feed-rate', cfg.feedRate),
        dwellTime: parseNum('setup-dwell-time', cfg.dwellTime),
      });
      if (fitHome) this.canvas?.resetView();
    };

    const onFieldChange = (): void => applyFromInputs(false);

    scope.querySelectorAll(
      '#setup-width, #setup-height, #setup-margin-left, #setup-margin-right, #setup-margin-top, #setup-margin-bottom, #setup-object-gap, #setup-feed-rate, #setup-dwell-time'
    ).forEach((el) => {
      el.addEventListener('change', onFieldChange);
    });

    scope.querySelectorAll('[data-setup-unit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const unit = btn.getAttribute('data-setup-unit');
        if (unit === 'mm' || unit === 'inches') {
          workAreaConfig.setUnit(unit);
          this.refreshSetupPanel();
        }
      });
    });

    scope.querySelectorAll('[data-setup-origin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const origin = btn.getAttribute('data-setup-origin') as StudioOrigin | null;
        if (!origin) return;
        workAreaConfig.setOrigin(origin);
        this.refreshSetupPanel();
      });
    });

    scope.querySelector('#btn-setup-apply-home')?.addEventListener('click', () => {
      applyFromInputs(true);
    });
  }

  private syncTransformHud(): void {
    const el = this.root.querySelector('#transform-hud');
    if (!(el instanceof HTMLElement)) return;
    const detail = this.transformOverlay;
    if (!detail?.visible || !labOptions.isEnabled('F-31')) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.left = `${detail.clientX}px`;
    el.style.top = `${detail.clientY}px`;
    if (detail.mode === 'move') {
      el.textContent = `X = ${detail.posX.toFixed(2)} mm  Y = ${detail.posY.toFixed(2)} mm`;
    } else if (detail.mode === 'rotate') {
      el.textContent = `↻ ${detail.rotationDeg.toFixed(1)}°`;
    } else {
      const rot =
        Math.abs(detail.rotationDeg) > 0.05 ? ` · ${detail.rotationDeg.toFixed(1)}°` : '';
      el.textContent = `W = ${detail.widthMm.toFixed(2)} mm  H = ${detail.heightMm.toFixed(2)} mm${rot}`;
    }
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

  private async importLayoutFile(file: File): Promise<void> {
    try {
      await this.canvas?.openLayoutFile(file);
    } catch (err) {
      console.error('[StudioShell] open layout failed', err);
      const message = err instanceof Error ? err.message : 'Could not open file';
      window.alert(message);
    }
  }

  private bindLayoutDropzone(mountEl: HTMLElement): void {
    const isFileDrag = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    mountEl.addEventListener('dragenter', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      mountEl.classList.add('is-file-drop-target');
    });
    mountEl.addEventListener('dragover', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      mountEl.classList.add('is-file-drop-target');
    });
    mountEl.addEventListener('dragleave', (e) => {
      if (e.target !== mountEl && mountEl.contains(e.relatedTarget as Node | null)) return;
      mountEl.classList.remove('is-file-drop-target');
    });
    mountEl.addEventListener('drop', (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      mountEl.classList.remove('is-file-drop-target');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      void this.importLayoutFile(file);
    });
  }

  private bindExportDialog(): void {
    const dialog = this.root.querySelector('#export-format-dialog');
    this.root.querySelector('#btn-export-cancel')?.addEventListener('click', () => {
      this.closeExportDialog();
    });
    this.root.querySelector('#btn-export-confirm')?.addEventListener('click', () => {
      const selected = this.root.querySelector(
        'input[name="export-format"]:checked'
      ) as HTMLInputElement | null;
      const format = (selected?.value as LayoutExportFormat | undefined) ?? LAYOUT_EXPORT_DEFAULT;
      this.exportFormat = format;
      this.closeExportDialog();
      try {
        this.canvas?.saveExportDownload(format);
      } catch (err) {
        console.error('[StudioShell] export failed', err);
        const message = err instanceof Error ? err.message : 'Export failed';
        window.alert(message);
      }
    });
    dialog?.addEventListener('click', (e) => {
      if (e.target === dialog) this.closeExportDialog();
    });
  }

  private openExportDialog(): void {
    const dialog = this.root.querySelector('#export-format-dialog');
    if (!(dialog instanceof HTMLElement)) return;
    this.exportFormat = LAYOUT_EXPORT_DEFAULT;
    const svgRadio = this.root.querySelector(
      'input[name="export-format"][value="svg"]'
    ) as HTMLInputElement | null;
    if (svgRadio) svgRadio.checked = true;
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    this.exportModalOpen = true;
  }

  private closeExportDialog(): void {
    const dialog = this.root.querySelector('#export-format-dialog');
    if (dialog instanceof HTMLElement) {
      dialog.hidden = true;
      dialog.setAttribute('aria-hidden', 'true');
    }
    this.exportModalOpen = false;
  }

  destroy(): void {
    this.setupUnsub?.();
    this.setupUnsub = null;
    this.canvas?.dispose();
    this.canvas = null;
  }
}

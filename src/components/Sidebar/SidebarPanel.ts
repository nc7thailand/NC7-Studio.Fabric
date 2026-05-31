import { icons } from '../StudioShell/toolbarIcons';
import { workAreaConfig } from '../../modules/config/WorkAreaConfig';
import type { VectorCoreConfig } from '../../modules/vectorizer/VectorCore';
import type { SceneObject } from '../../modules/canvas/WorkAreaManager';
import type { LoopInfo } from '../../modules/canvas/loopMetrics';

export interface ObjectPanelData {
  name: string;
  loops: LoopInfo[];
  totalPerimeterMm: number;
  showLoops: boolean;
  showPerimeter: boolean;
}

export function renderFileSidebar(
  objects: SceneObject[],
  selectedId: string | null
): string {
  const objectRows =
    objects.length === 0
      ? `<div class="empty-workspace">
          <p>No SVG files loaded in canvas.</p>
          <p class="text-sm">Upload an SVG to begin layouts</p>
        </div>`
      : `<div class="objects-list-section">
          <h3 class="section-title-sm">SVG Drawings (${objects.length})</h3>
          <div class="objects-list">
            ${objects
              .map(
                (obj) => `
              <div class="object-item ${selectedId === obj.id ? 'selected' : ''}" data-select-id="${obj.id}">
                <div class="object-item-header">
                  <span class="object-name" title="${obj.name}">${obj.name}</span>
                  <button type="button" class="delete-btn" data-delete-id="${obj.id}" title="Remove object">×</button>
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>`;

  return `
    <aside class="panel-sidebar">
      <div class="sidebar-header">
        <h1 class="logo-text">NC7 Studio<span class="logo-accent">.Fabric</span></h1>
        <span class="version-tag">Phase 6 · potrace WASM</span>
      </div>
      <div class="tabs-nav">
        <button type="button" class="tab-btn active" data-tab="files">
          ${icons.layers}
          <span>.SVG files (${objects.length})</span>
        </button>
      </div>
      <div class="sidebar-content">
        <div class="upload-zone">
          <label for="svg-upload" class="upload-label">
            ${icons.upload}
            <span class="upload-title">Upload SVG Drawing</span>
            <span class="upload-desc">Drag & drop or browse files</span>
          </label>
          <input id="svg-upload" type="file" accept=".svg" multiple class="hidden-file-input" />
        </div>
        <button type="button" id="btn-load-demo-sidebar" class="tools-action-btn">Load Demo SVG</button>
        ${objectRows}
      </div>
    </aside>
  `;
}

export function renderToolsPanel(): string {
  return `
    <div class="tools-panel">
      <h3 class="tools-panel-title">Tools</h3>
      <div class="tools-panel-actions">
        <button type="button" class="tools-action-btn" data-open-panel="setup">Material Setup</button>
        <button type="button" class="tools-action-btn" disabled>Remote Access (soon)</button>
        <button type="button" class="tools-action-btn" data-open-panel="vectorizer">Trace Image</button>
        <button type="button" class="tools-action-btn" data-open-panel="devlab">Canvas Feature Lab</button>
      </div>
    </div>
  `;
}

export function renderSetupPanel(): string {
  const cfg = workAreaConfig.getState();
  const u = cfg.unit;
  return `
    <div class="panel-sidebar setup-panel-host">
      <div class="sidebar-header">
        <h1 class="logo-text">Material <span class="logo-accent">Setup</span></h1>
        <span class="version-tag">Bed size &amp; margins</span>
      </div>
      <div class="sidebar-content">
        <h2 class="section-title-sm">Material size</h2>
        <div class="input-grid">
          <div class="input-group">
            <label for="setup-width">Block width</label>
            <div class="input-wrapper">
              <input id="setup-width" type="number" min="1" step="1" value="${cfg.blockSize.width}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="setup-height">Block height</label>
            <div class="input-wrapper">
              <input id="setup-height" type="number" min="1" step="1" value="${cfg.blockSize.height}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
        </div>
        <h2 class="section-title-sm">Margins</h2>
        <p class="section-hint">Clearance inset from each edge. Red dashed guides update live.</p>
        <div class="input-grid">
          <div class="input-group">
            <label for="setup-margin-left">Left</label>
            <div class="input-wrapper">
              <input id="setup-margin-left" type="number" step="1" value="${cfg.margins.left}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="setup-margin-right">Right</label>
            <div class="input-wrapper">
              <input id="setup-margin-right" type="number" step="1" value="${cfg.margins.right}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="setup-margin-top">Top</label>
            <div class="input-wrapper">
              <input id="setup-margin-top" type="number" step="1" value="${cfg.margins.top}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="setup-margin-bottom">Bottom</label>
            <div class="input-wrapper">
              <input id="setup-margin-bottom" type="number" step="1" value="${cfg.margins.bottom}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
        </div>
        <button type="button" id="btn-setup-apply-home" class="tools-action-btn">Apply &amp; fit home view</button>
      </div>
    </div>
  `;
}

export type VectorizerPanelStatus = 'idle' | 'processing' | 'done' | 'error';

export interface VectorizerPanelState {
  message: string | null;
  status: VectorizerPanelStatus;
  config: VectorCoreConfig;
}

export function renderVectorizerPanel(state: VectorizerPanelState): string {
  const { message, status, config } = state;
  const statusClass =
    status === 'processing'
      ? 'is-processing'
      : status === 'done'
        ? 'is-done'
        : status === 'error'
          ? 'is-error'
          : message
            ? ''
            : 'is-empty';
  const displayMessage =
    message ??
    (status === 'processing' ? 'Tracing…' : 'Upload PNG or JPG to trace and import to canvas.');

  return `
    <div class="panel-sidebar vectorizer-panel-host">
      <div class="sidebar-header">
        <h1 class="logo-text">Trace <span class="logo-accent">Image</span></h1>
        <span class="version-tag">VectorCore · V-01 WASM</span>
      </div>
      <div class="sidebar-content">
        <p class="section-hint">
          Upload a raster image — potrace WASM traces paths and imports SVG to the foam bed.
          F-50 auto-selects the new object when enabled in Dev Lab.
        </p>
        <div class="input-grid">
          <div class="input-group">
            <label for="trace-threshold">Binarize threshold</label>
            <div class="input-wrapper">
              <input id="trace-threshold" type="range" min="10" max="240" step="1" value="${config.threshold}" ${status === 'processing' ? 'disabled' : ''} />
              <span class="unit-label" id="trace-threshold-value">${config.threshold}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="trace-turdsize">Turd size (despeckle)</label>
            <div class="input-wrapper">
              <input id="trace-turdsize" type="number" min="0" max="50" step="1" value="${config.turdSize}" ${status === 'processing' ? 'disabled' : ''} />
            </div>
          </div>
        </div>
        <div class="upload-zone">
          <label for="trace-image-upload" class="upload-label ${status === 'processing' ? 'is-disabled' : ''}">
            ${icons.upload}
            <span class="upload-title">Choose image (PNG, JPG)</span>
            <span class="upload-desc">${status === 'processing' ? 'Tracing in progress…' : 'WASM potrace → SVG import'}</span>
          </label>
          <input id="trace-image-upload" type="file" accept="image/png,image/jpeg,image/jpg,image/webp" class="hidden-file-input" ${status === 'processing' ? 'disabled' : ''} />
        </div>
        <div id="vectorizer-result" class="vectorizer-result ${statusClass}" role="status" aria-live="polite">
          ${displayMessage}
        </div>
      </div>
    </div>
  `;
}

export function renderObjectPanel(data: ObjectPanelData | null): string {
  if (!data) {
    return `
    <div class="tools-panel">
      <h3 class="tools-panel-title">Object Properties</h3>
      <div class="object-props">
        <p class="section-hint">Select an object on the canvas to inspect loops and perimeter.</p>
      </div>
    </div>`;
  }

  const loopSection =
    data.showLoops && data.loops.length > 0
      ? `<div class="object-props-loops">
          <span class="object-props-label">Cut loops (${data.loops.length})</span>
          <ul class="object-props-loop-list">
            ${data.loops
              .map(
                (loop) => `<li>
              Loop ${loop.index + 1}: ${loop.pointCount} pts${
                data.showPerimeter && loop.perimeterMm != null
                  ? ` · ${loop.perimeterMm.toFixed(1)} mm`
                  : ''
              }
            </li>`
              )
              .join('')}
          </ul>
          ${
            data.showPerimeter && data.totalPerimeterMm > 0
              ? `<div class="object-props-row">
              <span class="object-props-label">Total perimeter</span>
              <span class="object-props-value">${data.totalPerimeterMm.toFixed(1)} mm</span>
            </div>`
              : ''
          }
        </div>`
      : data.showLoops
        ? `<p class="section-hint">No path loops detected on this object.</p>`
        : '';

  return `
    <div class="tools-panel">
      <h3 class="tools-panel-title">Object Properties</h3>
      <div class="object-props">
        <div class="object-props-row">
          <span class="object-props-label">Name</span>
          <span class="object-props-value">${data.name}</span>
        </div>
        ${loopSection}
      </div>
    </div>
  `;
}

import { icons } from '../StudioShell/toolbarIcons';
import { workAreaConfig, STUDIO_ORIGINS, formatOriginLabel } from '../../modules/config/WorkAreaConfig';
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
        <span class="version-tag">Fabric · SVG layout</span>
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
        <button type="button" id="btn-load-demo-sidebar" class="tools-action-btn">Load Dummy Layout</button>
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
        <button type="button" class="tools-action-btn" data-open-vectorcore>Trace Image (Legacy Vectorizer)</button>
        <button type="button" class="tools-action-btn" data-open-panel="devlab">Canvas Feature Lab</button>
      </div>
    </div>
  `;
}

export function renderSetupPanel(): string {
  const cfg = workAreaConfig.getState();
  const u = cfg.unit;
  const originDots = STUDIO_ORIGINS.map(
    (pos) =>
      `<button type="button" class="origin-dot ${cfg.origin === pos ? 'active' : ''}" data-setup-origin="${pos}" title="${formatOriginLabel(pos)}" aria-label="${formatOriginLabel(pos)}"></button>`
  ).join('');

  return `
    <div class="panel-sidebar setup-panel-host">
      <div class="sidebar-header">
        <h1 class="logo-text">Material <span class="logo-accent">Setup</span></h1>
        <span class="version-tag">Bed size &amp; margins</span>
      </div>
      <div class="sidebar-content setup-panel">
        <h2 class="section-title">Material Size</h2>

        <div class="input-group">
          <label>Measurement Unit</label>
          <div class="unit-toggle" role="group" aria-label="Measurement unit">
            <button type="button" class="${cfg.unit === 'mm' ? 'active' : ''}" data-setup-unit="mm">Metric (mm)</button>
            <button type="button" class="${cfg.unit === 'inches' ? 'active' : ''}" data-setup-unit="inches">Imperial (in)</button>
          </div>
        </div>

        <div class="input-grid">
          <div class="input-group">
            <label for="setup-width">Block Width (X)</label>
            <div class="input-wrapper">
              <input id="setup-width" type="number" min="1" step="1" value="${cfg.blockSize.width}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
          <div class="input-group">
            <label for="setup-height">Block Height (Y)</label>
            <div class="input-wrapper">
              <input id="setup-height" type="number" min="1" step="1" value="${cfg.blockSize.height}" />
              <span class="unit-label">${u}</span>
            </div>
          </div>
        </div>

        <h2 class="section-title mt-4">Material Margins</h2>
        <p class="section-hint">
          Clearance inset from each material edge. Red dashed box moves with the canvas; negative values are allowed.
        </p>
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

        <div class="input-group mt-4">
          <label for="setup-object-gap">Object Gap</label>
          <div class="input-wrapper">
            <input id="setup-object-gap" type="number" min="0" step="1" value="${cfg.objectGap}" />
            <span class="unit-label">${u}</span>
          </div>
          <p class="section-hint">Space between objects when importing SVGs (auto-place to the right).</p>
        </div>

        <div class="input-group mt-4">
          <label>Work Area Origin</label>
          <div class="origin-selector-container">
            <div class="origin-grid" role="group" aria-label="Work area origin">
              ${originDots}
            </div>
            <div class="origin-current-label">
              Origin: <strong>${formatOriginLabel(cfg.origin)}</strong>
            </div>
          </div>
        </div>

        <h2 class="section-title mt-6">Hardware Speeds</h2>
        <div class="input-group">
          <label for="setup-feed-rate">Cutting Speed (Feed Rate)</label>
          <div class="input-wrapper">
            <input id="setup-feed-rate" type="number" min="1" step="1" value="${cfg.feedRate}" />
            <span class="unit-label">${u}/min</span>
          </div>
        </div>
        <div class="input-group">
          <label for="setup-dwell-time">Pre-Heat Time</label>
          <div class="input-wrapper">
            <input id="setup-dwell-time" type="number" min="0" step="0.1" value="${cfg.dwellTime}" />
            <span class="unit-label">sec</span>
          </div>
        </div>

        <button type="button" id="btn-setup-apply-home" class="tools-action-btn mt-4">Apply &amp; fit home view</button>
      </div>
    </div>
  `;
}

export function renderVectorizerPanel(): string {
  return `
    <div class="panel-sidebar vectorizer-panel-host">
      <div class="sidebar-header">
        <h1 class="logo-text">Trace <span class="logo-accent">Image</span></h1>
        <span class="version-tag">Legacy · :3009</span>
      </div>
      <div class="sidebar-content">
        <p class="section-hint">
          Opens the production vectorizer from FoamArt Studio (:3009) inside NC7 Studio.Fabric.
          Trace your image, then choose <strong>Send to Foam Bed Canvas</strong> to import SVG paths here.
        </p>
        <button type="button" class="tools-action-btn" data-open-vectorcore>Open Legacy Vectorizer</button>
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

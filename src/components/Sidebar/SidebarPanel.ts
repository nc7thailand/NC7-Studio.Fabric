import { icons } from '../StudioShell/toolbarIcons';
import { workAreaConfig } from '../../modules/config/WorkAreaConfig';
import type { SceneObject } from '../../modules/canvas/WorkAreaManager';

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
        <span class="version-tag">Phase 2c · SVG + sync</span>
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
        <button type="button" class="tools-action-btn" disabled>Trace Image (Phase 3)</button>
        <button type="button" class="tools-action-btn" data-open-panel="devlab">Canvas Feature Lab</button>
      </div>
    </div>
  `;
}

export function renderSetupPanel(): string {
  const cfg = workAreaConfig.getState();
  return `
    <div class="panel-sidebar">
      <div class="sidebar-header">
        <h1 class="logo-text">Material <span class="logo-accent">Setup</span></h1>
        <span class="version-tag">Canvas size &amp; origin</span>
      </div>
      <div class="sidebar-content">
        <div class="input-group">
          <label>Block width</label>
          <div class="input-wrapper">
            <input type="number" value="${cfg.blockSize.width}" disabled />
            <span class="unit-label">mm</span>
          </div>
        </div>
        <div class="input-group">
          <label>Block height</label>
          <div class="input-wrapper">
            <input type="number" value="${cfg.blockSize.height}" disabled />
            <span class="unit-label">mm</span>
          </div>
        </div>
        <p class="section-hint">Margins ${cfg.margins.left} mm — editable in Phase 3</p>
      </div>
    </div>
  `;
}

export function renderObjectPanel(selectedName: string | null): string {
  return `
    <div class="tools-panel">
      <h3 class="tools-panel-title">Object Properties</h3>
      <div class="object-props">
        <div class="object-props-row">
          <span class="object-props-label">Name</span>
          <span class="object-props-value">${selectedName ?? '—'}</span>
        </div>
      </div>
    </div>
  `;
}

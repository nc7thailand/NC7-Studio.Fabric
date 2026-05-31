import { icons } from '../StudioShell/toolbarIcons';
import { workAreaConfig } from '../../modules/config/WorkAreaConfig';

export function renderFileSidebar(objectCount: number): string {
  return `
    <aside class="panel-sidebar">
      <div class="sidebar-header">
        <h1 class="logo-text">NC7 Studio<span class="logo-accent">.Fabric</span></h1>
        <span class="version-tag">Phase 2a · 2D canvas</span>
      </div>
      <div class="tabs-nav">
        <button type="button" class="tab-btn active" data-tab="files">
          ${icons.layers}
          <span>.SVG files (${objectCount})</span>
        </button>
      </div>
      <div class="sidebar-content">
        <div class="section-title">Import</div>
        <p class="section-hint">SVG upload — Phase 2b</p>
        <button type="button" class="tools-action-btn" disabled>
          ${icons.upload}
          <span style="margin-left:8px">Upload SVG (soon)</span>
        </button>
        <button type="button" id="btn-load-demo-sidebar" class="tools-action-btn mt-4">
          Load demo rectangle
        </button>
        <div class="section-title mt-6">On bed</div>
        <ul id="sidebar-object-list" class="file-list">
          <li class="section-hint">No SVG files yet — use toolbar or demo button</li>
        </ul>
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
        <button type="button" class="tools-action-btn" disabled>Canvas Feature Lab (Phase 2)</button>
      </div>
    </div>
  `;
}

export function renderSetupPanel(): string {
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
            <input type="number" value="${workAreaConfig.getState().blockSize.width}" disabled />
            <span class="unit-label">mm</span>
          </div>
        </div>
        <div class="input-group">
          <label>Block height</label>
          <div class="input-wrapper">
            <input type="number" value="${workAreaConfig.getState().blockSize.height}" disabled />
            <span class="unit-label">mm</span>
          </div>
        </div>
        <p class="section-hint">Margins ${workAreaConfig.getState().margins.left} mm — editable in Phase 2c</p>
      </div>
    </div>
  `;
}

export function renderObjectPanel(): string {
  return `
    <div class="tools-panel">
      <h3 class="tools-panel-title">Object Properties</h3>
      <p class="section-hint">Double-click object — Phase 2b</p>
      <div class="object-props">
        <div class="object-props-row">
          <span class="object-props-label">Type</span>
          <span class="object-props-value" id="obj-prop-type">—</span>
        </div>
      </div>
    </div>
  `;
}

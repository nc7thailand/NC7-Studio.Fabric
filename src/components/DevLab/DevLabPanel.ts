import { LAB_FEATURE_GROUPS, labOptions } from '../../modules/devlab/LabOptions';
import { canvasPalette } from '../../modules/devlab/CanvasPalette';

export function renderDevLabPanel(): string {
  const flags = labOptions.getFlags();
  const palette = canvasPalette.getState();
  const rows = LAB_FEATURE_GROUPS.flatMap((group) =>
    group.features
      .filter((f) => f.status === 'live')
      .map(
        (f) => `
        <label class="devlab-row">
          <input type="checkbox" data-lab-flag="${f.id}" ${flags[f.id] ? 'checked' : ''} />
          <span>
            <strong>${f.id}</strong> — ${f.label}
            <small>${f.detail}</small>
          </span>
        </label>`
      )
  ).join('');

  return `
    <div class="tools-panel devlab-panel">
      <h3 class="tools-panel-title">Canvas Feature Lab</h3>
      <p class="section-hint">Toggle flags, Save, then refresh page (same as main Studio).</p>
      <div class="devlab-palette">
        <h4 class="devlab-subtitle">Canvas Palette Options</h4>

        <div class="devlab-palette-row">
          <div class="devlab-palette-label">Object Stroke Color</div>
          <div class="devlab-swatch-group" role="group" aria-label="Object stroke color">
            <button type="button" class="devlab-swatch ${palette.objectStroke === '#F5F5F7' ? 'active' : ''}" data-palette-stroke="#F5F5F7" style="--swatch:#F5F5F7" title="White"></button>
            <button type="button" class="devlab-swatch ${palette.objectStroke === '#22d3ee' ? 'active' : ''}" data-palette-stroke="#22d3ee" style="--swatch:#22d3ee" title="Cyan"></button>
            <button type="button" class="devlab-swatch ${palette.objectStroke === '#8CE8C5' ? 'active' : ''}" data-palette-stroke="#8CE8C5" style="--swatch:#8CE8C5" title="Green"></button>
            <button type="button" class="devlab-swatch ${palette.objectStroke === '#ef4444' ? 'active' : ''}" data-palette-stroke="#ef4444" style="--swatch:#ef4444" title="Red"></button>
          </div>
        </div>

        <div class="devlab-palette-row">
          <div class="devlab-palette-label">Handle/Corner Color</div>
          <div class="devlab-swatch-group" role="group" aria-label="Handle and corner color">
            <button type="button" class="devlab-swatch ${palette.handleCorner === '#FFD700' ? 'active' : ''}" data-palette-handle="#FFD700" style="--swatch:#FFD700" title="Yellow"></button>
            <button type="button" class="devlab-swatch ${palette.handleCorner === '#f97316' ? 'active' : ''}" data-palette-handle="#f97316" style="--swatch:#f97316" title="Orange"></button>
            <button type="button" class="devlab-swatch ${palette.handleCorner === '#F5F5F7' ? 'active' : ''}" data-palette-handle="#F5F5F7" style="--swatch:#F5F5F7" title="White"></button>
          </div>
        </div>
      </div>
      <div class="devlab-list">${rows}</div>
      <div class="devlab-actions">
        <button type="button" id="devlab-save" class="tools-action-btn">Save</button>
        <button type="button" id="devlab-reset" class="tools-action-btn">Reset defaults</button>
      </div>
    </div>
  `;
}

export function bindDevLabPanel(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[data-lab-flag]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-lab-flag');
      if (id) labOptions.setEnabled(id, input.checked);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-palette-stroke]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-palette-stroke');
      if (!color) return;
      canvasPalette.setObjectStroke(color);
      const host = root.querySelector('#devlab-panel-host');
      if (host instanceof HTMLElement) host.innerHTML = renderDevLabPanel();
      bindDevLabPanel(root);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-palette-handle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-palette-handle');
      if (!color) return;
      canvasPalette.setHandleCorner(color);
      const host = root.querySelector('#devlab-panel-host');
      if (host instanceof HTMLElement) host.innerHTML = renderDevLabPanel();
      bindDevLabPanel(root);
    });
  });

  root.querySelector('#devlab-save')?.addEventListener('click', () => {
    labOptions.save();
    alert('Dev Lab saved. Refresh the page to apply.');
  });
  root.querySelector('#devlab-reset')?.addEventListener('click', () => {
    labOptions.reset();
    location.reload();
  });
}

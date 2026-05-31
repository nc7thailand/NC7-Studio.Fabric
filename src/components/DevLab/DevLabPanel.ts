import { LAB_FEATURE_GROUPS, labOptions } from '../../modules/devlab/LabOptions';

export function renderDevLabPanel(): string {
  const flags = labOptions.getFlags();
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
  root.querySelector('#devlab-save')?.addEventListener('click', () => {
    labOptions.save();
    alert('Dev Lab saved. Refresh the page to apply.');
  });
  root.querySelector('#devlab-reset')?.addEventListener('click', () => {
    labOptions.reset();
    location.reload();
  });
}

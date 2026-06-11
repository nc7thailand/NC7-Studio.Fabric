/** Leave-page alarm — disabled for now; re-enable via StudioShell + registerLeaveAlarmDom(). */

import { hasUnsavedChanges } from './unsavedChanges';

export type LeaveAlarmDom = {
  show: () => void;
  hide: () => void;
};

let dom: LeaveAlarmDom | null = null;
let guardBound = false;
let leaveConfirmed = false;
let leaveAfterHide: 'back' | 'reload' | null = null;

function shouldBlockLeave(): boolean {
  return !leaveConfirmed && hasUnsavedChanges();
}

function onDocumentEdited(): void {
  leaveConfirmed = false;
}

function pinHistory(): void {
  try {
    history.pushState({ nc7LeaveGuard: true }, '', window.location.href);
  } catch {
    /* ignore */
  }
}

function bindPageLeaveGuard(): void {
  if (guardBound || typeof window === 'undefined') return;
  guardBound = true;

  pinHistory();

  window.addEventListener('popstate', () => {
    if (!shouldBlockLeave()) return;
    pinHistory();
    leaveAfterHide = 'back';
    dom?.show();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!shouldBlockLeave()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('keydown', (event) => {
    if (!shouldBlockLeave()) return;
    const key = event.key.toLowerCase();
    const isReload =
      key === 'f5' || ((event.metaKey || event.ctrlKey) && key === 'r' && !event.shiftKey);
    if (!isReload) return;
    event.preventDefault();
    leaveAfterHide = 'reload';
    dom?.show();
  });

  window.addEventListener('nc7:document-edited', onDocumentEdited);
}

/** Wire history / beforeunload to alarm DOM (show / hide only). */
export function registerLeaveAlarmDom(hooks: LeaveAlarmDom): void {
  dom = hooks;
  bindPageLeaveGuard();
}

/** Stay — hide alarm only. Page is already pinned in history. */
export function stayOnPage(): void {
  leaveAfterHide = null;
  dom?.hide();
}

/** Leave — hide alarm, then navigate away. */
export function leavePage(): void {
  const action = leaveAfterHide ?? 'back';
  leaveAfterHide = null;
  leaveConfirmed = true;
  dom?.hide();

  if (action === 'reload') {
    window.location.reload();
    return;
  }

  history.back();
}

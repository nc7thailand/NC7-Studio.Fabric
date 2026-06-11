/** Tracks edits since last Save SVG — drives leave-page warning (option B). */

export const LEAVE_WARNING_MESSAGE =
  'You have unsaved changes since the last Save SVG. Leave anyway?';

let revision = 0;
let savedRevision = 0;

export function markDocumentChanged(): void {
  revision += 1;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nc7:document-edited'));
  }
}

export function markDocumentSaved(): void {
  savedRevision = revision;
}

export function hasUnsavedChanges(): boolean {
  return revision !== savedRevision;
}

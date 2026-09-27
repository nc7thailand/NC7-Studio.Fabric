/** Supported layout interchange formats (SVG default). */

export type LayoutExportFormat = 'svg' | 'dxf' | 'dwg';

export const LAYOUT_OPEN_ACCEPT =
  '.svg,.dxf,.dwg,image/svg+xml,application/dxf,image/vnd.dxf,application/acad,application/x-acad,image/x-dwg,application/dwg';

export const LAYOUT_EXPORT_DEFAULT: LayoutExportFormat = 'svg';

export const LAYOUT_EXPORT_FILENAME_BASE = 'nc7-foamart-export';

export function extensionOfFileName(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase();
}

export function detectLayoutImportFormat(
  file: File
): 'svg' | 'dxf' | 'dwg' | 'unknown' {
  const ext = extensionOfFileName(file.name);
  if (ext === 'svg' || file.type === 'image/svg+xml') return 'svg';
  if (ext === 'dxf' || file.type.includes('dxf')) return 'dxf';
  if (ext === 'dwg' || file.type.includes('dwg') || file.type.includes('acad')) {
    return 'dwg';
  }
  return 'unknown';
}

export function downloadTextFile(
  text: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportFileName(
  format: LayoutExportFormat,
  base = LAYOUT_EXPORT_FILENAME_BASE
): string {
  if (format === 'dwg') return `${base}.dxf`;
  return `${base}.${format}`;
}

export const DWG_IMPORT_MESSAGE =
  'DWG binary files cannot be opened in the browser. Please convert the file to DXF or SVG (AutoCAD, LibreCAD, ODA File Converter, etc.) and open that instead.';

export const DWG_EXPORT_MESSAGE =
  'Native DWG export is not available in the browser. Exporting DXF instead — most CAD tools open DXF, or convert DXF → DWG offline.';

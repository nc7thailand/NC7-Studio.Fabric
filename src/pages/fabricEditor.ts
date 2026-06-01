import '../styles/editor.css';
import { FabricEditorShell } from '../components/FabricEditorShell/FabricEditorShell';

export function mountFabricEditor(mountSelector = '#app'): () => void {
  const shell = new FabricEditorShell(mountSelector);
  shell.mount();
  return () => {
    shell.destroy();
  };
}

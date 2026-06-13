import { VectorLinkerSandboxShell } from '../components/VectorLinkerSandbox/VectorLinkerSandboxShell';

export function mountVectorLinkerSandbox(mountSelector = '#app'): () => void {
  const shell = new VectorLinkerSandboxShell(mountSelector);
  shell.mount();
  return () => {
    shell.destroy();
  };
}


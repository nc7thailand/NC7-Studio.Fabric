import './styles/studio.css';
import { applyFabricCncDefaults } from './modules/fabric/fabricCncDefaults';
import { StudioShell } from './components/StudioShell/StudioShell';
import { mountVectorCoreEmbed } from './pages/vectorcoreEmbed';

applyFabricCncDefaults();

const path = typeof window !== 'undefined' ? window.location.pathname : '/';
if (path.startsWith('/vectorcore')) {
  mountVectorCoreEmbed('#app');
} else if (path.startsWith('/vector-linker-sandbox')) {
  import('./pages/vectorLinkerSandbox').then(({ mountVectorLinkerSandbox }) => {
    mountVectorLinkerSandbox('#app');
  });
} else if (path.startsWith('/editor')) {
  import('./pages/fabricEditor').then(({ mountFabricEditor }) => {
    mountFabricEditor('#app');
  });
} else {
  const shell = new StudioShell('#app');
  shell.mount();
  if (typeof window !== 'undefined') {
    (window as Window & { __foamartStudioShell?: StudioShell }).__foamartStudioShell = shell;
  }
}

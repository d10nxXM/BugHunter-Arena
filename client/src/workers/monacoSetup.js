/**
 * Monaco from the local `monaco-editor` package, never a CDN.
 *
 * Only the core editor API, the Python tokenizer and the generic editor worker are loaded: no
 * language workers (TS, JSON, CSS, HTML). The editor worker comes in through a Vite `?worker`
 * import, so it is bundled into dist/assets.
 *
 * Monaco is used directly instead of through @monaco-editor/react: that package's loader ships a
 * default public-CDN path in its config, which would end up in dist/assets.
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/python/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

export { monaco };

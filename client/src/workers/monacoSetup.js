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

// Editor theme on the site's surface colors (src/index.css), so the editor matches the cards.
// CodeEditor selects it by this name.
monaco.editor.defineTheme('bughunter-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8d9bb0', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'string', foreground: 'c3e88d' },
  ],
  colors: {
    'editor.background': '#0f141c',
    'editor.foreground': '#e6edf6',
    'editor.lineHighlightBackground': '#161e29',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#263243',
    'editorCursor.foreground': '#5eea8c',
    'editorIndentGuide.background1': '#1c2532',
    'editorWidget.background': '#18202c',
    'scrollbarSlider.background': '#26324380',
    'scrollbarSlider.hoverBackground': '#263243',
  },
});

export { monaco };

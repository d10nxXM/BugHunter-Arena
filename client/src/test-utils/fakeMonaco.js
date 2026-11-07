/**
 * Test double for `workers/monacoSetup.js`. Real Monaco needs a browser (matchMedia, layout), so
 * page tests mock that module with this. The real CodeEditor still renders, with its gutter
 * buttons, "Reset to original" and props; only the editing surface is a textarea that carries
 * Monaco's `ariaLabel` option ("Code editor"), like the real editor's input does.
 */
function emitter() {
  const listeners = new Set();
  return {
    on(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    fire(event) {
      listeners.forEach((listener) => listener(event));
    },
  };
}

class Range {
  constructor(startLine, startColumn, endLine, endColumn) {
    Object.assign(this, { startLine, startColumn, endLine, endColumn });
  }
}

function createEditor(container, options) {
  const textarea = document.createElement('textarea');
  textarea.setAttribute('aria-label', options.ariaLabel ?? '');
  textarea.readOnly = Boolean(options.readOnly);
  textarea.value = options.value;
  container.appendChild(textarea);
  const content = emitter();
  const scroll = emitter();
  const size = emitter();
  let applying = false;
  textarea.addEventListener('input', () => {
    if (!applying) content.fire({});
  });
  const model = {
    getValue: () => textarea.value,
    getFullModelRange: () => ({}),
    pushEditOperations: (_selections, edits) => {
      applying = true;
      textarea.value = edits[0].text;
      applying = false;
    },
    dispose: () => {},
  };
  return {
    getValue: () => textarea.value,
    getModel: () => model,
    getContentHeight: () => textarea.value.split('\n').length * 24 + 16,
    onDidChangeModelContent: content.on,
    onDidScrollChange: scroll.on,
    onDidContentSizeChange: size.on,
    updateOptions: (next) => {
      if ('readOnly' in next) textarea.readOnly = Boolean(next.readOnly);
    },
    revealLine: () => {},
    createDecorationsCollection: () => ({ set: () => {} }),
    dispose: () => textarea.remove(),
  };
}

export const fakeMonaco = { editor: { create: createEditor }, Range };

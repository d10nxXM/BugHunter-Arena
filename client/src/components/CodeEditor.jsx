import { useEffect, useId, useRef, useState } from 'react';
import { monaco } from '../workers/monacoSetup.js';

const LINE_HEIGHT = 24; // px, matches the gutter buttons (h-6)
const PADDING = 8; // px, matches the gutter's pt-2
const MIN_LINES = 8;
const MAX_HEIGHT = 480; // px; longer code scrolls, and the gutter follows

// Security: no hovers, suggestions, links or markers, so no AI or student text is ever rendered
// as markdown or HTML by Monaco (dompurify advisory, see client/README.md).
const EDITOR_OPTIONS = {
  language: 'python',
  theme: 'vs-dark',
  ariaLabel: 'Editor koda',
  automaticLayout: true,
  fontSize: 14,
  lineHeight: LINE_HEIGHT,
  padding: { top: PADDING, bottom: PADDING },
  lineNumbers: 'off', // the gutter buttons show the numbers
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 8,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off', // one editor line per gutter button
  tabSize: 4,
  insertSpaces: true,
  hover: { enabled: false },
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  parameterHints: { enabled: false },
  links: false,
  contextmenu: false,
  occurrencesHighlight: 'off',
  renderValidationDecorations: 'off',
  scrollbar: { alwaysConsumeMouseWheel: false },
};

function clampHeight(contentHeight) {
  const min = MIN_LINES * LINE_HEIGHT + 2 * PADDING;
  return Math.min(MAX_HEIGHT, Math.max(min, contentHeight));
}

/**
 * Python code editor (Monaco) with a keyboard-accessible line gutter and "Vrati original".
 *
 * Props (stable, ChallengePage depends on them):
 *   code          current code (controlled)
 *   onChange      (code) => void
 *   selectedLines line numbers (1-based) marked as bug lines, default []
 *   onToggleLine  (lineNumber) => void
 *   readOnly      default false; also disables the gutter and "Vrati original"
 *   originalCode  optional; what "Vrati original" restores. Defaults to the first `code` value.
 */
export default function CodeEditor({
  code,
  onChange,
  selectedLines = [],
  onToggleLine,
  readOnly = false,
  originalCode,
}) {
  const [initialCode] = useState(code);
  const original = originalCode ?? initialCode;
  const containerRef = useRef(null);
  const gutterRef = useRef(null);
  const editorRef = useRef(null);
  const decorationsRef = useRef(null);
  const applyingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const [height, setHeight] = useState(() => clampHeight(0));
  const [focusLine, setFocusLine] = useState(1);
  const helpId = useId();

  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1);
  const activeLine = Math.min(focusLine, lineCount);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once.
  useEffect(() => {
    const editor = monaco.editor.create(containerRef.current, {
      ...EDITOR_OPTIONS,
      value: code,
      readOnly,
    });
    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection([]);
    const subscriptions = [
      editor.onDidChangeModelContent(() => {
        if (!applyingRef.current) onChangeRef.current?.(editor.getValue());
      }),
      editor.onDidScrollChange((event) => {
        if (gutterRef.current) gutterRef.current.scrollTop = event.scrollTop;
      }),
      editor.onDidContentSizeChange(() => setHeight(clampHeight(editor.getContentHeight()))),
    ];
    setHeight(clampHeight(editor.getContentHeight()));
    return () => {
      subscriptions.forEach((subscription) => subscription.dispose());
      const model = editor.getModel();
      editor.dispose();
      model?.dispose();
      editorRef.current = null;
      decorationsRef.current = null;
    };
    // Created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply code from the parent (for example "Vrati original") without echoing onChange.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model || model.getValue() === code) return;
    applyingRef.current = true;
    try {
      // pushEditOperations keeps the undo stack, unlike setValue.
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
    } finally {
      applyingRef.current = false;
    }
  }, [code]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Mark selected lines inside the editor too (background plus the gutter's marker).
  useEffect(() => {
    const collection = decorationsRef.current;
    if (!collection) return;
    collection.set(
      selectedLines
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= lineCount)
        .map((n) => ({
          range: new monaco.Range(n, 1, n, 1),
          // Monaco strips characters like '/' from decoration class names: keep it plain.
          options: { isWholeLine: true, className: 'bg-amber-950' },
        })),
    );
  }, [selectedLines, lineCount]);

  function focusGutterLine(n) {
    const target = Math.min(Math.max(n, 1), lineCount);
    setFocusLine(target);
    gutterRef.current?.querySelector(`[data-line="${target}"]`)?.focus();
  }

  function handleGutterKeyDown(event) {
    const keys = {
      ArrowDown: activeLine + 1,
      ArrowUp: activeLine - 1,
      Home: 1,
      End: lineCount,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    focusGutterLine(keys[event.key]);
  }

  const canReset = !readOnly && code !== original;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-hidden rounded border border-slate-700 bg-[#1e1e1e] font-mono text-sm text-slate-100">
        <div
          ref={gutterRef}
          role="group"
          aria-label="Izbor linija sa greškom"
          aria-describedby={helpId}
          onKeyDown={handleGutterKeyDown}
          className="shrink-0 overflow-hidden border-r border-slate-700"
          style={{ height }}
        >
          <div className="flex flex-col pt-2 pb-6">
            {lineNumbers.map((n) => {
              const selected = selectedLines.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  data-line={n}
                  tabIndex={n === activeLine ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`Linija ${n}`}
                  disabled={readOnly}
                  onClick={() => onToggleLine?.(n)}
                  onFocus={() => {
                    setFocusLine(n);
                    editorRef.current?.revealLine(n);
                  }}
                  className={`h-6 min-w-14 border-l-4 px-2 text-right leading-6 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none focus-visible:ring-inset disabled:cursor-default ${
                    selected
                      ? 'border-amber-400 bg-amber-200 font-bold text-slate-900'
                      : 'border-transparent text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {selected ? <span aria-hidden="true">▶ </span> : null}
                  {n}
                </button>
              );
            })}
          </div>
        </div>
        <div ref={containerRef} className="min-w-0 flex-1" style={{ height }} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p id={helpId} className="max-w-prose text-xs text-slate-600">
          Klikni broj linije da je označiš kao liniju sa greškom. Strelice gore i dolje pomjeraju
          izbor između linija. U editoru Tab uvlači red; Ctrl+M uključuje prelazak tasterom Tab.
        </p>
        <button
          type="button"
          onClick={() => onChange?.(original)}
          disabled={!canReset}
          className="rounded border border-slate-400 bg-white px-3 py-1 text-sm text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-500"
        >
          Vrati original
        </button>
      </div>
    </div>
  );
}

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
  theme: 'bughunter-dark', // defined in workers/monacoSetup.js
  ariaLabel: 'Code editor',
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
 * Python code editor (Monaco) with a keyboard-accessible line gutter and "Reset to original".
 *
 * Props (stable, ChallengePage depends on them):
 *   code          current code (controlled)
 *   onChange      (code) => void
 *   selectedLines line numbers (1-based) marked as bug lines, default []
 *   onToggleLine  (lineNumber) => void
 *   readOnly      default false; also makes the gutter aria-disabled (still focusable) and disables "Reset to original"
 *   originalCode  optional; what "Reset to original" restores. Defaults to the first `code` value.
 *   fileName      optional; shown in the title bar, e.g. "find_max.py".
 */
export default function CodeEditor({
  code,
  onChange,
  selectedLines = [],
  onToggleLine,
  readOnly = false,
  originalCode,
  fileName,
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

  // Apply code from the parent (for example "Reset to original") without echoing onChange.
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
          options: { isWholeLine: true, className: 'bg-amber-soft' },
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
    <div className="flex flex-col gap-3">
      {/* On phones the parent lets the editor bleed to the screen edges: no side border or radius. */}
      <div className="overflow-hidden rounded-[14px] border border-border-strong bg-surface max-sm:rounded-none max-sm:border-x-0">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 py-2 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="hidden gap-2 sm:flex">
              <span className="size-[11px] rounded-full bg-border-strong" />
              <span className="size-[11px] rounded-full bg-border-strong" />
              <span className="size-[11px] rounded-full bg-border-strong" />
            </span>
            {fileName && (
              <span className="truncate font-mono text-[13px] text-subtle">{fileName}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange?.(original)}
            disabled={!canReset}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-surface-3 hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <span aria-hidden="true">↺</span>
            Reset to original
          </button>
        </div>
        <div className="flex font-mono text-sm text-text">
          <div
            ref={gutterRef}
            role="group"
            aria-label="Choose the lines with the bug"
            aria-describedby={helpId}
            onKeyDown={handleGutterKeyDown}
            className="shrink-0 overflow-hidden border-r border-border bg-surface"
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
                    aria-label={`Line ${n}`}
                    aria-disabled={readOnly}
                    onClick={() => {
                      // aria-disabled (not disabled) keeps the button focusable for keyboard users.
                      if (!readOnly) onToggleLine?.(n);
                    }}
                    onFocus={() => {
                      setFocusLine(n);
                      editorRef.current?.revealLine(n);
                    }}
                    className={`h-6 min-w-12 border-l-[3px] px-2 text-right leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber aria-disabled:cursor-default sm:min-w-14 ${
                      selected
                        ? 'border-amber bg-amber-soft font-bold text-amber'
                        : 'border-transparent text-subtle hover:bg-surface-2 hover:text-muted'
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
      </div>
      <p id={helpId} className="text-[13px] leading-relaxed text-subtle max-sm:px-4">
        Click a line number to flag it as a bug line. The up and down arrows move between line
        numbers. In the editor, Tab indents; Ctrl+M switches Tab to moving focus.
      </p>
    </div>
  );
}

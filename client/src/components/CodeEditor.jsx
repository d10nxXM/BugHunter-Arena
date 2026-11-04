// M1 stub: a line-number gutter and a plain textarea.
// Worker D replaces it with Monaco (local package, no CDN) and adds "Vrati original".
export default function CodeEditor({
  code,
  onChange,
  selectedLines = [],
  onToggleLine,
  readOnly = false,
}) {
  const lineNumbers = code.split('\n').map((_, index) => index + 1);

  return (
    <div className="flex rounded border border-slate-700 bg-slate-900 font-mono text-sm text-slate-100">
      <div className="flex flex-col border-r border-slate-700 py-2">
        {lineNumbers.map((n) => {
          const selected = selectedLines.includes(n);
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={`Linija ${n}`}
              disabled={readOnly}
              onClick={() => onToggleLine?.(n)}
              className={`px-2 text-right leading-6 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none disabled:cursor-default ${
                selected ? 'bg-amber-200 font-bold text-slate-900' : 'text-slate-300'
              }`}
            >
              {selected ? '▶ ' : ''}
              {n}
            </button>
          );
        })}
      </div>
      <textarea
        aria-label="Editor koda"
        value={code}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        rows={lineNumbers.length}
        wrap="off"
        spellCheck={false}
        className="flex-1 resize-none overflow-x-auto bg-transparent px-3 py-2 leading-6 whitespace-pre focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none"
      />
    </div>
  );
}

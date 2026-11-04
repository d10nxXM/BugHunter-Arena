import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CodeEditor from './CodeEditor.jsx';

// Monaco does not run in jsdom. A small fake stands in for the editor API used by CodeEditor.
const fake = vi.hoisted(() => {
  const state = { editors: [] };

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

  function createEditor(container, options) {
    let value = options.value;
    const content = emitter();
    const scroll = emitter();
    const size = emitter();
    const model = {
      getValue: () => value,
      getFullModelRange: () => ({}),
      pushEditOperations: vi.fn((_selections, edits) => {
        value = edits[0].text;
        content.fire({});
      }),
      dispose: vi.fn(),
    };
    const editor = {
      options,
      container,
      model,
      decorations: [],
      getValue: () => value,
      getModel: () => model,
      getContentHeight: () => value.split('\n').length * 24 + 16,
      onDidChangeModelContent: content.on,
      onDidScrollChange: scroll.on,
      onDidContentSizeChange: size.on,
      updateOptions: vi.fn((next) => Object.assign(options, next)),
      revealLine: vi.fn(),
      createDecorationsCollection: () => ({
        set: (decorations) => {
          editor.decorations = decorations;
        },
      }),
      dispose: vi.fn(),
      // Test helpers: what a user typing in Monaco or scrolling it would cause.
      type(next) {
        value = next;
        content.fire({});
      },
      scrollTo(scrollTop) {
        scroll.fire({ scrollTop });
      },
    };
    state.editors.push(editor);
    return editor;
  }

  class Range {
    constructor(startLine, startColumn, endLine, endColumn) {
      Object.assign(this, { startLine, startColumn, endLine, endColumn });
    }
  }

  return { state, monaco: { editor: { create: vi.fn(createEditor) }, Range } };
});

vi.mock('../workers/monacoSetup.js', () => ({ monaco: fake.monaco }));

const CODE = 'def find_max(numbers):\n    max_value = 0\n    return max_value';

function lastEditor() {
  return fake.state.editors.at(-1);
}

/** A parent that owns the state, like ChallengePage. */
function Harness({ initialCode = CODE, readOnly = false, originalCode, onChangeSpy }) {
  const [code, setCode] = useState(initialCode);
  const [selected, setSelected] = useState([]);
  return (
    <CodeEditor
      code={code}
      onChange={(next) => {
        onChangeSpy?.(next);
        setCode(next);
      }}
      selectedLines={selected}
      onToggleLine={(n) =>
        setSelected((lines) => (lines.includes(n) ? lines.filter((l) => l !== n) : [...lines, n]))
      }
      readOnly={readOnly}
      originalCode={originalCode}
    />
  );
}

beforeEach(() => {
  fake.state.editors.length = 0;
  fake.monaco.editor.create.mockClear();
});

describe('CodeEditor', () => {
  it('creates a Python Monaco editor with no hovers, suggestions or links', () => {
    render(<Harness />);
    expect(fake.monaco.editor.create).toHaveBeenCalledTimes(1);
    const { options } = lastEditor();
    expect(options).toMatchObject({
      value: CODE,
      language: 'python',
      readOnly: false,
      hover: { enabled: false },
      quickSuggestions: false,
      links: false,
      lineNumbers: 'off',
      wordWrap: 'off',
    });
  });

  it('shows one gutter button per line', () => {
    render(<Harness />);
    const buttons = screen.getAllByRole('button', { name: /^Linija \d+$/ });
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
  });

  it('toggles a line on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const line2 = screen.getByRole('button', { name: 'Linija 2' });

    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'true');
    expect(lastEditor().decorations).toHaveLength(1);
    expect(lastEditor().decorations[0].range.startLine).toBe(2);

    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'false');
    expect(lastEditor().decorations).toHaveLength(0);
  });

  it('selects lines by keyboard: one tab stop, arrows move, Space and Enter toggle', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Linija 1' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    const line2 = screen.getByRole('button', { name: 'Linija 2' });
    expect(line2).toHaveFocus();
    expect(lastEditor().revealLine).toHaveBeenLastCalledWith(2);

    await user.keyboard(' ');
    expect(line2).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{End}');
    const line3 = screen.getByRole('button', { name: 'Linija 3' });
    expect(line3).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(line3).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{ArrowDown}');
    expect(line3).toHaveFocus(); // stays on the last line

    await user.keyboard('{Home}{ArrowUp}');
    expect(screen.getByRole('button', { name: 'Linija 1' })).toHaveFocus();

    // Only the focused line is a tab stop, so Tab leaves the gutter.
    expect(
      screen.getAllByRole('button', { name: /^Linija/ }).filter((b) => b.tabIndex === 0),
    ).toHaveLength(1);
  });

  it('reports typed code through onChange and grows the gutter', async () => {
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    act(() => lastEditor().type(`${CODE}\n# kraj`));
    expect(onChangeSpy).toHaveBeenLastCalledWith(`${CODE}\n# kraj`);
    expect(screen.getAllByRole('button', { name: /^Linija \d+$/ })).toHaveLength(4);
  });

  it('"Vrati original" restores the original code', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    const reset = screen.getByRole('button', { name: 'Vrati original' });
    expect(reset).toBeDisabled(); // nothing to restore yet

    act(() => lastEditor().type('def find_max(numbers):\n    return None'));
    expect(reset).toBeEnabled();

    await user.click(reset);
    expect(onChangeSpy).toHaveBeenLastCalledWith(CODE);
    expect(lastEditor().getValue()).toBe(CODE);
    // Applied with pushEditOperations (keeps undo) and not echoed back as a second change.
    expect(lastEditor().model.pushEditOperations).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledTimes(2);
    expect(reset).toBeDisabled();
  });

  it('"Vrati original" uses originalCode when given', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness initialCode="x = 1" originalCode={CODE} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('button', { name: 'Vrati original' }));
    expect(onChangeSpy).toHaveBeenLastCalledWith(CODE);
  });

  it('readOnly disables the gutter and "Vrati original" and makes Monaco read-only', async () => {
    const user = userEvent.setup();
    const onToggleLine = vi.fn();
    const { rerender } = render(
      <CodeEditor code={CODE} onChange={() => {}} onToggleLine={onToggleLine} readOnly />,
    );
    expect(lastEditor().options.readOnly).toBe(true);
    for (const button of screen.getAllByRole('button', { name: /^Linija/ })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Vrati original' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Linija 1' }));
    expect(onToggleLine).not.toHaveBeenCalled();

    rerender(<CodeEditor code={CODE} onChange={() => {}} onToggleLine={onToggleLine} />);
    expect(lastEditor().updateOptions).toHaveBeenLastCalledWith({ readOnly: false });
    expect(screen.getByRole('button', { name: 'Linija 1' })).toBeEnabled();
  });

  it('keeps the gutter scrolled with the editor', () => {
    render(<Harness />);
    act(() => lastEditor().scrollTo(48));
    expect(screen.getByRole('group', { name: 'Izbor linija sa greškom' }).scrollTop).toBe(48);
  });

  it('selectedLines defaults to none and ignores out-of-range lines', () => {
    const { rerender } = render(<CodeEditor code={CODE} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Linija 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    rerender(<CodeEditor code={CODE} onChange={() => {}} selectedLines={[1, 99]} />);
    expect(lastEditor().decorations.map((d) => d.range.startLine)).toEqual([1]);
  });

  it('disposes the editor and its model on unmount', () => {
    const { unmount } = render(<Harness />);
    const editor = lastEditor();
    unmount();
    expect(editor.dispose).toHaveBeenCalled();
    expect(editor.model.dispose).toHaveBeenCalled();
  });
});

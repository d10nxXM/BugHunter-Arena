import { Component } from 'react';

/**
 * Catches render errors in a page so the header and navigation survive. Shows a fixed Montenegrin
 * message, never the error text or stack. Layout keys it on the pathname, so navigating resets it.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      // Name only; React already logs the full error in development.
      console.warn('[ui] page error:', error?.name ?? 'Error');
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
        <p className="font-semibold">
          <span aria-hidden="true">⚠ </span>
          Došlo je do greške.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 rounded bg-red-800 px-3 py-1.5 font-medium text-white hover:bg-red-900 focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Učitaj ponovo
        </button>
      </div>
    );
  }
}

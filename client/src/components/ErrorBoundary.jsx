import { Component } from 'react';

/**
 * Catches render errors in a page so the header and navigation survive. Shows a fixed English
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
      <div className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-6">
        <div
          role="alert"
          className="rounded-[14px] border border-hard/40 bg-hard-soft p-5 text-text"
        >
          <p className="font-semibold text-heading">
            <span aria-hidden="true" className="text-hard">
              ⚠{' '}
            </span>
            Something went wrong.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-accent px-4 font-semibold text-accent-ink hover:bg-easy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

import { Component, type ReactNode } from "react";

/**
 * Frame-owned error boundary (prd-web.md 3.3 rule 8): a themed typed
 * page with recovery paths - never a raw stack trace inside the app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-err/40 bg-err/5 p-4 text-sm">
          <p className="font-medium text-err">This module broke, the frame caught it</p>
          <p className="mt-1 text-ink-soft">
            The rest of the dashboard still works. Copy this for the audit page:

          </p>
          <p className="mt-2 font-mono text-xs text-ink-soft">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded border border-line px-2 py-1 hover:bg-ink/5"
          >
            Retry module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

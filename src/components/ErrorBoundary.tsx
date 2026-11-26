import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('SokeriReport could not render the report', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="shell">
        <div className="crash-card" role="alert">
          <h1>The report could not be rendered</h1>
          <p>
            Your file was parsed inside this tab only, so reloading clears it and nothing was sent
            anywhere. If this happens again, try a shorter report period or a smaller export.
          </p>
          <p className="crash-detail">{this.state.error.message}</p>
          <div className="print-modal-actions">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

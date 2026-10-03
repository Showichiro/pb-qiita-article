/** @jsxImportSource react */
import { Component, type ReactNode } from "react";
import { Button } from "./ui";

type QueryErrorBoundaryProps = {
  children: ReactNode;
  onReset: () => void;
  fallbackMessage: string;
};

type QueryErrorBoundaryState = {
  error: Error | null;
};

export class QueryErrorBoundary extends Component<
  QueryErrorBoundaryProps,
  QueryErrorBoundaryState
> {
  state: QueryErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): QueryErrorBoundaryState {
    return {
      error:
        error instanceof Error
          ? error
          : new Error("データを取得できませんでした"),
    };
  }

  render() {
    if (this.state.error)
      return (
        <div role="alert">
          <p>{this.state.error.message || this.props.fallbackMessage}</p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            再試行
          </Button>
        </div>
      );
    return this.props.children;
  }
}

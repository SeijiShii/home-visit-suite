// 起動診断用のエラーバウンダリ。
// レンダリング中の例外を握って画面に可視化する（真っ白で無反応になるのを防ぐ）。

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[RootErrorBoundary] render error", error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <pre
          style={{
            padding: 16,
            whiteSpace: "pre-wrap",
            color: "#b91c1c",
            fontFamily: "monospace",
          }}
        >
          {"レンダリングに失敗しました:\n\n"}
          {this.state.error.stack ?? this.state.error.message}
        </pre>
      );
    }
    return this.props.children;
  }
}

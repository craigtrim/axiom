import React from "react";
import { createRoot } from "react-dom/client";
import "flexlayout-react/style/combined.css";
import "./styles.css";
import { initialise } from "./client";
import { App, applyTheme } from "./App";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div className="startup-error">
        <h1>Axiom could not display this workspace</h1>
        <p>{this.state.error}</p>
        <button
          onClick={() => {
            void window.axiom.preferences
              .load()
              .then((p) =>
                window.axiom.preferences.save({
                  ...p,
                  layout: undefined,
                  panelState: {},
                }),
              )
              .then(() => location.reload());
          }}
        >
          Reset layout and reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
root.render(<div className="startup">Loading Axiom...</div>);
initialise()
  .then(() => {
    applyTheme();
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  })
  .catch((e) =>
    root.render(
      <div className="startup-error">
        <h1>Axiom could not start</h1>
        <p>{e.message}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </div>,
    ),
  );

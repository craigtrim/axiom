import React from "react";
import { createRoot } from "react-dom/client";
import "flexlayout-react/style/combined.css";
import "./styles.css";
import { initialise } from "./client";
import { App, applyTheme } from "./App";
// craigtrim/axiom#182: uncaught window errors and render failures reach the error log.
function reportCrash(
  kind: "error" | "rejection" | "render",
  error: unknown,
  extra: { componentStack?: string; source?: string } = {},
) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  // Chromium raises this layout notice as a window error; nothing has failed.
  if (/ResizeObserver loop/.test(message)) return;
  void window.axiom?.audit
    .crash({
      kind,
      message,
      stack: error instanceof Error ? error.stack : undefined,
      ...extra,
    })
    .catch(() => {});
}
window.addEventListener("error", (e) =>
  reportCrash("error", e.error ?? e.message, {
    source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
  }),
);
window.addEventListener("unhandledrejection", (e) =>
  reportCrash("rejection", e.reason),
);
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
// Each FlexLayout tab has its own boundary that records nothing, so render failures are
// reported at the root, whichever boundary catches them.
const rendered = (error: unknown, info: { componentStack?: string }) => {
  console.error(error);
  reportCrash("render", error, { componentStack: info.componentStack });
};
const root = createRoot(document.getElementById("root")!, {
  onCaughtError: rendered,
  onUncaughtError: rendered,
});
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

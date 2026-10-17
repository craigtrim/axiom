import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import { AdaptivePane } from "../../../src/renderer/AdaptivePane";
import {
  SharedActionRow,
  SharedMenu,
  SharedPane,
  usePaneToast,
} from "../../../src/renderer/SharedPane";

// Exercise production components in an isolated pane (craigtrim/axiom#81).
function Content() {
  const notify = usePaneToast();
  const [result, setResult] = useState("Ready");
  const [long, setLong] = useState(false);
  const second = useRef<HTMLButtonElement>(null);
  const action = (id: string) => ({ id, label: id, run: () => setResult(id) });
  return (
    <>
      <SharedActionRow
        label="Test actions"
        primary={
          <button
            className="btn primary"
            onClick={() => notify("Saved", result)}
          >
            Run scan
          </button>
        }
        state={
          long ? (
            "Scan failed, nothing was written. The retained report remains available for review."
          ) : (
            <>
              <span className="num">6,844</span> findings
            </>
          )
        }
        commands={[
          {
            id: "keep",
            priority: 10,
            content: <button className="btn">Keep longest</button>,
            overflow: [action("Keep longest")],
          },
          {
            id: "middle",
            priority: 20,
            content: <button className="btn">Move second</button>,
            overflow: [action("Move second")],
          },
          {
            id: "first",
            priority: 30,
            content: <button className="btn">Move first</button>,
            overflow: [action("Move first")],
          },
        ]}
        items={[
          action("Export findings"),
          {
            ...action("Unavailable"),
            disabled: true,
            reason: "No selected result",
          },
          action("Copy summary"),
        ]}
      />
      <div className="body rows">
        <input
          className="fld"
          aria-label="Retained draft"
          defaultValue="Draft"
        />
        <button className="btn" onClick={() => setLong(!long)}>
          Long state
        </button>
        <button
          className="btn"
          onClick={() => notify("Replaced", "Second message")}
        >
          Replace toast
        </button>
        <SharedMenu
          trigger={second}
          label="Other actions"
          items={[action("Other command")]}
        />
        <output>{result}</output>
      </div>
    </>
  );
}
function App() {
  return (
    <div id="host" style={{ width: 900, height: 500 }}>
      <AdaptivePane
        name="Test pane"
        paneId="shared-test"
        shared
        maximize={() => {
          const host = document.getElementById("host")!;
          host.style.width = "900px";
          host.style.height = "500px";
        }}
      >
        <SharedPane footer="Revision 4,812">
          <Content />
        </SharedPane>
      </AdaptivePane>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

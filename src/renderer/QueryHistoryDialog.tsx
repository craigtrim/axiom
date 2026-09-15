import { useEffect, useRef, useState } from "react";
import { Modal } from "./Dialogs";
import type {
  QueryHistoryView,
  QueryEntrySummary,
} from "../shared/query-history";
export function QueryHistoryDialog({
  history,
  select,
  close,
}: {
  history: QueryHistoryView;
  select: (id: string) => void;
  close: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const [search, setSearch] = useState(""),
    [items, setItems] = useState<QueryEntrySummary[]>(history.entries),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        void window.axiom.queryHistory
          .search(search)
          .then((rows) => {
            if (live) setItems(rows);
          })
          .catch((e) => live && setError(e.message)),
      120,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, history.revision]);
  return (
    <Modal title="Query history" close={close}>
      <div className="query-history-dialog">
        <input
          ref={input}
          type="search"
          aria-label="Find queries"
          placeholder="Find a query by its description or SPARQL"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="muted">
          {items.length} {items.length === 1 ? "query" : "queries"} · Newest
          first
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="query-history-list">
          {items
            .slice()
            .reverse()
            .slice(0, 100)
            .map((item) => (
              <button
                key={item.id}
                className={item.id === history.activeId ? "is-current" : ""}
                aria-current={item.id === history.activeId ? "true" : undefined}
                onClick={() => {
                  select(item.id);
                  close();
                }}
              >
                <strong>{item.title}</strong>
                <span>
                  {item.source === "agent"
                    ? "Generated"
                    : item.source === "example"
                      ? "Example"
                      : "Draft"}
                  {item.rows !== undefined
                    ? " · " + item.rows.toLocaleString() + " result rows"
                    : ""}{" "}
                  · {new Date(item.createdAt).toLocaleString()}
                  {item.origin ? " · " + item.origin : ""}
                </span>
                <code>{item.preview || "Empty query"}</code>
              </button>
            ))}
          {!items.length && <p>No matching queries.</p>}
        </div>
        {items.length > 100 && (
          <p>
            Showing the newest 100 matches. Refine the search to find older
            queries.
          </p>
        )}
      </div>
    </Modal>
  );
}

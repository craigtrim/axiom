import { useState } from "react";
import { tabTypes, tabDate, type SavedTab } from "../shared/tab-history";
import { useTabHistory, setTabSavePolicy } from "./tab-history";
import { preferences } from "./client";
import { Modal } from "./Dialogs";
export function TabHistoryPanel({
  open,
  openIds,
}: {
  open: (tab: SavedTab) => void;
  openIds: () => Set<string>;
}) {
  const history = useTabHistory();
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState(new Set<string>());
  const toggle = (id: string) =>
    setClosed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const rows = history.entries.filter((t) =>
    (t.name + " " + tabTypes[t.type] + " " + tabDate(t.createdAt))
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const groups = [...new Set(rows.map((t) => t.type))].sort((a, b) =>
    tabTypes[a].localeCompare(tabTypes[b]),
  );
  const opened = openIds();
  const [error, setError] = useState("");
  const activate = async (tab: SavedTab) => {
    setError("");
    try {
      await open(tab);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      className="panel tab-history-panel"
      data-panel="tabhistory"
      aria-label="Tab History"
    >
      <div className="tab-history-tools">
        <input
          type="search"
          aria-label="Filter tab history"
          placeholder="Filter saved tabs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="muted">
          {rows.length} saved {rows.length === 1 ? "tab" : "tabs"}
        </span>
      </div>
      {error && (
        <p role="alert" className="validation-error">
          {error}
        </p>
      )}
      {!rows.length && (
        <p className="tab-history-empty">
          {filter
            ? "No saved tabs match this filter."
            : "Rename a tab to keep it here, even after closing it."}
        </p>
      )}
      <div
        className="tab-history-tree"
        role="tree"
        aria-label="Saved tabs by type and date"
        onKeyDown={(e) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          ];
          const index = buttons.indexOf(e.target as HTMLButtonElement);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(
                      buttons.length - 1,
                      index + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
          e.preventDefault();
          buttons[next]?.focus();
        }}
      >
        {groups.map((type) => (
          <div
            role="treeitem"
            aria-level={1}
            aria-expanded={!closed.has(type)}
            key={type}
          >
            <button className="tab-history-branch" onClick={() => toggle(type)}>
              <span aria-hidden="true">{closed.has(type) ? "›" : "⌄"}</span>
              <strong>{tabTypes[type]}</strong>
              <small>{rows.filter((t) => t.type === type).length}</small>
            </button>
            {!closed.has(type) && (
              <div role="group">
                {[
                  ...new Set(
                    rows
                      .filter((t) => t.type === type)
                      .map((t) => tabDate(t.createdAt)),
                  ),
                ]
                  .sort()
                  .reverse()
                  .map((date) => {
                    const key = type + date;
                    return (
                      <div
                        role="treeitem"
                        aria-level={2}
                        aria-expanded={!closed.has(key)}
                        key={date}
                      >
                        <button
                          className="tab-history-branch tab-history-date"
                          onClick={() => toggle(key)}
                        >
                          <span aria-hidden="true">
                            {closed.has(key) ? "›" : "⌄"}
                          </span>
                          {date}
                        </button>
                        {!closed.has(key) && (
                          <div role="group">
                            {rows
                              .filter(
                                (t) =>
                                  t.type === type &&
                                  tabDate(t.createdAt) === date,
                              )
                              .sort((a, b) =>
                                a.name.localeCompare(b.name, undefined, {
                                  numeric: true,
                                }),
                              )
                              .map((tab) => (
                                <div
                                  role="treeitem"
                                  aria-level={3}
                                  key={tab.id}
                                >
                                  <button
                                    className="tab-history-leaf"
                                    onClick={() => void activate(tab)}
                                    title={
                                      "Last saved: " +
                                      new Date(tab.updatedAt).toLocaleString()
                                    }
                                  >
                                    <span aria-hidden="true">▣</span>
                                    <span>{tab.name}</span>
                                    <small>
                                      {opened.has(tab.id) ? "Open" : "Closed"}
                                    </small>
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ))}
      </div>
      <footer className="tab-history-footer">
        Automatically keeping{" "}
        {preferences.tabSavePolicy === "all" ? "all tabs" : "named tabs only"}.
      </footer>
    </section>
  );
}
export function TabHistorySettings({ close }: { close: () => void }) {
  useTabHistory();
  return (
    <Modal title="Tab history settings" close={close}>
      <fieldset className="tab-history-settings">
        <legend>Automatically save tabs to workspace history</legend>
        <label>
          <input
            type="radio"
            name="tab-policy"
            checked={preferences.tabSavePolicy !== "all"}
            onChange={() => setTabSavePolicy("named")}
          />
          Named tabs only
        </label>
        <label>
          <input
            type="radio"
            name="tab-policy"
            checked={preferences.tabSavePolicy === "all"}
            onChange={() => setTabSavePolicy("all")}
          />
          All tabs
        </label>
      </fieldset>
      <p className="muted">
        Saved tabs remain available after closing. Previously saved tabs stay in
        history when you change this setting.
      </p>
      <footer>
        <button onClick={close}>Close</button>
      </footer>
    </Modal>
  );
}
export function RenameTabDialog({
  name,
  rename,
  close,
}: {
  name: string;
  rename: (name: string) => void;
  close: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <Modal title="Rename tab" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) {
            rename(value);
            close();
          }
        }}
      >
        <label>
          Tab name
          <input
            autoFocus
            aria-label="Tab name"
            value={value}
            maxLength={120}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={!value.trim()}>
            Rename
          </button>
        </footer>
      </form>
    </Modal>
  );
}

// craigtrim/axiom#94: retention, selection and a searchable two-level tree share one action row.
import { useEffect, useRef, useState } from "react";
import { tabTypes, tabDate, type SavedTab } from "../shared/tab-history";
import { useTabHistory, setTabSavePolicy } from "./tab-history";
import { preferences } from "./client";
import { Modal } from "./Dialogs";
import {
  UtilityFrame,
  UtilityToolbar,
  UtilityTag,
  useUtilityToast,
} from "./UtilityPane";
export function TabHistoryPanel({
  open,
  openIds,
}: {
  open: (tab: SavedTab) => void;
  openIds: () => Set<string>;
}) {
  const history = useTabHistory();
  const [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(""),
    [closed, setClosed] = useState(new Set<string>()),
    [error, setError] = useState("");
  const [pinned, setPinned] = useState(false),
    input = useRef<HTMLInputElement>(null);
  const { toast, notify } = useUtilityToast();
  const all = preferences.tabSavePolicy === "all",
    opened = openIds(),
    selectedTab = history.entries.find((t) => t.id === selected);
  const available =
    selectedTab && (all || selectedTab.named) ? selectedTab : undefined;
  useEffect(() => {
    if (!available) setSelected("");
  }, [available]);
  const toggle = (id: string) =>
    setClosed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const rows = history.entries.filter((t) =>
    (t.name + " " + tabTypes[t.type] + " " + tabDate(t.createdAt))
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const groups = [...new Set(rows.map((t) => t.type))].sort((a, b) =>
    tabTypes[a].localeCompare(tabTypes[b]),
  );
  const activate = async () => {
    if (!available) return;
    setError("");
    try {
      await open(available);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const revealFilter = () => {
    setPinned(true);
    requestAnimationFrame(() => input.current?.focus());
  };
  return (
    <UtilityFrame
      id="tabhistory"
      label="Tab history"
      toast={toast}
      toolbar={
        <UtilityToolbar
          label="Tab history actions"
          primary={
            <span className="seg" role="group" aria-label="Retention">
              <button
                aria-pressed={!all}
                onClick={() => setTabSavePolicy("named")}
              >
                Named tabs only
              </button>
              <button
                aria-pressed={all}
                onClick={() => setTabSavePolicy("all")}
              >
                All tabs
              </button>
            </span>
          }
          state={available?.name || "Nothing selected"}
          actions={[
            {
              id: "filter",
              label: "Filter tab history",
              priority: 1,
              run: revealFilter,
              pinned: pinned || !!filter,
              naturalWidth: 115.5,
              content: (
                <input
                  ref={input}
                  className="fld"
                  size={13}
                  placeholder="Filter names, types and dates"
                  aria-label="Filter tab history"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onBlur={() => {
                    if (!filter) setPinned(false);
                  }}
                />
              ),
            },
            {
              id: "activate",
              label: "Activate",
              priority: 2,
              disabled: !available,
              run: () => void activate(),
            },
          ]}
          items={[
            {
              id: "clear",
              label: "Clear the filter",
              disabled: !filter,
              run: () => {
                setFilter("");
                setPinned(false);
              },
            },
          ]}
        />
      }
      head={
        <>
          {!all && (
            <div className="note2">
              <b>Named tabs only is the default.</b> Default named tabs are
              greyed here rather than removed, because changing the setting
              preserves entries that were already saved. Rename a tab to keep it
              after closing.
            </div>
          )}
          {error && (
            <div className="note2 bad3" role="alert">
              {error}
            </div>
          )}
        </>
      }
      footer={
        <>
          <span>
            <span className="num">{history.entries.length}</span> saved tabs
          </span>
          <span>
            <span className="num">
              {history.entries.filter((t) => !t.named).length}
            </span>{" "}
            with default names
          </span>
          <span>each workspace keeps its own history and numbering</span>
          <span>
            restored graphs keep nodes, positions, layout, visibility and camera
          </span>
        </>
      }
    >
      {!rows.length ? (
        <div className="empty">
          <b>No saved tab matches that filter.</b> The filter searches names,
          types and dates together, so 2026-10 narrows by month and Graph
          narrows by type.
        </div>
      ) : (
        <div
          role="tree"
          aria-label="Saved tabs by type and date"
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
              return;
            const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              ],
              i = buttons.indexOf(e.target as HTMLButtonElement);
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        buttons.length - 1,
                        i + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
            e.preventDefault();
            buttons[next]?.focus();
          }}
        >
          {groups.map((type) => {
            const typed = rows.filter((t) => t.type === type);
            return (
              <div
                role="treeitem"
                aria-level={1}
                aria-expanded={!closed.has(type)}
                key={type}
              >
                <button
                  className="grp"
                  aria-expanded={!closed.has(type)}
                  onClick={() => toggle(type)}
                >
                  {tabTypes[type]}
                  <span className="gn">{typed.length} saved</span>
                </button>
                {!closed.has(type) && (
                  <div role="group">
                    {[...new Set(typed.map((t) => tabDate(t.createdAt)))]
                      .sort()
                      .reverse()
                      .map((date) => {
                        const key = type + date,
                          dated = typed
                            .filter((t) => tabDate(t.createdAt) === date)
                            .sort((a, b) =>
                              a.name.localeCompare(b.name, undefined, {
                                numeric: true,
                              }),
                            );
                        return (
                          <div
                            role="treeitem"
                            aria-level={2}
                            aria-expanded={!closed.has(key)}
                            key={date}
                          >
                            <button
                              className="grp date"
                              aria-expanded={!closed.has(key)}
                              onClick={() => toggle(key)}
                            >
                              {date}
                              <span className="gn">{dated.length}</span>
                            </button>
                            {!closed.has(key) && (
                              <div role="group">
                                {dated.map((tab) => {
                                  const disabled = !all && !tab.named;
                                  return (
                                    <div
                                      role="treeitem"
                                      aria-level={3}
                                      aria-selected={tab.id === selected}
                                      aria-disabled={disabled || undefined}
                                      key={tab.id}
                                    >
                                      <button
                                        className="leaf"
                                        aria-pressed={tab.id === selected}
                                        aria-disabled={disabled || undefined}
                                        onClick={() => {
                                          if (disabled) {
                                            notify(
                                              "That tab is not retained by the current setting.",
                                              "Switch to All tabs, or rename it, to keep it after closing.",
                                            );
                                            return;
                                          }
                                          setSelected(tab.id);
                                        }}
                                        title={
                                          "Last saved: " +
                                          new Date(
                                            tab.updatedAt,
                                          ).toLocaleString()
                                        }
                                      >
                                        <span className="ln">{tab.name}</span>
                                        {disabled && (
                                          <UtilityTag kind="inf">
                                            default name, not retained by this
                                            setting
                                          </UtilityTag>
                                        )}
                                        <span className="ld">
                                          {opened.has(tab.id)
                                            ? "open"
                                            : "closed"}
                                        </span>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </UtilityFrame>
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
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const valid = value.trim().length > 0 && value.trim().length <= 120;
  return (
    <Modal title="Rename tab" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            rename(value);
            close();
          }
        }}
      >
        <label>
          Tab name
          <input
            ref={input}
            autoFocus
            aria-label="Tab name"
            value={value}
            maxLength={120}
            aria-invalid={value.trim().length > 120}
            aria-describedby="tab-name-limit"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <p id="tab-name-limit" role="status">
          {value.trim().length > 120
            ? `This name has ${value.trim().length} characters. Shorten it to 120 or fewer.`
            : "Enter a name of 1 to 120 characters."}
        </p>
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={!valid}>
            Rename
          </button>
        </footer>
      </form>
    </Modal>
  );
}

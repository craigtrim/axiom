import { useState } from "react";
import { Modal } from "./Dialogs";
import { preferences, report } from "./client";
import {
  commandDefinitions,
  commandById,
  accessEntries,
  accessById,
  scopes,
  type ShortcutBinding,
} from "../shared/commands";
import {
  emptyKeyboardSettings,
  effectiveBindings,
  keyboardIssues,
  readKeyboardSettings,
  normalizeShortcut,
  eventStroke,
  accessKey,
  accessPath,
  type KeyboardSettings,
} from "../shared/shortcuts";
export function KeyboardDialog({ close }: { close: () => void }) {
  const [draft, setDraft] = useState<KeyboardSettings>(() =>
      structuredClone(preferences.keyboard ?? emptyKeyboardSettings()),
    ),
    [tab, setTab] = useState<"shortcuts" | "access">("shortcuts"),
    [filter, setFilter] = useState(""),
    [onlyChanged, setOnlyChanged] = useState(false),
    [selected, setSelected] = useState("file.save"),
    [keys, setKeys] = useState(""),
    [scope, setScope] = useState<ShortcutBinding["scope"]>("app"),
    [record, setRecord] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const issues = keyboardIssues(draft),
    entry = commandById.get(selected);
  const changed =
    JSON.stringify(draft) !==
    JSON.stringify(preferences.keyboard ?? emptyKeyboardSettings());
  const setBindings = (id: string, bindings: ShortcutBinding[]) => {
    setDraft((d) => ({ ...d, bindings: { ...d.bindings, [id]: bindings } }));
    setError("");
  };
  const reset = (id: string) =>
    setDraft((d) => {
      const next = structuredClone(d);
      delete next.bindings[id];
      return next;
    });
  const choose = (id: string) => {
    setSelected(id);
    setKeys("");
    setScope("app");
    setError("");
  };
  const add = () => {
    try {
      const normalized = normalizeShortcut(keys);
      setBindings(selected, [
        ...effectiveBindings(selected, draft),
        { keys: normalized, scope },
      ]);
      setKeys("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      const settings = readKeyboardSettings(draft);
      preferences.keyboard = await window.axiom.keyboard.save(settings);
      report("Keyboard shortcuts saved.");
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const list = commandDefinitions.filter(
    (c) =>
      (
        c.group +
        " " +
        c.label +
        " " +
        c.id +
        " " +
        effectiveBindings(c.id, draft)
          .map((b) => b.keys)
          .join(" ")
      )
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (!onlyChanged || c.id in draft.bindings),
  );
  return (
    <Modal title="Customize keyboard shortcuts" close={close}>
      <div className="keyboard-settings">
        <p>
          Use Alt and the underlined menu letters to reach every command. Assign
          shortcuts, add alternate bindings or two-stroke chords, and change
          menu letters. Changes take effect when saved.
        </p>
        <div className="panel-toolbar">
          <button
            aria-pressed={tab === "shortcuts"}
            onClick={() => setTab("shortcuts")}
          >
            Command shortcuts
          </button>
          <button
            aria-pressed={tab === "access"}
            onClick={() => setTab("access")}
          >
            Menu access keys
          </button>
        </div>
        <div className="keyboard-filters">
          <input
            aria-label="Search keyboard commands"
            placeholder="Search command, shortcut or menu"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
            />
            Customized only
          </label>
        </div>
        {tab === "shortcuts" ? (
          <div className="keyboard-columns">
            <div
              className="keyboard-command-list"
              role="listbox"
              aria-label="Keyboard commands"
              onKeyDown={(e) => {
                if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                  e.preventDefault();
                  const index = list.findIndex((c) => c.id === selected),
                    next =
                      list[
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? list.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  list.length - 1,
                                  index + (e.key === "ArrowDown" ? 1 : -1),
                                ),
                              )
                      ];
                  if (next) {
                    choose(next.id);
                    e.currentTarget
                      .querySelector<HTMLElement>(
                        '[data-command="' + next.id + '"]',
                      )
                      ?.focus();
                  }
                }
              }}
            >
              {list.map((c) => (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={selected === c.id}
                  data-command={c.id}
                  tabIndex={
                    selected === c.id ||
                    (!list.some((c) => c.id === selected) &&
                      c.id === list[0]?.id)
                      ? 0
                      : -1
                  }
                  onClick={() => choose(c.id)}
                >
                  <strong>{c.label}</strong>
                  <small>
                    {c.group}
                    {c.id in draft.bindings ? " · Customized" : ""}
                  </small>
                  <span>
                    {effectiveBindings(c.id, draft)
                      .map((b) => b.keys + " [" + b.scope + "]")
                      .join(" / ") || "Unassigned"}
                  </span>
                </button>
              ))}
            </div>
            <div className="keyboard-binding-editor">
              <h3>{entry?.label}</h3>
              <p>
                {entry?.group} · {selected}
              </p>
              <p>
                Menu access: <kbd>{accessPath(selected, draft)}</kbd>
              </p>
              {effectiveBindings(selected, draft).map((b, i) => (
                <div className="binding-row" key={i}>
                  <kbd>{b.keys}</kbd>
                  <span>{b.scope}</span>
                  <button
                    aria-label={"Remove " + b.keys + " from " + entry?.label}
                    onClick={() =>
                      setBindings(
                        selected,
                        effectiveBindings(selected, draft).filter(
                          (_, j) => j !== i,
                        ),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <label>
                Shortcut
                <input
                  data-shortcut-recorder={record ? "true" : undefined}
                  aria-label="Shortcut keys"
                  placeholder="Ctrl+Shift+G or Ctrl+K Ctrl+S"
                  value={keys}
                  onChange={(e) => setKeys(e.target.value)}
                  onKeyDown={(e) => {
                    if (!record) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      setRecord(false);
                      return;
                    }
                    const stroke = eventStroke(e.nativeEvent);
                    if (stroke)
                      setKeys((old) =>
                        old && old.split(" ").length === 1
                          ? old + " " + stroke
                          : stroke,
                      );
                  }}
                />
              </label>
              <div className="binding-row">
                <button
                  aria-pressed={record}
                  onClick={(e) => {
                    setRecord(!record);
                    if (!record) {
                      setKeys("");
                      e.currentTarget.ownerDocument
                        .querySelector<HTMLInputElement>(
                          '[aria-label="Shortcut keys"]',
                        )
                        ?.focus();
                    }
                  }}
                >
                  {record ? "Stop recording" : "Record shortcut"}
                </button>
                <label>
                  Scope
                  <select
                    aria-label="Shortcut scope"
                    value={scope}
                    onChange={(e) =>
                      setScope(e.target.value as ShortcutBinding["scope"])
                    }
                  >
                    {scopes.map((s) => (
                      <option key={s} value={s}>
                        {s === "app" ? "Entire application" : s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {record && (
                <p role="status">
                  Press one shortcut, or two shortcuts for a chord. Escape stops
                  recording. Windows-reserved keys remain controlled by Windows.
                </p>
              )}
              <button
                disabled={
                  !keys.trim() || effectiveBindings(selected, draft).length >= 4
                }
                onClick={add}
              >
                Add binding
              </button>
              <div className="binding-row">
                <button onClick={() => setBindings(selected, [])}>
                  Clear bindings
                </button>
                <button onClick={() => reset(selected)}>Reset command</button>
              </div>
              <details>
                <summary>Scope and keyboard conventions</summary>
                <p>
                  Application shortcuts take precedence over pane shortcuts and
                  editor commands. Unmodified letters act only in a pane and
                  never while entering text. Ctrl+Alt is reserved for AltGr text
                  input. Windows-key combinations, Alt+Tab, F10 and Shift+F10
                  retain their platform behavior. Alt+F4 still closes the window
                  through Windows even if you add another Exit shortcut.
                </p>
                <p>
                  Use a space between chord strokes. Up to four bindings are
                  supported per command. Conflicting bindings or menu letters
                  must be resolved before saving. Text editing, Tab, arrows,
                  Enter and Escape retain their normal control behavior where no
                  application action applies.
                </p>
              </details>
            </div>
          </div>
        ) : (
          <div className="keyboard-access-list">
            <table>
              <thead>
                <tr>
                  <th>Menu or command</th>
                  <th>Letter</th>
                  <th>Access path</th>
                  <th>Reset</th>
                </tr>
              </thead>
              <tbody>
                {accessEntries
                  .filter(
                    (e) =>
                      (
                        e.path
                          .map((id) => accessById.get(id)?.label)
                          .join(" ") +
                        " " +
                        e.label
                      )
                        .toLowerCase()
                        .includes(filter.toLowerCase()) &&
                      (!onlyChanged || e.id in draft.accessKeys),
                  )
                  .map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.path
                          .map((id) => accessById.get(id)?.label)
                          .join(" > ")}
                        {e.path.length ? " > " : ""}
                        {e.label}
                      </td>
                      <td>
                        <input
                          aria-label={"Menu letter for " + e.id}
                          maxLength={1}
                          value={accessKey(e.id, draft)}
                          onChange={(event) => {
                            const key = event.target.value.toUpperCase();
                            if (/^[A-Z0-9]$/.test(key))
                              setDraft((d) => ({
                                ...d,
                                accessKeys: { ...d.accessKeys, [e.id]: key },
                              }));
                          }}
                        />
                      </td>
                      <td>
                        <kbd>{accessPath(e.id, draft)}</kbd>
                      </td>
                      <td>
                        <button
                          aria-label={"Reset menu letter for " + e.id}
                          onClick={() =>
                            setDraft((d) => {
                              const next = structuredClone(d);
                              delete next.accessKeys[e.id];
                              return next;
                            })
                          }
                        >
                          Reset
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {(error || issues.length > 0) && (
          <div role="alert" className="keyboard-errors">
            {error && <p>{error}</p>}
            {issues.slice(0, 8).map((issue, i) => (
              <p key={i}>
                {commandById.get(issue.command ?? "")?.label ??
                  accessById.get(issue.command ?? "")?.label}
                : {issue.message}
                {issue.other && commandById.has(issue.other) && (
                  <button
                    onClick={() => {
                      setTab("shortcuts");
                      choose(issue.other!);
                    }}
                  >
                    Edit conflicting command
                  </button>
                )}
              </p>
            ))}
            {issues.length > 8 && <p>{issues.length - 8} more conflicts.</p>}
          </div>
        )}
        <footer>
          <button
            onClick={async () => {
              try {
                const imported = await window.axiom.keyboard.import();
                if (imported) {
                  setDraft(imported);
                  setError("");
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Import...
          </button>
          <button
            disabled={issues.length > 0}
            onClick={async () => {
              try {
                const file = await window.axiom.keyboard.export(draft);
                if (file) report("Exported keyboard shortcuts: " + file);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Export...
          </button>
          <button
            onClick={() => {
              setDraft(emptyKeyboardSettings());
              setError("");
            }}
          >
            Reset all
          </button>
          <span className="toolbar-spacer" />
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            disabled={saving || issues.length > 0 || !changed}
            onClick={() => void save()}
          >
            Save shortcuts
          </button>
        </footer>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { Modal } from "./Dialogs";
import { commandDefinitions } from "../shared/commands";
import { accessPath, shortcutText } from "../shared/shortcuts";
import { preferences } from "./client";
export function KeyboardHelp({
  close,
  customize,
}: {
  close: () => void;
  customize: () => void;
}) {
  const [filter, setFilter] = useState("");
  return (
    <Modal title="Keyboard shortcuts" close={close}>
      <div className="keyboard-settings">
        <p>
          Press Alt to use the menu bar, or F10 to open the application menu,
          then press its underlined letters. Use Tab and Shift+Tab between
          controls, arrows within lists, Enter or Space to activate, and Escape
          to dismiss. Shift+F10 opens a selected entity's context menu.
        </p>
        <input
          aria-label="Filter shortcut reference"
          placeholder="Find a command or shortcut"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="keyboard-reference">
          <table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Shortcuts</th>
                <th>Menu access</th>
              </tr>
            </thead>
            <tbody>
              {commandDefinitions
                .filter((c) =>
                  (
                    c.group +
                    " " +
                    c.label +
                    " " +
                    shortcutText(c.id, preferences.keyboard)
                  )
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                )
                .map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.group} {" > "} {c.label}
                    </td>
                    <td>
                      {shortcutText(c.id, preferences.keyboard) || "Unassigned"}
                    </td>
                    <td>{accessPath(c.id, preferences.keyboard)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <footer>
          <button onClick={customize}>Customize...</button>
          <button className="primary" onClick={close}>
            Close
          </button>
        </footer>
      </div>
    </Modal>
  );
}

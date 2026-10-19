# Saved tabs

Double-click a tab title to rename it, or right-click it and choose **Rename tab**. Press Enter to finish an inline rename. Names are saved with the workspace.

Open **View > Tab history** to browse saved tabs. The tree groups tabs by type, then their creation date in YYYY-MM-DD format. Select a tab, then press **Activate** to bring it forward or reopen it if closed. The filter searches names, types and dates.

The retention control in the view and **Edit > Settings > Tab history** share one setting:

- **Named tabs only** is the default. Rename a tab to keep it after closing.
- **All tabs** also retains tabs with default names, such as Graph, Graph_2 and Graph_3.

This setting applies across Axiom. Each workspace keeps its own history. Changing the setting preserves entries already saved. Under Named tabs only, default-named entries appear greyed. Pressing one explains how to retain it. The normal session layout continues to retain open panes under either setting.

A new tab uses its view's plain name when that name is available. With Graph open, the next graph is Graph_2. Closing Graph_2 frees that name for another tab. A gap is reused before a higher number, and a lone Graph_6 does not reserve Graph. All open tabs count, including renamed tabs, border tabs and detached windows. Closed history entries do not reserve a name.

Loading a saved layout assigns fresh default names in layout order, so a lone Details_6 becomes Details. Activating a closed default-named tab also chooses an available name. User-given names and entity-based Touchpoints names remain unchanged. Under All tabs, several closed entries can share a default name; each retains its own creation date and saved state.

Saved tabs participate in workspace autosave and saving on close. Restored graphs retain their nodes, positions, layout settings, visibility options and camera. Find tabs retain their query and filters. Closing a graph frees a slot for another open graph while its saved copy remains in history.

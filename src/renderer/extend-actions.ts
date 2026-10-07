import { useSyncExternalStore } from "react";
import type { Kind } from "../domain/model";
import {
  defaultExtendPreferences,
  extendGroup,
  extendPreferencesKey,
  readExtendPreferences,
  type ExtendAction,
} from "../shared/entity-extend";
import { command, onCommand, panel, savePanel } from "./client";

export const useExtendActions = () =>
  useSyncExternalStore(
    (notify) =>
      onCommand((id) => {
        if (id === extendPreferencesKey) notify();
      }),
    () => panel(extendPreferencesKey, defaultExtendPreferences),
  );
export function rememberExtendAction(kind: Kind, action: ExtendAction) {
  const current = panel(extendPreferencesKey, defaultExtendPreferences);
  const group = extendGroup(kind);
  if (current[group] === action) return;
  savePanel(
    extendPreferencesKey,
    readExtendPreferences({ ...current, [group]: action }),
    false,
  );
  command(extendPreferencesKey);
}

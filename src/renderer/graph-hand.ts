// craigtrim/axiom#189: one Hand setting per window, shared by every graph view and never saved.
import { useSyncExternalStore } from "react";
let hand = false;
const listeners = new Set<() => void>();
export const onHandTool = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function setHandTool(on: boolean) {
  if (hand === on) return;
  hand = on;
  for (const listener of listeners) listener();
}
export const useHandTool = () => useSyncExternalStore(onHandTool, () => hand);

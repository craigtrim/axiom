import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RetainedPreview } from "./retained-preview";

export function useRetainedPreview<T>(
  key: string | null,
  scope: string,
  load: () => Promise<T>,
  delay = 120,
) {
  const [controller] = useState(() => new RetainedPreview<T>());
  const latest = useRef({ key, scope });
  latest.current = { key, scope };
  const result = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.update(key, scope, load, delay);
  }, [controller, key, scope, delay]);
  useEffect(() => () => controller.cancel(), [controller]);
  const currentScope = result.scope === scope;
  return {
    value: currentScope ? result.value : undefined,
    error: currentScope ? result.error : "",
    fresh:
      currentScope &&
      key !== null &&
      result.settledKey === key &&
      !result.error,
    validate: async () => {
      controller.update(key, scope, load, delay);
      const value = await controller.validate();
      return latest.current.key === key && latest.current.scope === scope
        ? value
        : undefined;
    },
  };
}

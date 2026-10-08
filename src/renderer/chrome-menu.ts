import type { ChromeMenuItem } from "../shared/window-chrome";
import type { ContextAction } from "./ContextMenu";
import { report } from "./client";

export function chromeActions(
  items: ChromeMenuItem[],
): (ContextAction | null)[] {
  return items
    .filter((item) => item.visible)
    .map((item) =>
      item.separator
        ? null
        : {
            key: item.key,
            label: item.label,
            accessKey: item.key,
            accelerator: item.accelerator,
            enabled: item.enabled,
            checked: item.checked,
            radio: item.radio,
            children: item.children ? chromeActions(item.children) : undefined,
            run: () =>
              window.axiom.chrome
                .execute(item.id, item.label)
                .catch((error) => report(error.message, true)),
          },
    );
}

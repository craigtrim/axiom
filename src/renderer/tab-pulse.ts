import type { TabNode } from "flexlayout-react";

const cleanup = new WeakMap<HTMLElement, () => void>();

// craigtrim/axiom#114: rail feedback belongs to the owning DOM, never the saved layout.
export function pulseTab(node: TabNode) {
  window.requestAnimationFrame(() => {
    const owner = node.getWindow();
    if (!owner || owner.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const button = owner.document.getElementById(
      "flexlayout-tabbutton-" + node.getId().replace(/\s/g, "_"),
    );
    if (!button) return;
    cleanup.get(button)?.();
    button.classList.remove("rail-tab-pulse");
    void button.offsetWidth;
    const clear = () => {
      button.removeEventListener("animationend", finish);
      button.classList.remove("rail-tab-pulse");
      cleanup.delete(button);
    };
    const finish = (event: AnimationEvent) => {
      if (event.target === button && event.animationName === "rail-tab-pulse")
        clear();
    };
    cleanup.set(button, clear);
    button.addEventListener("animationend", finish);
    button.classList.add("rail-tab-pulse");
  });
}

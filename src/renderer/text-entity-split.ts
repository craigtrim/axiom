import {
  Actions,
  Model,
  Orientation,
  RowNode,
  TabSetNode,
} from "flexlayout-react";

/** Adapt the existing docking splitter only when the two text panes are adjacent. */
export function textEntitySplit(model: Model) {
  const upper = model.getNodeById("textanalysis")?.getParent();
  const lower = model.getNodeById("textentities")?.getParent();
  const row = upper?.getParent();
  if (
    !(upper instanceof TabSetNode) ||
    !(lower instanceof TabSetNode) ||
    !(row instanceof RowNode) ||
    lower.getParent() !== row ||
    row.getOrientation() !== Orientation.VERT
  )
    return;
  const children = row.getChildren(),
    index = children.indexOf(lower);
  if (index < 1 || children[index - 1] !== upper) return;
  return { row, upper, lower, index, path: row.getPath() + "/s" + (index - 1) };
}
export function textEntityWeights(
  model: Model,
  percent: number,
  weights?: number[],
) {
  const split = textEntitySplit(model);
  if (!split) return;
  const next = weights
    ? [...weights]
    : split.row
        .getChildren()
        .map((n) => (n as RowNode | TabSetNode).getWeight());
  const total = next[split.index - 1] + next[split.index];
  const fraction = Math.max(22, Math.min(78, percent)) / 100;
  next[split.index - 1] = total * (1 - fraction);
  next[split.index] = total * fraction;
  return next;
}
export function setTextEntitySplit(model: Model, percent: number) {
  const split = textEntitySplit(model),
    weights = textEntityWeights(model, percent);
  if (split && weights)
    model.doAction(Actions.adjustWeights(split.row.getId(), weights));
}
export function installTextEntitySplitter(model: Model, doc: Document) {
  let frame = 0;
  let decorated: HTMLElement | undefined;
  let decoratedPath: string | undefined;
  let original: Record<string, string | null> = {};
  let applied: Record<string, string> = {};
  const restore = () => {
    if (decorated)
      for (const [key, value] of Object.entries(original)) {
        if (decorated.getAttribute(key) !== applied[key]) continue;
        if (value === null) decorated.removeAttribute(key);
        else decorated.setAttribute(key, value);
      }
    decorated = undefined;
    decoratedPath = undefined;
  };
  const win = doc.defaultView!;
  const update = () => {
    frame = 0;
    const split = textEntitySplit(model);
    const element = split
      ? [...doc.querySelectorAll<HTMLElement>(".flexlayout__splitter")].find(
          (e) => e.dataset.layoutPath === split.path,
        )
      : undefined;
    if (element !== decorated || split?.path !== decoratedPath) restore();
    if (!element || !split) return;
    const percent =
      (split.lower.getWeight() /
        (split.upper.getWeight() + split.lower.getWeight())) *
      100;
    const attributes = {
      "aria-label": "Resize the text and entity panes. Arrow keys resize.",
      "aria-valuemin": "22",
      "aria-valuemax": "78",
      "aria-valuenow": String(Math.round(percent)),
      "aria-valuetext": Math.round(percent) + "%",
    };
    if (!decorated) {
      decorated = element;
      decoratedPath = split.path;
      original = Object.fromEntries(
        Object.keys(attributes).map((key) => [key, element.getAttribute(key)]),
      );
    }
    applied = attributes;
    for (const [key, value] of Object.entries(attributes))
      if (element.getAttribute(key) !== value) element.setAttribute(key, value);
  };
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  const keydown = (event: KeyboardEvent) => {
    const element = event.target as HTMLElement,
      split = textEntitySplit(model);
    if (
      !split ||
      element.dataset.layoutPath !== split.path ||
      !["ArrowUp", "ArrowDown", "Enter"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const percent =
      (split.lower.getWeight() /
        (split.upper.getWeight() + split.lower.getWeight())) *
      100;
    setTextEntitySplit(
      model,
      event.key === "Enter" ? 52 : percent + (event.key === "ArrowUp" ? 3 : -3),
    );
    schedule();
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-valuenow"],
  });
  doc.addEventListener("keydown", keydown, true);
  schedule();
  return () => {
    observer.disconnect();
    win.cancelAnimationFrame(frame);
    doc.removeEventListener("keydown", keydown, true);
    restore();
  };
}

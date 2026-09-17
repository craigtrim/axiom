import { readKeyboardSettings } from "./shortcuts";
import { parseGraphStyle } from "../domain/graph-style";
import type { Preferences } from "./protocol";
import { defaultFilter, branches } from "../domain/model";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function readPreferences(input: unknown): Preferences {
  if (
    !object(input) ||
    input.version !== 1 ||
    JSON.stringify(input).length > 2000000
  )
    throw Error("Invalid workbench settings.");
  const p: Preferences = {
    version: 1,
    theme: ["system", "light", "dark"].includes(String(input.theme))
      ? (input.theme as Preferences["theme"])
      : "light",
    panelState: {},
  };
  if (
    ["auto", "standard", "wide", "custom"].includes(String(input.arrangement))
  )
    p.arrangement = input.arrangement as Preferences["arrangement"];
  if (object(input.layout) && JSON.stringify(input.layout).length < 100000)
    p.layout = input.layout;
  if (typeof input.maximized === "boolean") p.maximized = input.maximized;
  if (input.keyboard !== undefined)
    p.keyboard = readKeyboardSettings(input.keyboard);
  const b = input.bounds;
  if (
    object(b) &&
    number(b.x, -100000, 100000) &&
    number(b.y, -100000, 100000) &&
    number(b.width, 600, 20000) &&
    number(b.height, 400, 20000)
  )
    p.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
  const s = object(input.panelState) ? input.panelState : {},
    out = p.panelState!;
  for (const [key, value] of Object.entries(s)) {
    if (
      key.startsWith("pane.zoom.") &&
      key.length > 10 &&
      key.length <= 200 &&
      key !== "pane.zoom.graph" &&
      number(value, 0.5, 3)
    )
      out[key] = value;
  }
  if (typeof s["graph.stylesheet"] === "string") {
    parseGraphStyle(s["graph.stylesheet"]);
    out["graph.stylesheet"] = s["graph.stylesheet"];
  }
  if (["codex", "claude"].includes(String(s["assistant.provider"])))
    out["assistant.provider"] = s["assistant.provider"];
  if (typeof s["details.source.open"] === "boolean")
    out["details.source.open"] = s["details.source.open"];
  const prompts = s["research.templates"];
  if (
    object(prompts) &&
    Object.keys(prompts).length <= 10 &&
    Object.values(prompts).every(
      (v) => typeof v === "string" && v.length <= 20000,
    )
  )
    out["research.templates"] = prompts;
  if (["codex", "claude"].includes(String(s["research.provider"])))
    out["research.provider"] = s["research.provider"];
  if (typeof s["research.web"] === "boolean")
    out["research.web"] = s["research.web"];
  for (const [key, camera] of Object.entries(s))
    if (
      /^graph\.camera\.graph:[a-zA-Z0-9-]+$/.test(key) &&
      object(camera) &&
      number(camera.x, -1e8, 1e8) &&
      number(camera.y, -1e8, 1e8) &&
      number(camera.zoom, 0.01, 100)
    )
      out[key] = { x: camera.x, y: camera.y, zoom: camera.zoom };
  const c = s["graph.camera"];
  if (
    object(c) &&
    number(c.x, -1e8, 1e8) &&
    number(c.y, -1e8, 1e8) &&
    number(c.zoom, 0.05, 5)
  )
    out["graph.camera"] = { x: c.x, y: c.y, zoom: c.zoom };
  if (number(s["graph.limit"], 100, 3000))
    out["graph.limit"] = Math.round(s["graph.limit"]);
  if (["classes", "properties"].includes(String(s["hierarchy.tab"])))
    out["hierarchy.tab"] = s["hierarchy.tab"];
  const opened = s["hierarchy.open"];
  if (
    Array.isArray(opened) &&
    opened.length <= 10000 &&
    opened.every((v) => typeof v === "string" && v.length < 10000)
  )
    out["hierarchy.open"] = opened;
  const filter = s["table.filter"];
  if (object(filter))
    out["table.filter"] = {
      ...defaultFilter,
      type: typeof filter.type === "string" ? filter.type.slice(0, 10000) : "",
      branch: branches.includes(String(filter.branch)) ? filter.branch : "",
      query:
        typeof filter.query === "string" ? filter.query.slice(0, 10000) : "",
      sort: [
        "iri",
        "type",
        "ref",
        "branch",
        "price",
        "rating",
        "ts",
        "cust",
      ].includes(String(filter.sort))
        ? filter.sort
        : "iri",
      direction: filter.direction === -1 ? -1 : 1,
    };
  if (typeof s["table.accessible"] === "boolean")
    out["table.accessible"] = s["table.accessible"];
  if (number(s["table.scroll"], 0, 1000000))
    out["table.scroll"] = Math.floor(s["table.scroll"]);
  if (typeof s["query.text"] === "string" && s["query.text"].length <= 100000)
    out["query.text"] = s["query.text"];
  if (number(s["query.example"], 0, 6))
    out["query.example"] = Math.floor(s["query.example"]);
  if (number(s["query.height"], 100, 2000))
    out["query.height"] = s["query.height"];
  const v = s["query.view"];
  if (
    object(v) &&
    object(v.viewState) &&
    Array.isArray(v.cursorState) &&
    object(v.contributionsState)
  )
    out["query.view"] = v;
  return p;
}

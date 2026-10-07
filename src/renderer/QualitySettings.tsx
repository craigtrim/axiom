import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { humanise, type Kind } from "../domain/model";
import {
  qualityEnabledChecks,
  qualityGroupLabel,
  qualityGroups,
  qualityKinds,
  qualityRules,
  qualityVocabularies,
  qualityWithdrawn,
  type QualityCensusResult,
  type QualityOptions,
} from "../shared/ontology-quality";
import type { Snapshot } from "../shared/protocol";
import { panel, savePanel } from "./client";
import { t } from "./quality-copy";
import "./quality-settings.css";

const names: Record<Kind, string> = {
  Class: "Classes",
  Intersection: "Intersection classes",
  Defined: "Defined classes",
  Individual: "Individuals",
  ObjectProperty: "Object properties",
  DataProperty: "Data properties",
  AnnotationProperty: "Annotation properties",
  Resource: "Other resources",
  Datatype: "Datatypes",
};
const toggle = <T,>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
const scrollPositions = new Map<string, number>();
function Rail({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const restore = useRef(
    scrollPositions.get(name) ??
      panel<Record<string, number>>("quality.rails", {})[name] ??
      0,
  );
  const interacted = useRef(false);
  useLayoutEffect(() => {
    const rail = ref.current!;
    const apply = () => {
      if (interacted.current) return;
      rail.scrollLeft = restore.current;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div
      className="rail"
      ref={ref}
      onScroll={(e) => {
        if (
          !interacted.current ||
          !e.currentTarget.isConnected ||
          !e.currentTarget.clientWidth ||
          e.currentTarget.scrollWidth <= e.currentTarget.clientWidth
        )
          return;
        scrollPositions.set(name, e.currentTarget.scrollLeft);
        savePanel(
          "quality.rails",
          { ...panel("quality.rails", {}), [name]: e.currentTarget.scrollLeft },
          false,
        );
      }}
      onWheel={() => {
        interacted.current = true;
      }}
      onPointerDown={() => {
        interacted.current = true;
      }}
      onFocus={(e) => {
        interacted.current = true;
        const rail = e.currentTarget,
          item = (e.target as HTMLElement).getBoundingClientRect(),
          box = rail.getBoundingClientRect();
        const scale = box.width / rail.offsetWidth;
        if (item.left < box.left + 8 * scale)
          rail.scrollLeft -= (box.left + 8 * scale - item.left) / scale;
        else if (item.right > box.right - 8 * scale)
          rail.scrollLeft += (item.right - box.right + 8 * scale) / scale;
      }}
    >
      {children}
    </div>
  );
}
export function QualitySettings({
  options,
  census,
  snapshot,
  busy,
  problem,
  change,
  run,
  rules,
  announce,
}: {
  options: QualityOptions;
  census?: QualityCensusResult;
  snapshot: Snapshot;
  busy: boolean;
  problem?: string;
  change: (value: Partial<QualityOptions>) => void;
  run: () => void;
  rules: () => void;
  announce: (text: string) => void;
}) {
  const [withdrawalsOpen, setWithdrawalsOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const known = census?.census ?? {},
    withdrawn = census ? qualityWithdrawn(known) : [];
  const groups = qualityGroups
    .filter((g) =>
      qualityRules.some((r) => r.group === g && !withdrawn.includes(r.id)),
    )
    .sort((a, b) =>
      a === "Publication metadata" ? 1 : b === "Publication metadata" ? -1 : 0,
    );
  const kinds = qualityKinds.filter(
    (k) => k !== "Resource" || (census?.kinds[k] ?? 0) > 0,
  );
  const chip = (
    name: string,
    count: number | undefined,
    selected: boolean,
    act: () => void,
  ) => {
    const empty = count === 0;
    const unavailable = busy || empty;
    return (
      <button
        type="button"
        className="chipc"
        key={name}
        aria-disabled={unavailable || undefined}
        aria-pressed={empty ? undefined : selected}
        aria-label={
          empty
            ? t("settings.empty", { name })
            : name +
              (count === undefined ? "" : ", " + count.toLocaleString("en-US"))
        }
        onClick={() => {
          if (unavailable) {
            announce(
              empty ? t("settings.empty", { name }) : t("running.state"),
            );
            return;
          }
          act();
          announce(name + (selected ? ", not selected" : ", selected"));
        }}
      >
        {selected && !empty && <span className="mk">✓</span>}
        <span>{name}</span>
        {count !== undefined && (
          <span className="n">{count.toLocaleString("en-US")}</span>
        )}
        {empty && <span className="mk">n/a</span>}
      </button>
    );
  };
  return (
    <div
      className="quality-settings"
      role="group"
      aria-label={t("settings.name")}
      onKeyDown={(e) => {
        if (e.key === "Escape" && withdrawalsOpen) {
          e.preventDefault();
          e.stopPropagation();
          setWithdrawalsOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }
      }}
    >
      <div className="settings">
        <div className="srow" role="group" aria-label={t("scope.label")}>
          <span className="k">{t("scope.label")}</span>
          <Rail name="scope">
            <select
              className="sel"
              tabIndex={0}
              aria-label={t("scope.label")}
              value={options.scope}
              disabled={busy}
              onChange={(e) =>
                change({ scope: e.target.value as QualityOptions["scope"] })
              }
            >
              <option value="ontology">{t("scope.ontology")}</option>
              <option value="namespace">
                {options.namespace
                  ? t("scope.namespaceValue", { value: options.namespace })
                  : t("scope.namespace")}
              </option>
              <option value="branch">
                {options.root
                  ? t("settings.branch", {
                      name:
                        snapshot.entities.find((e) => e.iri === options.root)
                          ?.label ??
                        humanise(options.root.split(/[#/]/).at(-1)!),
                    })
                  : t("scope.branch")}
              </option>
            </select>
            {options.scope === "namespace" && (
              <input
                className="sel"
                aria-label={t("scope.namespace")}
                value={options.namespace}
                placeholder={snapshot.ontology.namespace}
                disabled={busy}
                onChange={(e) => change({ namespace: e.target.value })}
              />
            )}
            {options.scope === "branch" && (
              <select
                className="sel"
                aria-label={t("scope.root")}
                value={options.root}
                disabled={busy}
                onChange={(e) => change({ root: e.target.value })}
              >
                <option value="">{t("scope.chooseRoot")}</option>
                {snapshot.entities
                  .filter(
                    (e) =>
                      ["Class", "Defined"].includes(e.kind) &&
                      !e.iri.startsWith("_:"),
                  )
                  .map((e) => (
                    <option key={e.iri} value={e.iri} title={e.iri}>
                      {e.label ?? humanise(e.name)}
                    </option>
                  ))}
              </select>
            )}
          </Rail>
        </div>
        <div className="srow" role="group" aria-label={t("kinds.label")}>
          <span className="k">{t("kinds.label")}</span>
          <Rail name="kinds">
            {kinds.map((k) =>
              chip(
                names[k],
                census?.kinds[k] ?? 0,
                options.kinds.includes(k),
                () => change({ kinds: toggle(options.kinds, k) }),
              ),
            )}
          </Rail>
        </div>
        <div className="srow" role="group" aria-label={t("checks.label")}>
          <span className="k">{t("checks.label")}</span>
          <Rail name="checks">
            {groups.map((g) => {
              const admitted = qualityRules.filter(
                (r) => r.group === g && !withdrawn.includes(r.id),
              );
              const selected =
                options.groups.includes(g) &&
                admitted.some((r) => options.rules[r.id] !== "Off");
              return chip(qualityGroupLabel(g), undefined, selected, () =>
                change(
                  selected
                    ? { groups: options.groups.filter((v) => v !== g) }
                    : {
                        groups: [...new Set([...options.groups, g])],
                        ...(admitted.every((r) => options.rules[r.id] === "Off")
                          ? {
                              rules: {
                                ...options.rules,
                                ...Object.fromEntries(
                                  admitted.map((r) => [r.id, r.severity]),
                                ),
                              },
                            }
                          : {}),
                      },
                ),
              );
            })}
            <button
              type="button"
              className="btn tiny"
              disabled={busy}
              onClick={rules}
            >
              {t("rules.open")}
            </button>
            <span className="hint">
              {t("settings.checks", {
                n: qualityEnabledChecks(options, known).length,
              })}
            </span>
          </Rail>
        </div>
        <div className="srow" role="group" aria-label={t("vocab.label")}>
          <span className="k">{t("vocab.label")}</span>
          <Rail name="vocabulary">
            {qualityVocabularies
              .filter((v) => known[v])
              .map((v) => (
                <span key={v} className="tagf">
                  {v}
                </span>
              ))}
            {withdrawn.length ? (
              <button
                type="button"
                ref={trigger}
                className="btn tiny"
                disabled={busy}
                aria-expanded={withdrawalsOpen}
                onClick={() => {
                  setWithdrawalsOpen(!withdrawalsOpen);
                  announce(t("settings.withdrawnTitle"));
                }}
              >
                {t("settings.withdrawn", { n: withdrawn.length })}
              </button>
            ) : (
              <span className="hint">{t("settings.noneWithdrawn")}</span>
            )}
          </Rail>
        </div>
      </div>
      <div className="actline">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !!problem}
          onClick={run}
        >
          {t("run")}
        </button>
      </div>
      {problem && (
        <p role="status" className="settings-problem">
          {problem}
        </p>
      )}
      {withdrawalsOpen && (
        <div
          className="pop"
          role="region"
          aria-label={t("settings.withdrawnTitle")}
        >
          <h4>{t("settings.withdrawnTitle")}</h4>
          <ul>
            {withdrawn.map((id) => {
              const rule = qualityRules.find((r) => r.id === id)!;
              return (
                <li key={id}>
                  {t("settings.withdrawnRow", {
                    check: rule.title,
                    vocabulary: rule.requires!,
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

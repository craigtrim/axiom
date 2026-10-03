// Ontology Quality pane, rebuilt to Craig's visual reference: craigtrim/axiom#44.
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import "./quality.css";
import { NS, kindLabel, humanise, shorten, type Kind } from "../domain/model";
import { identifierParts } from "../domain/rdf-model";
import {
  defaultQualityOptions,
  qualityAdmitted,
  qualityDefaultSeverity,
  qualityEnabledChecks,
  qualityGroupLabel,
  qualityGroups,
  qualityKinds,
  qualityRules,
  qualitySuppression,
  qualityVocabularies,
  qualityWithdrawn,
  readQualityExceptions,
  readQualityOptions,
  type QualityCensusResult,
  type QualityException,
  type QualityFinding,
  type QualityGroup,
  type QualityOptions,
  type QualityPreview,
  type QualityReport,
  type QualitySeverity,
} from "../shared/ontology-quality";
import {
  panel,
  report as notify,
  request,
  savePanel,
  useSnapshot,
} from "./client";
import { editEntity } from "./authoring";
import {
  cancelQuality,
  publishQualityStale,
  startQuality,
  takeQualitySettingsRequest,
  useQualityStale,
  useQualitySettingsRequests,
  useQualityStatus,
} from "./quality-view";
import { registerPaneRecovery, usePaneLayout } from "./AdaptivePane";
import { qly, ruleCopy, t, tn, type QlyKey } from "./quality-copy";
import {
  Chevron,
  Download,
  Failed,
  OpenDetails,
  Play,
  Rerun,
  SeverityGlyph,
  Suppress,
  Triangle,
  Unsuppress,
  severityClass,
} from "./quality-glyphs";
import { turtleEvidence, turtleLines, turtleTerm } from "./quality-turtle";
import { FindGlyph } from "./FindGlyph";

const PAGE = 40;
const severities: QualitySeverity[] = ["Violation", "Warning", "Information"];
const ruleOf = (id: string) => qualityRules.find((r) => r.id === id)!;
const kindPlural: Partial<Record<Kind, string>> = {
  Class: "Classes",
  Defined: "Defined classes",
  Individual: "Individuals",
  ObjectProperty: "Object properties",
  DataProperty: "Data properties",
  AnnotationProperty: "Annotation properties",
  Resource: "Other resources",
  Datatype: "Datatypes",
};
const coreKinds: Kind[] = [
  "Class",
  "Individual",
  "ObjectProperty",
  "DataProperty",
];
const kindName = (kind: string) =>
  kind === "Ontology" ? "Ontology" : kindLabel(kind as Kind);
const aliasPredicates = [
  NS.skos + "altLabel",
  NS.skos + "hiddenLabel",
  NS.rdfs + "seeAlso",
];
const toggle = <T,>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
/** Catalogue strings whose placeholders carry markup, such as a bold name. */
function rich(key: QlyKey, values: Record<string, ReactNode>) {
  return qly[key]
    .split(/(\{\w+\})/)
    .map((part, i) =>
      /^\{\w+\}$/.test(part) ? (
        <Fragment key={i}>{values[part.slice(1, -1)]}</Fragment>
      ) : (
        part
      ),
    );
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
function scopeText(
  options: QualityOptions,
  label: (iri: string) => string,
): string {
  return options.scope === "namespace"
    ? t("scope.namespaceValue", { value: options.namespace })
    : options.scope === "branch"
      ? t("scope.branchValue", { value: label(options.root) })
      : t("scope.ontology");
}
/** Error messages from the worker carry the rejected condition. */
function rejection(message: string) {
  const m = /quality-reject:(\w+):([^:]*):/.exec(message);
  return m ? { code: m[1], entity: decodeURIComponent(m[2]) } : undefined;
}

// Closing a tab or moving it between pane hosts must retain its presentation.
// Ontology settings still live in workspace preferences; this session state
// holds only the view and unfinished review while the renderer is alive.
const retainedView = new Map<string, unknown>();
const retainedScroll = new Map<string, number>();
function useRetainedState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() =>
    retainedView.has(key)
      ? (retainedView.get(key) as T)
      : typeof initial === "function"
        ? (initial as () => T)()
        : initial,
  );
  useEffect(() => {
    retainedView.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

// Recovery keeps the pane's name and its last result (craigtrim/axiom#44).
function QualityRecovery({ maximize }: { maximize: ReactNode }) {
  const job = useQualityStatus(),
    stale = useQualityStale();
  const report = job?.state === "complete" ? job.report : undefined;
  // One line, and never one that reads as clean when it is not.
  const last = !job
    ? t("idle.summary")
    : job.state === "running"
      ? t("running.progress", { scanned: job.scanned, total: job.total })
      : job.state === "canceled"
        ? t("canceled.state")
        : job.state === "failed" || !report
          ? t("failed.state")
          : stale
            ? t("stale.state")
            : !report.enabledChecks
              ? t("nochecks.headline")
              : report.findings.length
                ? t("foot.totals", {
                    total: report.findings.length,
                    suppressed: 0,
                  }).split(" · ")[0]
                : t("clean.headline");
  return (
    <>
      <span className="id">{t("recovery.name")}</span>
      <p>{last}</p>
      <p>{t("recovery.widen")}</p>
      {maximize}
    </>
  );
}
registerPaneRecovery("quality", { height: 120, Body: QualityRecovery });

/** A native popover placed under its trigger; the pane's CSS zoom is respected. */
function Menu({
  id,
  label,
  anchor,
  children,
}: {
  id: string;
  label: string;
  anchor: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const place = () => {
    const menu = ref.current,
      trigger = anchor.current;
    if (!menu || !trigger) return;
    const win = trigger.ownerDocument.defaultView!;
    const scale = Number(
      trigger.closest<HTMLElement>(".adaptive-pane")?.dataset.paneZoom ?? 1,
    );
    const box = trigger.getBoundingClientRect();
    const w = Math.min(280, win.innerWidth / scale - 16);
    Object.assign(menu.style, {
      width: w + "px",
      left:
        Math.max(
          8,
          Math.min(box.right / scale - w, win.innerWidth / scale - w - 8),
        ) + "px",
      top: box.bottom / scale + 4 + "px",
      maxHeight:
        Math.max(120, win.innerHeight / scale - box.bottom / scale - 16) + "px",
      overflow: "auto",
    });
  };
  return (
    <div
      ref={ref}
      id={id}
      popover="auto"
      className="quality-menu"
      role="dialog"
      aria-label={label}
      onToggle={(event) => {
        if (event.newState === "open") {
          place();
          ref.current
            ?.querySelector<HTMLElement>("select, button:not(:disabled)")
            ?.focus();
        }
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button"))
          ref.current?.hidePopover();
      }}
      // Escape closes the menu only; the pane must not also collapse its settings.
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

interface Band {
  key: string;
  title: string;
  id?: string;
  severity?: QualitySeverity;
  count: number;
  items: QualityFinding[];
}
interface Repair {
  iri: string;
  label: string;
  predicate: string;
  language: string;
  selected: boolean;
  blocked?: "conflicting" | "blank";
}
type Mode =
  "results" | "rules" | "exceptions" | "review" | "preview" | "rejected";

export function QualityPanel() {
  const snapshot = useSnapshot()!,
    job = useQualityStatus(),
    settingsRequests = useQualitySettingsRequests();
  const [options, setOptions] = useState(() =>
    readQualityOptions(panel("quality.options", defaultQualityOptions())),
  );
  const [exceptions, setExceptions] = useState(() =>
    readQualityExceptions(panel("quality.exceptions", [])),
  );
  const [settingsOpen, setSettingsOpen] = useRetainedState(
    "settingsOpen",
    !job?.report,
  );
  const [census, setCensus] = useState<QualityCensusResult>();
  const [view, setView] = useRetainedState<"findings" | "coverage">(
    "view",
    "findings",
  );
  const [sevOn, setSevOn] = useRetainedState<QualitySeverity[]>(
    "sevOn",
    severities,
  );
  const [showSuppressed, setShowSuppressed] = useRetainedState(
    "showSuppressed",
    false,
  );
  const [grouping, setGrouping] = useRetainedState<"rule" | "entity">(
    "grouping",
    "rule",
  );
  const [text, setText] = useRetainedState("text", "");
  const [more, setMore] = useRetainedState("more", {
    group: "",
    rule: "",
    kind: "",
    namespace: "",
  });
  const [expanded, setExpanded] = useRetainedState<string[]>("expanded", []);
  const [open, setOpen] = useRetainedState("open", "");
  const [recording, setRecording] = useRetainedState("recording", "");
  const [reason, setReason] = useRetainedState("reason", "");
  const [page, setPage] = useRetainedState("page", 0);
  const [mode, setMode] = useRetainedState<Mode>("mode", "results");
  const [repairs, setRepairs] = useRetainedState<Repair[]>("repairs", []);
  const [preview, setPreview] = useRetainedState<QualityPreview | undefined>(
    "preview",
    undefined,
  );
  const [rejected, setRejected] = useRetainedState<
    { code: string; entity: string } | undefined
  >("rejected", undefined);
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");
  const [starting, setStarting] = useState(false);
  const root = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null),
    exportButton = useRef<HTMLButtonElement>(null);
  const moreId = useId(),
    exportId = useId(),
    exportNote = useId();

  const report = job?.state === "complete" ? job.report : undefined;
  const partial = job?.state === "canceled" ? job.partial : undefined;
  const shown: QualityReport | undefined = report ?? partial;
  const busy = starting || job?.state === "running";
  // A canceled report's partial findings go stale the same way a complete report's do.
  const staleStore =
    !!shown &&
    (shown.datasetEpoch !== snapshot.datasetEpoch ||
      shown.version !== snapshot.version);
  const staleSettings =
    !!shown &&
    !staleStore &&
    JSON.stringify(shown.options) !==
      JSON.stringify(readQualityOptions(options));
  const stale = staleStore || staleSettings;
  // Only a complete report has a coverage view; partial findings always list.
  // Narrow and shallow keeps the findings list and drops the view switch, so
  // it shows findings whatever view was chosen at a larger size.
  const { narrow, shallow, width, height } = usePaneLayout();
  const resultView = report && !(narrow && shallow) ? view : "findings";
  const scrollKey = `${job?.id ?? 0}:${mode}:${resultView}`;
  const pendingScroll = useRef<{ key: string; top: number; pending: boolean }>({
    key: scrollKey,
    top: retainedScroll.get(scrollKey) ?? 0,
    pending: true,
  });
  useLayoutEffect(() => {
    if (pendingScroll.current.key !== scrollKey)
      pendingScroll.current = {
        key: scrollKey,
        top: retainedScroll.get(scrollKey) ?? 0,
        pending: true,
      };
    const body = bodyRef.current;
    // A remounted tab first has unconstrained content height. Wait for its
    // actual docking rectangle; restoring earlier would clamp the scroll to 0.
    const host = root.current?.closest<HTMLElement>(".adaptive-pane");
    const box = host?.getBoundingClientRect();
    const zoom = Number(host?.dataset.paneZoom ?? 1);
    if (
      !box ||
      Math.round(box.width / zoom) !== width ||
      Math.round(box.height / zoom) !== height
    )
      return;
    if (!body || !body.clientHeight || !pendingScroll.current.pending) return;
    body.scrollTop = pendingScroll.current.top;
    pendingScroll.current.pending = false;
  }, [scrollKey, width, height]);
  useEffect(() => publishQualityStale(stale), [stale]);
  const labels = useMemo(
    () =>
      new Map(
        snapshot.entities.map((e) => [e.iri, e.label ?? humanise(e.name)]),
      ),
    [snapshot.entities],
  );
  const label = (iri: string) =>
    labels.get(iri) ?? humanise(identifierParts(iri).name);
  const base = snapshot.ontology.namespace;

  const change = (values: Partial<QualityOptions>) => {
    const next = { ...options, ...values };
    setOptions(next);
    savePanel("quality.options", next, false);
  };
  const saveExceptions = (next: QualityException[]) => {
    setExceptions(next);
    savePanel("quality.exceptions", next, false);
  };
  const action = async (work: () => Promise<unknown>) => {
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message.replace(/^.*Error: /, ""));
    }
  };

  // Tools > Check ontology... opens the settings block.
  // Runs on mount too: Tools may have asked before this pane existed.
  useEffect(() => {
    if (!takeQualitySettingsRequest()) return;
    setSettingsOpen(true);
    setMode((m) => (m === "rules" ? m : "results"));
  }, [settingsRequests]);
  // A scan that finishes while the pane is open collapses the settings into
  // the summary line. Mounting is not a transition, so a pane remounted by
  // Tools keeps the settings it was asked to show.
  const seenJob = useRef(job ? job.id + ":" + job.state : "");
  useEffect(() => {
    const key = job ? job.id + ":" + job.state : "";
    if (key === seenJob.current) return;
    seenJob.current = key;
    if (job?.state === "complete") setSettingsOpen(false);
    setOpen("");
    setRecording("");
    setPage(0);
    if (job?.state !== "running") setStarting(false);
    if (mode === "review" || mode === "preview" || mode === "rejected")
      setMode("results");
  }, [job?.id, job?.state]);
  useEffect(() => {
    const total = job?.report?.findings.length ?? 0;
    if (job?.state === "complete")
      setAnnounce(
        t("announce.complete", {
          total,
          checks: job.report!.enabledChecks,
        }),
      );
    else if (job?.state === "canceled") setAnnounce(t("announce.canceled"));
    else if (job?.state === "failed") setAnnounce(t("announce.failed"));
  }, [job?.id, job?.state]);
  useEffect(() => {
    if (stale) setAnnounce(t("announce.stale"));
  }, [stale]);
  const filters = JSON.stringify([text, sevOn, showSuppressed, more, grouping]);
  const seenFilters = useRef(filters);
  useEffect(() => {
    if (seenFilters.current === filters) return;
    seenFilters.current = filters;
    setPage(0);
  }, [filters]);
  // The census the settings block shows follows the scope and the store.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void request<QualityCensusResult>("qualityCensus", {
        options: {
          scope: options.scope,
          namespace: options.namespace,
          root: options.root,
        },
      })
        .then((r) => live && setCensus(r))
        .catch(() => live && setCensus(undefined));
    }, 60);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    options.scope,
    options.namespace,
    options.root,
    snapshot.datasetEpoch,
    snapshot.version,
  ]);

  // Every scan entry point honours the scope guard, not only the settings row.
  // Checked synchronously so a scan cannot start before the census catches up.
  const scopeProblem: QlyKey | undefined =
    options.scope === "namespace" && !options.namespace.trim()
      ? "scope.needsNamespace"
      : options.scope === "branch" &&
          !snapshot.entities.some(
            (e) =>
              e.iri === options.root && ["Class", "Defined"].includes(e.kind),
          )
        ? "scope.needsRoot"
        : census?.scopeError
          ? options.scope === "namespace"
            ? "scope.needsNamespace"
            : "scope.needsRoot"
          : undefined;
  const unresolved = !!scopeProblem;
  const run = () =>
    void action(async () => {
      if (unresolved) {
        setSettingsOpen(true);
        return;
      }
      setStarting(true);
      setSettingsOpen(false);
      setMode("results");
      try {
        await startQuality(readQualityOptions(options));
      } catch (e) {
        setStarting(false);
        throw e;
      }
    });

  // ---------------------------------------------------------------- findings
  const suppressed = (f: QualityFinding) =>
    !!shown && !!qualitySuppression(shown, f, exceptions);
  const all = shown?.findings ?? [];
  const suppressedCount = all.filter(suppressed).length;
  const counts = Object.fromEntries(
    severities.map((s) => [
      s,
      all.filter((f) => f.severity === s && !suppressed(f)).length,
    ]),
  ) as Record<QualitySeverity, number>;
  const query = text.trim().toLowerCase();
  const narrowing = !!(query || more.kind || more.namespace);
  const passes = (f: QualityFinding) =>
    sevOn.includes(f.severity) &&
    (showSuppressed || !suppressed(f)) &&
    (!more.group || f.group === more.group) &&
    (!more.rule || f.rule === more.rule) &&
    (!more.kind || f.kind === more.kind) &&
    (!more.namespace || f.namespace === more.namespace) &&
    (!query ||
      [f.label, f.iri, f.rule, ruleOf(f.rule).title]
        .join(" ")
        .toLowerCase()
        .includes(query));
  const bands: Band[] = useMemo(() => {
    if (!shown) return [];
    const listed = shown.findings.filter(passes);
    if (grouping === "entity") {
      const byEntity = new Map<string, QualityFinding[]>();
      for (const f of listed)
        byEntity.set(f.iri, [...(byEntity.get(f.iri) ?? []), f]);
      return [...byEntity]
        .map(([iri, items]) => ({
          key: "e:" + iri,
          title: items[0].label || label(iri),
          id: iri,
          count: new Set(items.map((f) => f.rule)).size,
          items: items.sort(
            (a, b) =>
              severities.indexOf(a.severity) - severities.indexOf(b.severity) ||
              ruleOf(a.rule).title.localeCompare(ruleOf(b.rule).title),
          ),
        }))
        .sort(
          (a, b) =>
            a.title.localeCompare(b.title) || a.key.localeCompare(b.key),
        );
    }
    const checked = shown.coverage.filter((c) => c.checked).map((c) => c.rule);
    return checked
      .map((id): Band | undefined => {
        const severity = shown.options.rules[id] as QualitySeverity;
        const items = listed
          .filter((f) => f.rule === id)
          .sort(
            (a, b) =>
              a.label.localeCompare(b.label) || a.iri.localeCompare(b.iri),
          );
        const total = shown.findings.filter((f) => f.rule === id).length;
        const r = ruleOf(id);
        const visible =
          items.length > 0 ||
          (total === 0 &&
            !narrowing &&
            sevOn.includes(severity) &&
            (!more.group || r.group === more.group) &&
            (!more.rule || id === more.rule));
        return visible
          ? {
              key: "r:" + id,
              title: r.title,
              id,
              severity,
              count: items.length,
              items,
            }
          : undefined;
      })
      .filter((b): b is Band => !!b)
      .sort(
        (a, b) =>
          severities.indexOf(a.severity!) - severities.indexOf(b.severity!) ||
          b.count - a.count ||
          a.title.localeCompare(b.title),
      );
  }, [shown, exceptions, grouping, sevOn, showSuppressed, more, query, labels]);
  const listed = bands
    .filter((b) => expanded.includes(b.key))
    .reduce((n, b) => n + b.items.length, 0);
  const pages = Math.max(1, Math.ceil(listed / PAGE)),
    current = Math.min(page, pages - 1),
    first = current * PAGE;

  // ---------------------------------------------------------------- settings
  const knownCensus = census?.census ?? {};
  const withdrawn = census ? qualityWithdrawn(knownCensus) : [];
  // The hint counts checks these settings would run but the census withdrew.
  const withdrawnEnabled = withdrawn.filter(
    (id) =>
      options.rules[id] !== "Off" && options.groups.includes(ruleOf(id).group),
  ).length;
  const enabledChecks = qualityEnabledChecks(options, knownCensus).length;
  const offeredGroups = qualityGroups.filter((g) =>
    qualityRules.some(
      (r) =>
        r.group === g &&
        options.rules[r.id] !== "Off" &&
        !withdrawn.includes(r.id),
    ),
  );
  const offeredKinds = qualityKinds.filter(
    (k) =>
      (coreKinds.includes(k) || (census?.kinds[k] ?? 0) > 0) &&
      !(k === "Resource" && !(census?.kinds[k] ?? 0)),
  );

  // ---------------------------------------------------------------- actions
  const navigate = (iri: string) =>
    void action(async () => {
      // Partial findings from a canceled scan navigate under the same guard.
      if (!shown || staleStore) throw Error(t("stale.navigate"));
      await request("select", {
        iri,
        datasetEpoch: shown.datasetEpoch,
        version: shown.version,
      });
      editEntity(iri);
    });
  const exportReport = (format: "json" | "csv") =>
    void action(async () => {
      const file = await window.axiom.qualityExport({
        id: job!.id,
        format,
        exceptions,
        ...(staleStore
          ? { stale: snapshot.version }
          : staleSettings
            ? { stale: "settings" as const }
            : {}),
      });
      if (file) notify(t("export.done", { file }));
    });
  const record = (f: QualityFinding) => {
    if (!shown || !reason.trim()) return;
    saveExceptions([
      ...exceptions,
      {
        ontology: shown.ontology,
        iri: f.iri,
        rule: f.rule,
        signature: f.signature,
        reason: reason.trim(),
        recorded: new Date().toISOString(),
      },
    ]);
    setReason("");
    setRecording("");
  };
  const unsuppress = (f: QualityFinding) => {
    const e = shown && qualitySuppression(shown, f, exceptions);
    if (e) saveExceptions(exceptions.filter((x) => x !== e));
  };
  // Label additions need a current report: neither the store nor the settings changed.
  const canReview = !!report && !stale && !busy;
  const entityIds = useMemo(
    () => new Set(snapshot.entities.map((e) => e.iri)),
    [snapshot.entities],
  );
  const beginReview = () => {
    if (!report || !canReview) return;
    const predicates = qualityAdmitted(
      report.options.labelPredicates,
      report.census,
    );
    const language = report.options.languages[0] ?? "";
    const eligible = new Set<string>();
    const rows: Repair[] = [];
    for (const f of report.findings)
      if (
        f.rule === "label.missing" &&
        !suppressed(f) &&
        entityIds.has(f.iri) &&
        !eligible.has(f.iri)
      ) {
        eligible.add(f.iri);
        rows.push({
          iri: f.iri,
          label: humanise(identifierParts(f.iri).name),
          predicate: predicates[0] ?? report.options.labelPredicates[0],
          language,
          selected: false,
        });
      }
    const blocked = new Map<string, Repair["blocked"]>();
    for (const f of report.findings)
      if (!eligible.has(f.iri) && entityIds.has(f.iri))
        if (f.rule === "label.empty") blocked.set(f.iri, "blank");
        else if (
          ["label.multiple", "skos.multiple", "skos.disjoint"].includes(
            f.rule,
          ) &&
          !blocked.has(f.iri)
        )
          blocked.set(f.iri, "conflicting");
    for (const [iri, why] of blocked)
      rows.push({
        iri,
        label: "",
        predicate: "",
        language: "",
        selected: false,
        blocked: why,
      });
    setRepairs(rows);
    setPreview(undefined);
    setRejected(undefined);
    setMode("review");
  };
  const buildPreview = () =>
    void action(async () => {
      try {
        setPreview(
          await request<QualityPreview>("qualityPreview", {
            id: job!.id,
            rows: repairs
              .filter((r) => r.selected && !r.blocked)
              .map(({ iri, label, predicate, language }) => ({
                iri,
                label,
                predicate,
                language,
              })),
          }),
        );
        setMode("preview");
      } catch (e) {
        const r = rejection((e as Error).message);
        if (!r) throw e;
        setRejected(r);
        setMode("rejected");
      }
    });
  const apply = () =>
    void action(async () => {
      if (!preview) return;
      try {
        const n = await request<number>("qualityApply", {
          datasetEpoch: preview.datasetEpoch,
          version: preview.version,
          token: preview.token,
        });
        setPreview(undefined);
        setRepairs([]);
        setMode("results");
        notify(t("labels.applied", { n }));
      } catch (e) {
        const r = rejection((e as Error).message);
        if (!r) throw e;
        setRejected(r);
        setMode("rejected");
      }
    });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // An open menu takes Escape for itself; the pane keeps its state.
    if (root.current?.querySelector(".quality-menu:popover-open")) return;
    if (open) {
      const id = open;
      setOpen("");
      setRecording("");
      root.current
        ?.querySelector<HTMLElement>(`[data-finding="${CSS.escape(id)}"]`)
        ?.focus();
      event.stopPropagation();
    } else if (mode === "review" || mode === "preview" || mode === "rejected") {
      setMode(mode === "review" ? "results" : "review");
      event.stopPropagation();
    } else if (mode !== "results") {
      setMode("results");
      event.stopPropagation();
    } else if (settingsOpen && report && !unresolved) {
      // An unresolved scope keeps its settings, and their reason, in view.
      setSettingsOpen(false);
      event.stopPropagation();
    }
  };

  // ---------------------------------------------------------------- regions
  const severityWord = (s: QualitySeverity) => (
    <span className={"sev " + severityClass(s)}>
      <SeverityGlyph severity={s} />
      {s}
    </span>
  );
  const commandBar = () => {
    if (job?.state === "running")
      return (
        <div className="bar">
          <span className="title">{t("title")}</span>
          <span className="state">
            <Play />
            {t("running.state")}
          </span>
          <span
            className="prog"
            role="progressbar"
            aria-label={t("running.state")}
            aria-valuemin={0}
            aria-valuemax={Math.max(1, job.total)}
            aria-valuenow={job.scanned}
          >
            <i
              style={{
                width:
                  Math.round((job.scanned / Math.max(1, job.total)) * 100) +
                  "%",
              }}
            />
          </span>
          <span className="sum">
            {t("running.progress", { scanned: job.scanned, total: job.total })}
          </span>
          <button className="btn" onClick={() => void action(cancelQuality)}>
            {t("cancel")}
          </button>
        </div>
      );
    if (job?.state === "failed")
      return (
        <div className="bar alert-bad">
          <span className="state">
            <Failed />
            {t("failed.state")}
          </span>
          <span className="sum">
            {(job.error?.replace(/^.*Error: /, "") || t("failed.fallback")) +
              " " +
              t("failed.partial")}
          </span>
          {/* The settings that failed must stay reachable to be corrected. */}
          <button
            className="btn"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            {t("change")}
          </button>
          {!settingsOpen && (
            <button className="btn" disabled={busy || unresolved} onClick={run}>
              {t("run")}
            </button>
          )}
        </div>
      );
    if (shown && stale)
      return (
        <div className="bar alert-warn">
          <span className="state">
            <Triangle />
            {t("stale.state")}
          </span>
          <span className="sum">
            {staleStore
              ? t("stale.store", {
                  ran: String(shown.version),
                  current: String(snapshot.version),
                })
              : t("stale.settings", {
                  checks: shown.enabledChecks,
                  scope: scopeText(shown.options, label),
                })}
          </span>
          <button className="btn" disabled={busy || unresolved} onClick={run}>
            <Rerun />
            {t("rerun")}
          </button>
        </div>
      );
    if (job?.state === "canceled")
      return (
        <div className="bar alert-warn">
          <span className="state">
            <Triangle />
            {t("canceled.state")}
          </span>
          <span className="sum">
            {t("canceled.summary", { scanned: job.scanned, total: job.total })}
          </span>
          <button className="btn" disabled={busy || unresolved} onClick={run}>
            <Rerun />
            {t("rerun")}
          </button>
        </div>
      );
    if (report)
      return (
        <div className="bar">
          <span className="title">{t("title")}</span>
          <span className="sum">
            {t("summary", {
              scope: scopeText(report.options, label),
              checks: report.enabledChecks,
              revision: String(report.version),
              scanned: report.scanned,
              time: time(report.createdAt),
            })}
          </span>
          <button
            className="btn"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            {t("change")}
          </button>
          <button
            className="btn at-wide"
            disabled={busy || unresolved}
            onClick={run}
          >
            <Rerun />
            {t("rerun.short")}
          </button>
        </div>
      );
    return (
      <div className="bar">
        <span className="title">{t("title")}</span>
        <span className="sum">{t("idle.summary")}</span>
      </div>
    );
  };
  const vocabulary = () => {
    const present = qualityVocabularies.filter((v) => knownCensus[v]);
    const absent = qualityVocabularies.filter((v) => !knownCensus[v]);
    return (
      <div className="srow at-tall">
        <span className="k">{t("vocab.label")}</span>
        {present.map((v) => (
          <span
            key={v}
            className="tagf"
            title={knownCensus[v]!.slice(0, 12).map(shorten).join(", ")}
          >
            {v}
          </span>
        ))}
        <span className="hint">
          {absent.length
            ? withdrawnEnabled
              ? tn("vocab.absent", withdrawnEnabled, {
                  list: absent.join(", "),
                })
              : t("vocab.absent.none", { list: absent.join(", ") })
            : t("vocab.allPresent")}
        </span>
      </div>
    );
  };
  const settings = () => (
    <div className="settings">
      <div className="srow">
        <span className="k">{t("scope.label")}</span>
        <select
          className="sel"
          aria-label={t("scope.label")}
          value={options.scope}
          disabled={busy}
          onChange={(e) =>
            change({ scope: e.target.value as QualityOptions["scope"] })
          }
        >
          <option value="ontology">{t("scope.ontology")}</option>
          <option value="namespace">{t("scope.namespace")}</option>
          <option value="branch">{t("scope.branch")}</option>
        </select>
        {options.scope === "namespace" && (
          <input
            className="txt"
            aria-label={t("scope.namespace")}
            value={options.namespace}
            placeholder={base}
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
        {scopeProblem && <span className="hint">{t(scopeProblem)}</span>}
        <span className="fill"></span>
        <button
          className="btn primary"
          disabled={busy || unresolved}
          onClick={run}
        >
          <Play />
          {t("run")}
        </button>
      </div>
      <div className="srow at-tall">
        <span className="k">{t("kinds.label")}</span>
        {offeredKinds.map((k) => (
          <button
            key={k}
            className="chip"
            aria-pressed={options.kinds.includes(k)}
            disabled={busy}
            onClick={() => change({ kinds: toggle(options.kinds, k) })}
          >
            {kindPlural[k] + " "}
            <span className="n">
              {(census?.kinds[k] ?? 0).toLocaleString("en-US")}
            </span>
          </button>
        ))}
      </div>
      <div className="srow at-tall">
        <span className="k">{t("checks.label")}</span>
        {offeredGroups.map((g) => (
          <button
            key={g}
            className="chip"
            aria-pressed={options.groups.includes(g)}
            disabled={busy}
            onClick={() => change({ groups: toggle(options.groups, g) })}
          >
            {qualityGroupLabel(g)}
          </button>
        ))}
        <span className="hint">{tn("checks.hint", enabledChecks)}</span>
        <button
          className="btn"
          aria-pressed={mode === "rules"}
          onClick={() => setMode(mode === "rules" ? "results" : "rules")}
        >
          {t("rules.open")}
        </button>
      </div>
      {vocabulary()}
    </div>
  );
  // Partial findings from a canceled scan keep their filters reachable; only a
  // complete report has a coverage view and an export.
  const tools = () => (
    <div className="tools">
      {report && (
        <div className="seg" role="group" aria-label={t("view.label")}>
          <button
            aria-pressed={view === "findings"}
            onClick={() => setView("findings")}
          >
            {t("view.findings")}
          </button>
          <button
            aria-pressed={view === "coverage"}
            onClick={() => setView("coverage")}
          >
            {t("view.coverage")}
          </button>
        </div>
      )}
      {resultView === "findings" && (
        <>
          {/* Active filters lead, so their clear controls stay on screen when
              a narrow tools bar runs out of room. */}
          {(Object.keys(more) as (keyof typeof more)[])
            .filter((k) => more[k])
            .map((k) => {
              const name = t(("filter." + k) as QlyKey);
              const value =
                k === "rule"
                  ? ruleOf(more.rule).title
                  : k === "group"
                    ? qualityGroupLabel(more.group as QualityGroup)
                    : k === "kind"
                      ? kindName(more.kind)
                      : more.namespace;
              return (
                <button
                  key={k}
                  className="chip"
                  aria-pressed="true"
                  aria-label={t("filter.remove", { name, value })}
                  onClick={() => setMore({ ...more, [k]: "" })}
                >
                  {t("filter.active", { name, value }) + " ×"}
                </button>
              );
            })}
          {/* Narrow sizes withdraw the text field; its filter stays clearable. */}
          {narrow && query && (
            <button
              className="chip"
              aria-pressed="true"
              aria-label={t("filter.remove", {
                name: t("filter.text"),
                value: text.trim(),
              })}
              onClick={() => setText("")}
            >
              {t("filter.active", {
                name: t("filter.text"),
                value: text.trim(),
              }) + " ×"}
            </button>
          )}
          {severities.map((s) => (
            <button
              key={s}
              className="chip"
              aria-pressed={sevOn.includes(s)}
              onClick={() => setSevOn(toggle(sevOn, s))}
            >
              <span className={"sev " + severityClass(s)}>
                <SeverityGlyph severity={s} />
              </span>
              {s + " "}
              <span className="n">{counts[s].toLocaleString("en-US")}</span>
            </button>
          ))}
          <button
            className="chip"
            aria-pressed={showSuppressed}
            onClick={() => setShowSuppressed(!showSuppressed)}
          >
            {t("filter.suppressed") + " "}
            <span className="n">{suppressedCount.toLocaleString("en-US")}</span>
          </button>
        </>
      )}
      <span className="fill"></span>
      {resultView === "findings" && (
        <>
          <select
            className="sel at-tall"
            aria-label={t("groupBy.label")}
            value={grouping}
            onChange={(e) => setGrouping(e.target.value as "rule" | "entity")}
          >
            <option value="rule">{t("groupBy.rule")}</option>
            <option value="entity">{t("groupBy.entity")}</option>
          </select>
          <input
            className="txt at-wide"
            type="search"
            placeholder={t("filter.placeholder")}
            aria-label={t("filter.label")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </>
      )}
      {report && (
        <>
          <button
            ref={exportButton}
            className="btn"
            aria-label={t("export.label")}
            aria-describedby={exportNote}
            title={t("export.note", { total: all.length })}
            popoverTarget={exportId}
          >
            <Download />
            <span className="at-full">{t("export")}</span>
          </button>
          <span id={exportNote} className="sr">
            {t("export.note", { total: all.length })}
          </span>
          <Menu id={exportId} label={t("export.label")} anchor={exportButton}>
            <button onClick={() => exportReport("json")}>
              {t("export.json")}
            </button>
            <button onClick={() => exportReport("csv")}>
              {t("export.csv")}
            </button>
            <p>{t("export.note", { total: all.length })}</p>
          </Menu>
        </>
      )}
      <button
        ref={moreButton}
        className="ib"
        aria-label={t("more.label")}
        title={t("more")}
        popoverTarget={moreId}
      >
        <FindGlyph name="more" />
      </button>
      <Menu id={moreId} label={t("more.label")} anchor={moreButton}>
        {(
          [
            [
              "group",
              qualityGroups
                .filter((g) => all.some((f) => f.group === g))
                .map((g) => [g, qualityGroupLabel(g)]),
            ],
            [
              "rule",
              [...new Set(all.map((f) => f.rule))]
                .map((id) => [id, ruleOf(id).title])
                .sort((a, b) => a[1].localeCompare(b[1])),
            ],
            [
              "kind",
              [...new Set(all.map((f) => f.kind))]
                .sort()
                .map((k) => [k, kindName(k)]),
            ],
            [
              "namespace",
              [...new Set(all.map((f) => f.namespace))]
                .sort()
                .map((n) => [n, n]),
            ],
          ] as [keyof typeof more, string[][]][]
        ).map(([key, choices]) => (
          <label key={key}>
            {t(("filter." + key) as QlyKey)}
            <select
              value={more[key]}
              onChange={(e) => setMore({ ...more, [key]: e.target.value })}
            >
              <option value="">{t("filter.all")}</option>
              {choices.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button onClick={() => setMode("exceptions")}>
          {t("exceptions.title")}
        </button>
        <button disabled={!canReview} onClick={beginReview}>
          {t("labels.review")}
        </button>
        {!canReview && <p>{t("labels.unavailable")}</p>}
      </Menu>
    </div>
  );
  const findingRow = (f: QualityFinding, entityBand = false) => {
    const isOpen = open === f.id;
    const isSuppressed = suppressed(f);
    const name = f.label || label(f.iri);
    return (
      <Fragment key={f.id}>
        <div
          className={
            "frow" +
            (isOpen ? " open" : "") +
            (isSuppressed ? " suppressed" : "")
          }
        >
          <button
            className="fname"
            aria-expanded={isOpen}
            data-finding={f.id}
            onClick={() => {
              setOpen(isOpen ? "" : f.id);
              setRecording("");
              setReason("");
            }}
          >
            {entityBand ? (
              <>
                <span className="lbl">{ruleOf(f.rule).title}</span>
                <span className="kind">{f.severity}</span>
                <span className="iri">{f.rule}</span>
                <span className="fold">{f.severity + " · " + f.rule}</span>
              </>
            ) : (
              <>
                <span className="lbl">{name}</span>
                <span className="kind">{kindName(f.kind)}</span>
                <span className="iri">{f.iri}</span>
                <span className="fold">
                  {kindName(f.kind) + " · " + identifierParts(f.iri).name}
                </span>
              </>
            )}
          </button>
          <span className="fact">
            {isSuppressed ? (
              <button
                className="ib"
                aria-label={t("detail.unsuppress", { entity: name })}
                onClick={() => unsuppress(f)}
              >
                <Unsuppress />
              </button>
            ) : (
              <>
                {f.kind !== "Ontology" && (
                  <button
                    className="ib"
                    aria-label={t("detail.open", { entity: name })}
                    onClick={() => navigate(f.iri)}
                  >
                    <OpenDetails />
                  </button>
                )}
                <button
                  className="ib"
                  aria-label={t("detail.suppress", { entity: name })}
                  onClick={() => {
                    setOpen(f.id);
                    setRecording(f.id);
                    setReason("");
                  }}
                >
                  <Suppress />
                </button>
              </>
            )}
          </span>
        </div>
        {isOpen && detail(f, isSuppressed)}
      </Fragment>
    );
  };
  const detail = (f: QualityFinding, isSuppressed: boolean) => {
    const r = ruleOf(f.rule);
    const name = f.label || label(f.iri);
    const alias = f.evidence.find(
      (s) =>
        s.subject === f.iri &&
        s.object.literal &&
        s.object.value.trim() &&
        (aliasPredicates.includes(s.predicate) ||
          s.predicate.slice(s.predicate.lastIndexOf("#") + 1) === "inflection"),
    );
    const excluded = all.some(
      (o) => o.iri === f.iri && o.rule === "analysis.excluded",
    );
    const others = [
      ...new Set(
        all
          .filter((o) => o.iri === f.iri && o.rule !== f.rule)
          .map((o) => ruleOf(o.rule).title),
      ),
    ];
    const exception = shown && qualitySuppression(shown, f, exceptions);
    const labelPredicate = shown
      ? qualityAdmitted(shown.options.labelPredicates, shown.census)[0]
      : undefined;
    const language = shown?.options.languages[0];
    // The same destination the reviewed preview uses: an entity described in
    // one named graph gets its label there; otherwise the default graph.
    const graphs = [
      ...new Set(
        f.evidence.filter((s) => s.subject === f.iri).map((s) => s.graph),
      ),
    ];
    const wouldAdd =
      f.rule === "label.missing" && labelPredicate && entityIds.has(f.iri)
        ? turtleLines(
            [
              {
                subject: f.iri,
                predicate: labelPredicate,
                object: {
                  value: humanise(identifierParts(f.iri).name),
                  literal: true,
                  ...(language
                    ? { language, datatype: NS.rdf + "langString" }
                    : {}),
                },
                ...(graphs.length === 1 && graphs[0]
                  ? { graph: graphs[0] }
                  : {}),
              },
            ],
            base,
          )
        : "";
    return (
      <div className="fdet" role="group" aria-label={name + ", " + r.title}>
        {/* A suppressed finding leads with why it is suppressed (exhibit F). */}
        {isSuppressed && exception && (
          <>
            <div className="kv">
              <span className="k">{t("detail.exception")}</span>
              <span className="v">{exception.reason}</span>
            </div>
            {exception.recorded && (
              <div className="kv">
                <span className="k">{t("detail.recorded")}</span>
                <span className="v">
                  {t("detail.recordedBody", { date: day(exception.recorded) })}
                </span>
              </div>
            )}
          </>
        )}
        <div className="kv">
          <span className="k">{t("detail.rule")}</span>
          <span className="v">
            {/* One text node between the elements, as the reference has. */}
            <b>{r.title}</b>
            {" · " + f.severity + " · "}
            <span className="mono">{f.rule}</span>
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.basis")}</span>
          <span className="v">{f.basis}</span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.entity")}</span>
          <span className="v">
            {kindName(f.kind) + " · "}
            <span className="iri-v">{f.iri}</span>
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.evidence")}</span>
          <span className="v">
            {f.evidence.length ? (
              <pre>{turtleEvidence(f.evidence, base)}</pre>
            ) : (
              <span className="na">{t("detail.noEvidence")}</span>
            )}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.reading")}</span>
          <span className="v">
            {f.rule === "label.missing"
              ? alias && !excluded
                ? rich("reading.alias", {
                    predicate: (
                      <code className="mono">
                        {turtleTerm(alias.predicate, base)}
                      </code>
                    ),
                    eligible: <b>{t("reading.eligible")}</b>,
                  })
                : rich("reading.derived", {
                    name: <b>{name}</b>,
                    fragment: (
                      <code className="mono">
                        {identifierParts(f.iri).name}
                      </code>
                    ),
                  })
              : f.message}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.consequence")}</span>
          <span className="v">{ruleCopy[f.rule]?.why}</span>
        </div>
        <div className="kv">
          <span className="k">{t("detail.correction")}</span>
          <span className="v">{f.suggestion}</span>
        </div>
        {wouldAdd && (
          <div className="kv">
            <span className="k">{t("detail.wouldAdd")}</span>
            <span className="v">
              <pre className="preview">{wouldAdd}</pre>
            </span>
          </div>
        )}
        <div className="kv">
          <span className="k">{t("detail.alsoUnder")}</span>
          <span className="v">
            {others.length ? (
              others.map((title, i) => (
                <Fragment key={title}>
                  {i ? " " : ""}
                  <span className="tagf">{title}</span>
                </Fragment>
              ))
            ) : (
              <span className="na">
                {f.rule === "label.missing" && !excluded
                  ? t("detail.nothingExcluded")
                  : t("detail.nothing")}
              </span>
            )}
          </span>
        </div>
        {!isSuppressed && recording === f.id && (
          <div className="kv">
            <span className="k">{t("detail.exception")}</span>
            <span className="v reason">
              <input
                className="txt"
                aria-label={t("exception.reason", { entity: name })}
                placeholder={t("exception.placeholder")}
                value={reason}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") record(f);
                }}
              />
              <button
                className="btn"
                disabled={!reason.trim()}
                onClick={() => record(f)}
              >
                {t("exception.record")}
              </button>
            </span>
          </div>
        )}
      </div>
    );
  };
  const findingsBody = (readOnlyPartial = false) => {
    if (!shown) return null;
    // Passing rules keep their bands, but not when the filters hide every finding.
    if (!bands.some((b) => b.count))
      return all.length ? (
        <div className="state-body">
          <h3>{t("filter.empty.headline")}</h3>
          <p>
            {t("filter.empty.body", {
              total: t("foot.totals", {
                total: all.length,
                suppressed: 0,
              }).split(" · ")[0],
            })}
          </p>
        </div>
      ) : null;
    let offset = 0;
    return bands.map((b) => {
      const isExpanded = expanded.includes(b.key);
      const start = offset;
      if (isExpanded) offset += b.items.length;
      const visible = isExpanded
        ? b.items.slice(
            Math.max(0, first - start),
            Math.max(0, first + PAGE - start),
          )
        : [];
      return (
        <Fragment key={b.key}>
          <button
            className="rule"
            aria-expanded={isExpanded}
            onClick={() => setExpanded(toggle(expanded, b.key))}
          >
            <span className="tw">
              <Chevron />
            </span>
            {b.severity && severityWord(b.severity)}
            <span className="nm">{b.title}</span>
            {b.id && <span className="id wide">{b.id}</span>}
            <span className="ct">{b.count.toLocaleString("en-US")}</span>
          </button>
          {isExpanded &&
            b.items.length > 0 &&
            (visible.length ? (
              <div className="flist">
                {visible.map((f) =>
                  findingRow(f, grouping === "entity" && !readOnlyPartial),
                )}
              </div>
            ) : (
              <div className="offpage">
                {t("page.offpage", { n: b.items.length })}
              </div>
            ))}
        </Fragment>
      );
    });
  };
  const coverageBody = () => {
    if (!shown) return null;
    const rows = shown.coverage.filter((c) => c.checked);
    const disabled = shown.coverage.filter((c) => !c.checked).length;
    const metadata = shown.coverage.find((c) => c.rule === "metadata.missing");
    const predicates: Record<string, string[]> = {
      "label.missing": shown.options.labelPredicates,
      "description.missing": shown.options.descriptionPredicates,
      "definition.missing": shown.options.definitionPredicates,
      "deprecated.guidance": [
        ...shown.options.replacementPredicates,
        NS.rdfs + "comment",
      ],
    };
    return (
      <div className="cov">
        <table className="ct">
          <thead>
            <tr>
              <th>{t("coverage.check")}</th>
              <th className="n">{t("coverage.applicable")}</th>
              <th className="n">{t("coverage.present")}</th>
              <th className="n">{t("coverage.missing")}</th>
              <th className="n">{t("coverage.suppressed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const tests = predicates[c.rule]
                ? qualityAdmitted(predicates[c.rule], shown.census)
                    .map(shorten)
                    .join(", ")
                : ruleCopy[c.rule]?.tests;
              const held = all.filter(
                (f) => f.rule === c.rule && suppressed(f),
              ).length;
              const present = c.applicable - c.affected;
              return (
                <tr key={c.rule}>
                  <td>
                    {ruleCopy[c.rule]?.check ?? ruleOf(c.rule).title}
                    <span className="sub">{tests}</span>
                  </td>
                  {c.applicable ? (
                    <>
                      <td className="n">
                        {c.applicable.toLocaleString("en-US")}
                      </td>
                      <td className="n">
                        {present.toLocaleString("en-US") + " "}
                        <span className="na">
                          {"(" +
                            Math.round((present / c.applicable) * 100) +
                            "%)"}
                        </span>
                      </td>
                      <td className="n">
                        {c.affected.toLocaleString("en-US")}
                      </td>
                      <td className="n">{held.toLocaleString("en-US")}</td>
                    </>
                  ) : (
                    <>
                      <td className="n na">0</td>
                      <td className="n na" colSpan={3}>
                        {t("coverage.na")}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">{t("coverage.note")}</p>
        <p className="note">
          {t("coverage.exclusions", { n: metadata?.applicable ?? 0 })}
        </p>
        {disabled > 0 && (
          <p className="note">{tn("coverage.disabled", disabled)}</p>
        )}
        {shown.imports.length > 0 && (
          <p className="note">
            {t("coverage.imports", { list: shown.imports.join(", ") })}
          </p>
        )}
      </div>
    );
  };
  const rulesBody = () => {
    const admitted = qualityRules.filter((r) => !withdrawn.includes(r.id));
    return (
      <div className="rcfg">
        <p>{t("severity.note")}</p>
        {qualityGroups.map((g) => {
          const rules = admitted.filter((r) => r.group === g);
          return rules.length ? (
            <Fragment key={g}>
              <h3>{qualityGroupLabel(g)}</h3>
              {rules.map((r) => (
                <div className="rrow" key={r.id}>
                  <span className="nm">{r.title}</span>
                  <span className="id">{r.id}</span>
                  <span className="def">
                    {t("rules.default", {
                      severity:
                        qualityDefaultSeverity(r) === "Off"
                          ? t("rules.off")
                          : r.severity,
                    })}
                  </span>
                  <select
                    className="sel"
                    aria-label={t("rules.severity", { rule: r.title })}
                    value={options.rules[r.id]}
                    onChange={(e) =>
                      change({
                        rules: {
                          ...options.rules,
                          [r.id]: e.target
                            .value as QualityOptions["rules"][string],
                        },
                      })
                    }
                  >
                    <option value="Off">{t("rules.off")}</option>
                    {severities.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </Fragment>
          ) : null;
        })}
        <label>
          {t("rules.languages")}
          <input
            value={options.languages.join(", ")}
            placeholder={t("rules.languagesHint")}
            onChange={(e) =>
              change({
                languages: e.target.value
                  .split(",")
                  .map((s) => s.trim().toLowerCase()),
              })
            }
          />
        </label>
        {(
          [
            ["labelPredicates", "rules.labelPredicates"],
            ["descriptionPredicates", "rules.descriptionPredicates"],
            ["definitionPredicates", "rules.definitionPredicates"],
            ["replacementPredicates", "rules.replacementPredicates"],
          ] as const
        ).map(([key, title]) => (
          <label key={key}>
            {t(title)}
            <textarea
              rows={3}
              value={options[key].join("\n")}
              onChange={(e) => change({ [key]: e.target.value.split("\n") })}
            />
          </label>
        ))}
        <p>{t("rules.predicatesHint")}</p>
        <div>
          <button className="btn" onClick={() => setMode("results")}>
            {t("rules.done")}
          </button>
        </div>
      </div>
    );
  };
  const exceptionsBody = () => {
    const mine = exceptions.filter(
      (e) => !shown || e.ontology === shown.ontology,
    );
    return (
      <>
        <div className="state-body">
          <h3>{t("exceptions.title")}</h3>
          {!mine.length && <p>{t("exceptions.empty")}</p>}
        </div>
        {mine.length > 0 && (
          <div className="flist">
            {mine.map((e, i) => (
              <div className="frow" key={i}>
                <div className="fname">
                  <span className="lbl">{label(e.iri)}</span>
                  <span className="kind">{e.rule}</span>
                  <span className="iri">{e.reason}</span>
                  <span className="fold">{e.rule + " · " + e.reason}</span>
                </div>
                <span className="fact">
                  <button
                    className="ib"
                    aria-label={t("detail.unsuppress", {
                      entity: label(e.iri),
                    })}
                    onClick={() =>
                      saveExceptions(exceptions.filter((x) => x !== e))
                    }
                  >
                    <Unsuppress />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="state-body flush">
          <div>
            <button className="btn" onClick={() => setMode("results")}>
              {t("exceptions.close")}
            </button>
          </div>
        </div>
      </>
    );
  };
  const body = () => {
    if (mode === "rules") return rulesBody();
    if (mode === "exceptions") return exceptionsBody();
    if (busy)
      return (
        <div className="state-body">
          <h3>{t("running.state")}</h3>
          <p>{t("running.body")}</p>
        </div>
      );
    if (job?.state === "failed")
      return (
        <div className="state-body">
          <h3>{t("failed.headline")}</h3>
          <p>{t("failed.body")}</p>
        </div>
      );
    if (job?.state === "canceled")
      return (
        <>
          <div className="state-body">
            <p>{t("canceled.body")}</p>
          </div>
          {findingsBody(true)}
        </>
      );
    if (!report)
      return (
        <div className="state-body">
          <h3>{t("idle.headline")}</h3>
          <p>{t("idle.body")}</p>
        </div>
      );
    if (resultView === "coverage") return coverageBody();
    if (!report.enabledChecks)
      return (
        <div className="state-body">
          <h3>{t("nochecks.headline")}</h3>
          <p>{t("nochecks.body")}</p>
        </div>
      );
    if (!report.findings.length)
      return (
        <div className="state-body">
          <h3>{t("clean.headline")}</h3>
          <p>
            {tn("clean.body", report.enabledChecks, {
              scanned: report.scanned,
              checks: report.enabledChecks,
            })}
          </p>
          <p>{t("clean.notCanceled")}</p>
        </div>
      );
    return findingsBody();
  };
  const footer = () => {
    if (job?.state === "failed") return null;
    // A canceled report pages its partial findings once any are listed.
    if (job?.state === "canceled" && !listed) return null;
    if (!shown || busy) return <div className="foot"></div>;
    const totals = t("foot.totals", {
      total: all.length,
      suppressed: suppressedCount,
    });
    if (resultView === "coverage" || !all.length || !listed)
      return (
        <div className="foot">
          <span>
            {resultView === "findings" &&
            all.length &&
            bands.some((b) => b.count)
              ? t("foot.collapsed") + " · " + totals
              : totals}
          </span>
        </div>
      );
    return (
      <div className="foot">
        <span>
          {t("foot.position", {
            first: first + 1,
            last: Math.min(listed, first + PAGE),
            listed,
          }) +
            " · " +
            totals}
        </span>
        <span className="fill"></span>
        <button
          className="ib"
          aria-label={t("foot.first")}
          disabled={!current}
          onClick={() => setPage(0)}
        >
          |←
        </button>
        <button
          className="ib"
          aria-label={t("foot.previous")}
          disabled={!current}
          onClick={() => setPage(current - 1)}
        >
          ←
        </button>
        <span className="pg">
          {t("foot.page", { page: current + 1, pages })}
        </span>
        <button
          className="ib"
          aria-label={t("foot.next")}
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
        >
          →
        </button>
        <button
          className="ib"
          aria-label={t("foot.last")}
          disabled={current + 1 >= pages}
          onClick={() => setPage(pages - 1)}
        >
          →|
        </button>
        <span className="store at-full">
          {t("foot.store", {
            classes: snapshot.classCount,
            individuals: snapshot.individualCount,
            triples: snapshot.tripleCount,
          })}
        </span>
      </div>
    );
  };

  // ------------------------------------------------- reviewed label additions
  const reviewPane = () => {
    const eligible = repairs.filter((r) => !r.blocked);
    const chosen = eligible.filter((r) => r.selected).length;
    const predicates = report
      ? qualityAdmitted(report.options.labelPredicates, report.census)
      : [];
    const languages = [
      ...new Set(["", ...(report?.options.languages ?? []), "en"]),
    ];
    const update = (iri: string, values: Partial<Repair>) =>
      setRepairs(repairs.map((r) => (r.iri === iri ? { ...r, ...values } : r)));
    return (
      <>
        <div className="bar">
          <span className="title">{t("labels.review")}</span>
          <span className="sum">
            {t("labels.reviewSummary", {
              n: eligible.length,
              revision: String(report?.version ?? 0),
            })}
          </span>
          <button
            className="btn"
            onClick={() =>
              setRepairs(
                repairs.map((r) => ({
                  ...r,
                  selected: !r.blocked && chosen < eligible.length,
                })),
              )
            }
          >
            {chosen < eligible.length
              ? t("labels.selectAll")
              : t("labels.clear")}
          </button>
          <button className="btn" onClick={() => setMode("results")}>
            {t("cancel")}
          </button>
          <button
            className="btn primary"
            disabled={!chosen || stale}
            onClick={buildPreview}
          >
            {t("labels.preview")}
          </button>
        </div>
        <div className="body">
          <div className="flist">
            {repairs.map((r) => {
              const entity = identifierParts(r.iri).name;
              const who = label(r.iri);
              return r.blocked ? (
                <div className="lrow" key={r.iri}>
                  <input
                    type="checkbox"
                    disabled
                    aria-label={t("labels.ineligible", { entity: who })}
                  />
                  <span className="ent off">{entity}</span>
                  <span className="ent na">
                    {t(
                      r.blocked === "blank"
                        ? "labels.blank"
                        : "labels.conflicting",
                    ) +
                      " " +
                      t("labels.details")}
                  </span>
                </div>
              ) : (
                <div className="lrow" key={r.iri}>
                  <input
                    type="checkbox"
                    checked={r.selected}
                    aria-label={t("labels.include", { entity: who })}
                    onChange={(e) =>
                      update(r.iri, { selected: e.target.checked })
                    }
                  />
                  <span className="ent" title={r.iri}>
                    {entity}
                  </span>
                  <input
                    className="cand"
                    type="text"
                    value={r.label}
                    aria-label={t("labels.label", { entity: who })}
                    onChange={(e) => update(r.iri, { label: e.target.value })}
                  />
                  <select
                    className="pred"
                    aria-label={t("labels.predicate", { entity: who })}
                    value={r.predicate}
                    onChange={(e) =>
                      update(r.iri, { predicate: e.target.value })
                    }
                  >
                    {predicates.map((p) => (
                      <option key={p} value={p}>
                        {shorten(p)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="lang"
                    aria-label={t("labels.language", { entity: who })}
                    value={r.language}
                    onChange={(e) =>
                      update(r.iri, { language: e.target.value })
                    }
                  >
                    {languages.map((l) => (
                      <option key={l} value={l}>
                        {l || t("labels.noLanguage")}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
        <div className="foot">
          <span>
            {t("labels.selected", { selected: chosen, total: eligible.length })}
          </span>
        </div>
      </>
    );
  };
  const previewPane = () => {
    if (!preview) return null;
    const n = preview.statements.length;
    const single = n - preview.multiGraph.length;
    return (
      <>
        <div className="bar">
          <span className="title">{t("labels.previewTitle")}</span>
          <span className="sum">{t("labels.previewSummary", { n })}</span>
          <button className="btn" onClick={() => setMode("review")}>
            {t("cancel")}
          </button>
          <button className="btn primary" disabled={stale} onClick={apply}>
            {tn("labels.apply", n)}
          </button>
        </div>
        <div className="body">
          <div className="fdet ok">
            <div className="kv">
              <span className="k">{t("detail.wouldAdd")}</span>
              <span className="v">
                <pre className="preview">
                  {turtleLines(preview.statements, base)}
                </pre>
              </span>
            </div>
            <div className="kv">
              <span className="k">{t("labels.graph")}</span>
              <span className="v">
                {[
                  single > 0
                    ? single === 1
                      ? t("labels.graph.single.one")
                      : single === 2
                        ? t("labels.graph.single.two")
                        : t("labels.graph.single", { n: single })
                    : "",
                  preview.multiGraph.length
                    ? t("labels.graph.multiple", {
                        n: preview.multiGraph.length,
                        list: preview.multiGraph
                          .map((iri) => turtleTerm(iri, base))
                          .join(", "),
                      })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            </div>
            <div className="kv">
              <span className="k">{t("labels.guard")}</span>
              <span className="v">
                {rich("labels.guardValue", {
                  dataset: <code className="mono">{report?.name ?? ""}</code>,
                  revision: <b>{preview.version}</b>,
                  token: (
                    <code className="mono">
                      {"pv-" + preview.token.toString(16).padStart(4, "0")}
                    </code>
                  ),
                })}
              </span>
            </div>
            <div className="kv">
              <span className="k">{t("labels.retained")}</span>
              <span className="v">{t("labels.retainedValue")}</span>
            </div>
          </div>
        </div>
      </>
    );
  };
  const rejectedPane = () => {
    const code = rejected?.code ?? "invalid";
    const key = ("labels.reject." + code) as QlyKey;
    return (
      <>
        <div className="bar alert-bad">
          <span className="state">
            <Failed />
            {t("labels.notApplied")}
          </span>
          <span className="sum">{t("labels.nothingWritten")}</span>
          <button className="btn" onClick={() => setMode("review")}>
            {t("cancel")}
          </button>
        </div>
        <div className="body">
          <div className="guard" role="alert">
            <b>{key in qly ? t(key) : t("labels.reject.invalid")}</b>
            {" " +
              t(
                ((key in qly ? key : "labels.reject.invalid") +
                  ".body") as QlyKey,
                { entity: label(rejected?.entity ?? "") },
              )}
          </div>
        </div>
      </>
    );
  };

  const reviewing =
    mode === "review" || mode === "preview" || mode === "rejected";
  return (
    <section
      ref={root}
      className="quality-panel"
      data-panel="quality"
      aria-label={t("title")}
      onKeyDown={onKeyDown}
    >
      {reviewing ? (
        mode === "review" ? (
          reviewPane()
        ) : mode === "preview" ? (
          previewPane()
        ) : (
          rejectedPane()
        )
      ) : (
        <>
          {commandBar()}
          {settingsOpen && !busy && settings()}
          {shown && mode === "results" && tools()}
          <div
            className="body"
            ref={bodyRef}
            onScroll={(event) => {
              if (
                !pendingScroll.current.pending &&
                event.currentTarget.clientHeight
              )
                retainedScroll.set(scrollKey, event.currentTarget.scrollTop);
            }}
          >
            {error && (
              <div className="guard" role="alert">
                {error}
              </div>
            )}
            {body()}
          </div>
          <div className="limits">
            <span>{t("limits")}</span>
          </div>
          {mode === "results" && footer()}
        </>
      )}
      <div className="sr" aria-live="polite">
        {announce}
      </div>
    </section>
  );
}

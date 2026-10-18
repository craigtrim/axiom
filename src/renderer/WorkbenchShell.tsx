// craigtrim/axiom#94: keep the utility title in sentence case.
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../shared/protocol";
import type { ChromeMenuItem } from "../shared/window-chrome";
import type { SuggestionRun } from "../shared/suggestions";
import { useAuditErrors } from "./audit-state";
import { command, onCommand, report, useNotice } from "./client";
import {
  useQualityApplying,
  useQualityStale,
  useQualityStatus,
} from "./quality-view";
import {
  connectQueryHistory,
  selectQuery,
  useQueryHistory,
} from "./query-history";
import { useSourceDraft } from "./source-draft";
import { ContextMenu } from "./ContextMenu";
import { chromeActions } from "./chrome-menu";
import { ChromeGlyph, type ChromeIcon } from "./ChromeGlyph";
import "./workbench-shell.css";

const panes = [
  { id: "hierarchy", label: "Hierarchy", icon: "hierarchy" },
  { id: "graph", label: "Graph", icon: "graph" },
  { id: "details", label: "Details", icon: "panel" },
  { id: "source", label: "Source", icon: "code" },
  { id: "individuals", label: "Individuals", icon: "grid" },
  { id: "find", label: "Find", icon: "find" },
  { id: "textanalysis", label: "Text Analysis", icon: "text" },
  { id: "taxonomy", label: "Suggestions", icon: "bulb" },
  { id: "quality", label: "Ontology Quality", icon: "shield" },
  { id: "query", label: "Query", icon: "terminal" },
] as const;
const otherPanes: Record<string, { label: string; icon: ChromeIcon }> = {
  errorlog: { label: "Error log", icon: "warn" },
  settings: { label: "Settings", icon: "gear" },
  inspector: { label: "Inspector", icon: "panel" },
  touchpoints: { label: "Touchpoints", icon: "find" },
  suggestionruns: { label: "Suggestion runs", icon: "bulb" },
  tabhistory: { label: "Tab history", icon: "panel" },
  sparsity: { label: "Sparsity", icon: "grid" },
  textentities: { label: "Add entity", icon: "text" },
  provenance: { label: "Filesystem provenance", icon: "text" },
  queryResults: { label: "Query results", icon: "grid" },
};
const paneInfo = (id: string) =>
  panes.find((pane) => pane.id === id) ??
  otherPanes[id] ?? { label: id, icon: "panel" as const };
const number = (n: number) => n.toLocaleString("en-US");

export function useWindowDocument() {
  const [info, setInfo] =
    useState<Awaited<ReturnType<typeof window.axiom.chrome.info>>>();
  useEffect(() => {
    let live = true;
    let receivedEvent = false;
    const off = window.axiom.onEvent(({ type, data }) => {
      if (type === "window-title") {
        receivedEvent = true;
        setInfo(data);
      }
    });
    void window.axiom.chrome
      .info()
      .then((value) => {
        if (live && !receivedEvent) setInfo(value);
      })
      .catch((error) => report(error.message, true));
    return () => {
      live = false;
      off();
    };
  }, []);
  return info;
}

export function useShellBadges(snapshot: Snapshot) {
  const errors = useAuditErrors();
  const quality = useQualityStatus();
  const [errorCount, setErrorCount] = useState(0);
  const [runs, setRuns] = useState<SuggestionRun[]>([]);
  useEffect(() => {
    let live = true;
    void window.axiom.audit
      .list()
      .then((entries) => {
        if (live) setErrorCount(entries.length);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [errors]);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void window.axiom.suggestions
        .history()
        .then((value) => {
          if (live) setRuns(value);
        })
        .catch(() => {});
    refresh();
    const off = onCommand((id) => {
      if (id === "suggestions.historyChanged") refresh();
    });
    return () => {
      live = false;
      off();
    };
  }, [snapshot.datasetEpoch]);
  const findings =
    quality?.report?.datasetEpoch === snapshot.datasetEpoch
      ? quality.report.findings.length
      : 0;
  return {
    taxonomy: runs
      .filter(
        (run) =>
          !run.draft &&
          run.state === "completed" &&
          run.namespace === snapshot.ontology.namespace,
      )
      .reduce(
        (total, run) =>
          total +
          run.values.filter((_, index) => !run.applied.includes(index)).length,
        0,
      ),
    quality: findings,
    errorlog: errorCount,
  };
}

export function PaneRail({
  active,
  open,
  badges,
}: {
  active: string;
  open: (id: string) => void;
  badges: ReturnType<typeof useShellBadges>;
}) {
  const [settings, setSettings] = useState<{
    items: ChromeMenuItem[];
    trigger: HTMLButtonElement;
    x: number;
    y: number;
  }>();
  const showSettings = async (trigger: HTMLButtonElement) => {
    try {
      const menus = await window.axiom.chrome.menus();
      const items = menus
        .find((item) => item.id === "menu.edit")
        ?.children?.find((item) => item.id === "menu.settings")?.children;
      if (!items || !trigger.isConnected) return;
      const box = trigger.getBoundingClientRect();
      setSettings({ items, trigger, x: box.right, y: box.top });
    } catch (error) {
      report((error as Error).message, true);
    }
  };
  const button = (
    pane: { id: string; label: string; icon: ChromeIcon },
    optional = false,
  ) => {
    const count = badges[pane.id as keyof typeof badges] ?? 0;
    return (
      <button
        type="button"
        key={pane.id}
        className={"ri" + (optional ? " optr" : "")}
        data-pane={pane.id}
        title={pane.label}
        aria-label={pane.label + (count ? `, ${number(count)} waiting` : "")}
        aria-current={
          (settings ? pane.id === "settings" : active === pane.id) || undefined
        }
        aria-haspopup={pane.id === "settings" ? "menu" : undefined}
        aria-expanded={pane.id === "settings" ? !!settings : undefined}
        onClick={(event) =>
          pane.id === "settings"
            ? settings
              ? setSettings(undefined)
              : void showSettings(event.currentTarget)
            : open(pane.id)
        }
      >
        <ChromeGlyph name={pane.icon} />
        {count > 0 && (
          <span
            aria-hidden="true"
            className={"badge" + (pane.id === "quality" ? " warn" : "")}
          >
            {count > 999 ? "999+" : count}
          </span>
        )}
      </button>
    );
  };
  return (
    <>
      <nav className="shell-surface rail" aria-label="Panes">
        <div className="railgroup">{panes.map((pane) => button(pane))}</div>
        <div className="railgroup bottom">
          {button({ id: "errorlog", ...otherPanes.errorlog }, true)}
          {button({ id: "settings", ...otherPanes.settings })}
        </div>
      </nav>
      {settings && (
        <ContextMenu
          document={document}
          appearance="chrome"
          label="Settings"
          actions={chromeActions(settings.items)}
          x={settings.x}
          y={settings.y}
          trigger={settings.trigger}
          initialFocus="first"
          close={() => setSettings(undefined)}
        />
      )}
    </>
  );
}

export function DocumentTabs({
  snapshot,
  active,
  sourceOpen,
  queryOpen,
  labelPanel,
  open,
}: {
  snapshot: Snapshot;
  active: string;
  sourceOpen: boolean;
  queryOpen: boolean;
  labelPanel: (id: string) => void;
  open: (id: string) => void;
}) {
  const info = useWindowDocument();
  const queries = useQueryHistory();
  const sourceDraft = useSourceDraft();
  const [queryIds, setQueryIds] = useState<string[]>([]);
  useEffect(() => setQueryIds([]), [snapshot.datasetEpoch]);
  const lastWorkspacePane = useRef("graph");
  const root = useRef<HTMLDivElement>(null);
  if (!["source", "query"].includes(active)) lastWorkspacePane.current = active;
  useEffect(() => {
    if (queryOpen)
      void connectQueryHistory().catch((error) => report(error.message, true));
  }, [queryOpen]);
  const queryId = queries.view?.activeId;
  useEffect(() => {
    if (queryOpen && queryId)
      setQueryIds((ids) => (ids.includes(queryId) ? ids : [...ids, queryId]));
  }, [queryOpen, queryId]);
  const tabs = [
    {
      id: "workspace",
      label: info?.fileName ?? snapshot.ontology.name,
      dirty: info?.dirty ?? snapshot.dirty,
      open: () => open(lastWorkspacePane.current),
    },
    ...(sourceOpen
      ? [
          {
            id: "source",
            label:
              snapshot.ontology.source?.fileName.split(/[\\/]/).pop() ??
              "Ontology source",
            dirty: !!sourceDraft,
            open: () => open("source"),
          },
        ]
      : []),
    ...(queryOpen
      ? queryIds.flatMap((id) => {
          const entry = queries.view?.entries.find((entry) => entry.id === id);
          return entry
            ? [
                {
                  id: "query:" + id,
                  label: entry.title,
                  dirty: queries.saving && queryId === id,
                  open: () => {
                    void selectQuery(id)
                      .then(() => open("query"))
                      .catch((error) => report(error.message, true));
                  },
                },
              ]
            : [];
        })
      : []),
  ];
  const selected =
    active === "source" && sourceOpen
      ? "source"
      : active === "query" && queryId
        ? "query:" + queryId
        : "workspace";
  const current = tabs.some((tab) => tab.id === selected)
    ? selected
    : "workspace";
  // Issue 87: assistive technology identifies the panel by its selected tab.
  useEffect(
    () => labelPanel("document-tab-" + encodeURIComponent(current)),
    [current, labelPanel],
  );
  const activate = (index: number, keyboard = false) => {
    tabs[index].open();
    if (keyboard)
      root.current
        ?.querySelectorAll<HTMLButtonElement>(".tab")
        [index]?.focus({ preventScroll: true });
    root.current
      ?.querySelectorAll<HTMLButtonElement>(".tab")
      [index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div
      className="shell-surface tabs"
      role="tablist"
      aria-label="Open documents"
      ref={root}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const at = tabs.findIndex((tab) => tab.id === current);
        activate(
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                tabs.length,
          true,
        );
      }}
    >
      {tabs.map((tab, index) => (
        <button
          type="button"
          className="tab"
          role="tab"
          key={tab.id}
          id={"document-tab-" + encodeURIComponent(tab.id)}
          data-document-id={tab.id}
          aria-controls="workbench-document"
          aria-selected={tab.id === current}
          tabIndex={tab.id === current ? 0 : -1}
          title={tab.label}
          onClick={() => activate(index)}
        >
          <span className="lab">{tab.label + (tab.dirty ? " *" : "")}</span>
        </button>
      ))}
    </div>
  );
}

export function WorkbenchStatus({
  snapshot,
  active,
}: {
  snapshot: Snapshot;
  active: string;
}) {
  const pane = paneInfo(active);
  const info = useWindowDocument();
  const quality = useQualityStatus();
  const staleSettings = useQualityStale();
  const applying = useQualityApplying();
  const notice = useNotice();
  const result =
    quality?.report?.datasetEpoch === snapshot.datasetEpoch
      ? quality.report
      : undefined;
  const correctionInFlight =
    applying?.id === quality?.id &&
    applying?.report?.datasetEpoch === snapshot.datasetEpoch &&
    snapshot.version === (applying?.report?.version ?? -2) + 1;
  const stale =
    !!result &&
    (staleSettings ||
      (result.version !== snapshot.version && !correctionInFlight));
  const dirty = info?.dirty ?? snapshot.dirty;
  return (
    <footer
      className="shell-surface statusbar"
      role="contentinfo"
      aria-label="Workbench status"
    >
      <span className="si">
        <ChromeGlyph name={pane.icon} />
        <span>{pane.label}</span>
      </span>
      <span className="si opt">
        <span className="num">{number(snapshot.classCount)}</span> classes
      </span>
      <span className="si opt">
        <span className="num">{number(snapshot.individualCount)}</span>{" "}
        individuals
      </span>
      <span className="si opt">
        revision <span className="num">{number(snapshot.version)}</span>
      </span>
      {stale ? (
        <button
          type="button"
          className="si warnink"
          onClick={() => command("view.quality")}
        >
          <ChromeGlyph name="warn" />
          <span>Quality scan out of date</span>
        </button>
      ) : result && quality?.state === "complete" ? (
        <span className="si okink">
          <ChromeGlyph name="shield" />
          <span>Scan current</span>
        </span>
      ) : null}
      {quality?.state === "running" && (
        <button
          type="button"
          className="si"
          onClick={() => command("view.quality")}
        >
          <ChromeGlyph name="shield" />
          <span>Scanning…</span>
        </button>
      )}
      {quality?.state === "failed" && (
        <button
          type="button"
          className="si warnink"
          onClick={() => command("view.quality")}
        >
          <ChromeGlyph name="warn" />
          <span>Quality scan failed</span>
        </button>
      )}
      <span className={"si" + (dirty ? " warnink" : "")}>
        <ChromeGlyph name="save" />
        <span>{dirty ? "Unsaved changes" : "Saved"}</span>
      </span>
      {notice.error && (
        <button
          type="button"
          className="si warnink status-error"
          title={notice.text}
          onClick={() => command("view.errorlog")}
        >
          <ChromeGlyph name="warn" />
          <span>{notice.text}</span>
        </button>
      )}
      <span
        className="shell-announcement status-message"
        role={notice.error ? "alert" : "status"}
      >
        {notice.text}
      </span>
    </footer>
  );
}

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { THING } from "../domain/model";
import { namedClass } from "../domain/class-expressions";
import { taxonomyRows } from "../domain/taxonomy-rows";
import { displayName } from "../domain/rdf-model";
import {
  groupSparsityRows,
  pageSparsityGroups,
  sparsityRowKey,
  type SparsityReport,
  type SparsityGroup,
  type SparsityRow,
} from "../shared/sparsity";
import { request, useSnapshot } from "./client";
import {
  computeSparsity,
  takeSparsityNotice,
  updateSparsity,
  useSparsityOptions,
} from "./sparsity-view";
import { editEntity } from "./authoring";
import { revealInTaxonomy } from "./taxonomy-navigation";
import { registerPaneRecovery } from "./AdaptivePane";
import {
  SharedMenu,
  SharedPane,
  usePaneToast,
  type SharedMenuItem,
} from "./SharedPane";
import { useActionOverflow } from "./useActionOverflow";
import { NumberField } from "./NumberField";
import "./sparsity-reference.css";

// craigtrim/axiom#90: retain the report across docking; saved inputs reconstruct it after restart.
type Result = {
  key: string;
  iri: string;
  epoch: number;
  data?: SparsityReport;
  error?: string;
};
let retained: Result | undefined;
const count = (n: number) => n.toLocaleString("en-US");
const decimal = (n: number) => String(Math.round(n * 100) / 100);
const plural = (n: number, singular: string) =>
  `${count(n)} ${singular}${n === 1 ? "" : "s"}`;
registerPaneRecovery("sparsity", {
  Body: ({ maximize }) => (
    <div className="sparsity-recovery">
      <div className="id">Sparsity</div>
      <div className="why">
        Too little room to read a ranking. The report and its settings are
        retained.
      </div>
      <div>{maximize}</div>
    </div>
  ),
});

export function SparsityPanel() {
  return (
    <section
      className="panel shared-layer sparsity-panel"
      data-panel="sparsity"
      aria-label="Sparsity analysis"
    >
      <SharedPane className="footed sparsity-surface">
        <SparsityContent />
      </SharedPane>
    </section>
  );
}
function SparsityContent() {
  const snapshot = useSnapshot()!,
    options = useSparsityOptions(),
    notify = usePaneToast();
  const [result, setResult] = useState<Result | undefined>(retained),
    [actionError, setActionError] = useState("");
  const bar = useRef<HTMLDivElement>(null),
    more = useRef<HTMLButtonElement>(null),
    filter = useRef<HTMLInputElement>(null);
  const [filterFocused, setFilterFocused] = useState(false),
    [forceFilter, setForceFilter] = useState(false);
  const classes = useMemo(
    () => snapshot.entities.filter(namedClass),
    [snapshot.entities],
  );
  const scopeEntity = classes.find((e) => e.iri === options.iri);
  const validScope =
    options.namespace === snapshot.ontology.namespace && !!scopeEntity;
  useEffect(() => {
    if (!validScope)
      updateSparsity({
        iri: THING,
        namespace: snapshot.ontology.namespace,
        report: false,
        selected: "",
        page: 0,
        open: [],
      });
  }, [validScope, snapshot.ontology.namespace]);
  const wanted = validScope && options.report;
  const key = JSON.stringify([
    snapshot.datasetEpoch,
    snapshot.version,
    options.iri,
    options.descendantWeight,
    options.request,
  ]);
  const data =
    wanted &&
    result?.epoch === snapshot.datasetEpoch &&
    result.iri === options.iri
      ? result.data
      : undefined;
  const busy = wanted && result?.key !== key;
  useEffect(() => {
    if (!wanted || result?.key === key) return;
    let active = true;
    void request<SparsityReport>("analyzeSparsity", {
      iri: options.iri,
      descendantWeight: options.descendantWeight,
    })
      .then((data) => {
        if (!active) return;
        retained = {
          key,
          iri: options.iri,
          epoch: snapshot.datasetEpoch,
          data,
        };
        setResult(retained);
        const notice = takeSparsityNotice(options.request);
        if (notice)
          notify(
            notice.first
              ? `Measured ${plural(data.rows.length, "candidate")}.`
              : "Recomputed.",
            `${plural(data.groups, "sibling group")} compared, nothing in the ontology was changed.`,
          );
      })
      .catch((error) => {
        if (!active) return;
        takeSparsityNotice(options.request);
        retained = {
          key,
          iri: options.iri,
          epoch: snapshot.datasetEpoch,
          data,
          error: error.message,
        };
        setResult(retained);
      });
    return () => {
      active = false;
    };
  }, [key, wanted]);
  const groups = useMemo(
    () => groupSparsityRows(data?.rows ?? [], options),
    [data, options.minimumScore, options.includeLeaves, options.text],
  );
  const paging = useMemo(
    () => pageSparsityGroups(groups, options.open, options.page),
    [groups, options.open, options.page],
  );
  const selected = data?.rows.find(
    (row) => sparsityRowKey(row) === options.selected,
  );
  useEffect(() => {
    if (!data || busy) return;
    if (options.page !== paging.page || (options.selected && !selected))
      updateSparsity({
        page: paging.page,
        ...(!selected ? { selected: "" } : {}),
      });
  }, [data, busy, paging.page, options.page, options.selected, selected]);
  const tops = useMemo(
    () =>
      taxonomyRows(classes, new Set([THING]))
        .filter((row) => row.iri !== THING && row.depth <= 1)
        .map((row) => classes.find((e) => e.iri === row.iri)!),
    [classes],
  );
  const scopes = [
    ...(!tops.some((e) => e.iri === options.iri) &&
    scopeEntity &&
    options.iri !== THING
      ? [scopeEntity]
      : []),
    ...tops,
  ];
  const pinned = filterFocused || forceFilter || !!options.text;
  const hidden = useActionOverflow(
    bar,
    more,
    [
      { id: "hierarchy", priority: 3 },
      { id: "details", priority: 2 },
      { id: pinned ? "state" : "filter", priority: 1 },
    ],
    "shared",
  );
  useLayoutEffect(() => {
    if (forceFilter) {
      filter.current?.focus();
      setForceFilter(false);
    }
  }, [forceFilter]);
  const navigate = (details = false) => {
    if (!selected) return;
    setActionError("");
    void request("select", { iri: selected.iri })
      .then(() => {
        if (details) editEntity(selected.iri);
        else revealInTaxonomy(selected.iri);
      })
      .catch((error) => setActionError(error.message));
  };
  const run = () => {
    setActionError("");
    computeSparsity({
      iri: validScope ? options.iri : THING,
      namespace: snapshot.ontology.namespace,
    });
  };
  const highest =
    data?.rows.reduce((max, row) => Math.max(max, row.score), 0) ?? 0;
  const stateText = busy
    ? "Analyzing hierarchy…"
    : data
      ? `${count(data.rows.length)} measured, highest ${highest}`
      : "Not computed yet";
  const slot = (id: string, children: ReactNode) => (
    <div
      className="shared-command"
      data-shared-command={id}
      data-overflowed={hidden.has(id)}
      inert={hidden.has(id)}
      aria-hidden={hidden.has(id) || undefined}
    >
      {children}
    </div>
  );
  const menu: SharedMenuItem[] = [];
  if (hidden.has("hierarchy"))
    menu.push({
      id: "hierarchy",
      label: "Show in Hierarchy",
      disabled: !selected,
      run: () => navigate(),
    });
  if (hidden.has("details"))
    menu.push({
      id: "details",
      label: "Open in Details",
      disabled: !selected,
      run: () => navigate(true),
    });
  if (!pinned && hidden.has("filter"))
    menu.push({
      id: "filter",
      label: "Filter classes",
      disabled: !data,
      run: () => setForceFilter(true),
    });
  if (menu.length) menu.push({ id: "overflow-separator", separator: true });
  menu.push(
    {
      id: "expand",
      label: "Expand every group",
      disabled: !data,
      run: () =>
        updateSparsity({
          open: [...new Set(data!.rows.map((row) => row.parent))],
          page: 0,
        }),
    },
    {
      id: "collapse",
      label: "Collapse every group",
      disabled: !data,
      run: () => updateSparsity({ open: [], page: 0 }),
    },
    { id: "settings-separator", separator: true },
    {
      id: "settings",
      label: "Change settings",
      disabled: !data,
      run: () => updateSparsity({ report: false, selected: "" }),
    },
  );
  const toggle = (parent: string) =>
    updateSparsity({
      open: options.open.includes(parent)
        ? options.open.filter((p) => p !== parent)
        : [...options.open, parent],
    });
  const error =
    actionError || (wanted && result?.key === key ? result.error : undefined);
  return (
    <>
      <div ref={bar} className="bar" role="group" aria-label="Sparsity actions">
        <button
          className="btn primary"
          data-fixed-action
          disabled={busy}
          onClick={run}
        >
          {data ? "Recompute" : "Compute"}
        </button>
        <span
          className={
            "state" +
            (highest >= 60 ? " warnink" : "") +
            (pinned ? " shared-command" : "")
          }
          title={stateText}
          data-fixed-action={!pinned ? "" : undefined}
          data-shared-command={pinned ? "state" : undefined}
          data-overflowed={pinned && hidden.has("state")}
          aria-hidden={(pinned && hidden.has("state")) || undefined}
        >
          <span data-natural-width>
            {busy ? (
              "Analyzing hierarchy…"
            ) : data ? (
              <>
                <span className="num">{count(data.rows.length)}</span>
                {` measured, highest ${highest}`}
              </>
            ) : (
              "Not computed yet"
            )}
          </span>
        </span>
        <span className="od-fill" />
        <div
          className="shared-command"
          data-fixed-action={pinned ? "" : undefined}
          data-shared-command={!pinned ? "filter" : undefined}
          data-overflowed={!pinned && hidden.has("filter")}
          inert={!pinned && hidden.has("filter")}
          aria-hidden={(!pinned && hidden.has("filter")) || undefined}
        >
          <input
            ref={filter}
            className="fld"
            size={13}
            placeholder="Filter classes"
            aria-label="Filter classes"
            disabled={!data}
            value={options.text}
            onChange={(e) => updateSparsity({ text: e.target.value, page: 0 })}
            onFocus={() => setFilterFocused(true)}
            onBlur={() => setFilterFocused(false)}
          />
        </div>
        {slot(
          "hierarchy",
          <button
            className="btn quiet"
            disabled={!selected}
            onClick={() => navigate()}
          >
            Show in Hierarchy
          </button>,
        )}
        {slot(
          "details",
          <button
            className="btn quiet"
            disabled={!selected}
            onClick={() => navigate(true)}
          >
            Open in Details
          </button>,
        )}
        <SharedMenu trigger={more} items={menu} />
      </div>
      <div className="body">
        <div className="stack">
          <div className="sparsity-head" hidden={!!data}>
            {error && (
              <p className="problem" role="alert">
                {error}
              </p>
            )}
            <div className="setup" role="group" aria-label="Sparsity settings">
              <div className="srow">
                <span className="lbl">Scope</span>
                <div className="rail">
                  <select
                    className="sel"
                    aria-label="Scope"
                    value={validScope ? options.iri : THING}
                    onChange={(e) =>
                      updateSparsity({
                        iri: e.target.value,
                        namespace: snapshot.ontology.namespace,
                      })
                    }
                  >
                    <option value={THING}>Whole taxonomy</option>
                    {scopes.map((e) => (
                      <option key={e.iri} value={e.iri}>
                        {displayName(e)} branch
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    Analyze selected changes this from Hierarchy
                  </span>
                </div>
              </div>
              <div className="srow">
                <span className="lbl">Descendant influence</span>
                <div className="rail">
                  {[0, 10, 20, 30, 40].map((weight) => (
                    <button
                      key={weight}
                      className="chip"
                      aria-pressed={options.descendantWeight === weight}
                      onClick={() =>
                        updateSparsity({ descendantWeight: weight })
                      }
                    >
                      {`${weight} percent`}
                    </button>
                  ))}
                  <span className="hint">direct children take the rest</span>
                </div>
              </div>
              <div className="srow">
                <span className="lbl">Minimum score</span>
                <div className="rail">
                  <NumberField
                    className="fld"
                    size={3}
                    aria-label="Minimum score"
                    value={options.minimumScore}
                    change={(minimumScore) => updateSparsity({ minimumScore })}
                    min={0}
                    max={100}
                    integer
                  />
                  <span className="hint">0 to 100, published default 25</span>
                </div>
              </div>
              <div className="srow">
                <span className="lbl">Leaf candidates</span>
                <div className="rail">
                  <button
                    className="sw"
                    role="switch"
                    aria-checked={options.includeLeaves}
                    onClick={() =>
                      updateSparsity({ includeLeaves: !options.includeLeaves })
                    }
                  >
                    <span className="track">
                      <span className="knob" />
                    </span>
                    Include classes with no children
                  </button>
                  <span className="hint">
                    a leaf beside a developed sibling scores high and is often
                    correct
                  </span>
                </div>
              </div>
              <div className="actline">
                <button className="btn primary" disabled={busy} onClick={run}>
                  Compute sparsity
                </button>
                <span className="state">
                  <span className="num">
                    {count(classes.filter((e) => e.iri !== THING).length)}
                  </span>
                  {` named ${classes.filter((e) => e.iri !== THING).length === 1 ? "class" : "classes"} in the store`}
                </span>
              </div>
            </div>
            <div className="limits">
              <b>This is a relative review measure.</b> It compares siblings
              under the same parent. It cannot tell you whether an ontology
              needs more concepts, or whether two subjects deserve equal detail,
              and it infers nothing. A small peer group or one unusually large
              sibling will move a score, so the peer count and the mean are on
              every finding.
            </div>
          </div>
          <div className="rows" role="region" aria-label="Sparsity findings">
            {data && error && (
              <p className="problem" role="alert">
                {error}
              </p>
            )}
            {data && !groups.length && (
              <div className="empty">
                <b>No finding clears the current report settings.</b>
                {` ${plural(data.rows.length, "candidate")} ${data.rows.length === 1 ? "was" : "were"} measured in ${plural(data.groups, "sibling group")}. Lower the minimum score, or include leaf candidates, to see the rest. A score of zero means evenly developed, which is a result and not the absence of one.`}
              </div>
            )}
            {data &&
              paging.entries.map(({ group, row }) =>
                row ? (
                  <Fragment key={sparsityRowKey(row)}>
                    <button
                      className="fin"
                      data-row={sparsityRowKey(row)}
                      aria-pressed={options.selected === sparsityRowKey(row)}
                      onClick={() =>
                        updateSparsity({
                          selected:
                            options.selected === sparsityRowKey(row)
                              ? ""
                              : sparsityRowKey(row),
                        })
                      }
                    >
                      <span className="nm">
                        {row.name + (row.children === 0 ? " (leaf)" : "")}
                      </span>
                      <span
                        className={"meter" + (row.score >= 60 ? " hot" : "")}
                        aria-hidden="true"
                      >
                        <i style={{ width: row.score + "%" }} />
                      </span>
                      <span className="sc">{`${row.score} of 100`}</span>
                      <span className="ct">
                        {`${row.children} direct of ${decimal(row.peerChildren)} peer mean`}
                      </span>
                    </button>
                    {options.selected === sparsityRowKey(row) && (
                      <Baseline
                        group={group}
                        row={row}
                        influence={options.descendantWeight}
                      />
                    )}
                  </Fragment>
                ) : (
                  <button
                    key={group.parent}
                    className="band"
                    data-band={group.parent}
                    aria-expanded={options.open.includes(group.parent)}
                    onClick={() => toggle(group.parent)}
                  >
                    <span className="caret" aria-hidden="true">
                      {options.open.includes(group.parent) ? "v" : ">"}
                    </span>
                    <span>{`children of ${group.name}`}</span>
                    <span className="bn">
                      {`${count(group.rows.length)} of ${count(group.all.length)} listed, peer mean ${decimal(group.mean)} direct`}
                    </span>
                  </button>
                ),
              )}
          </div>
        </div>
      </div>
      <div className="foot">
        {!data ? (
          <span>Settings are kept with the workspace</span>
        ) : (
          <>
            <span>
              Page <span className="num">{paging.page + 1}</span> of{" "}
              <span className="num">{paging.pages}</span>
            </span>
            <span className="pager">
              <button
                className="btn quiet"
                disabled={paging.page === 0}
                onClick={() => updateSparsity({ page: paging.page - 1 })}
              >
                Previous
              </button>
              <button
                className="btn quiet"
                disabled={paging.page >= paging.pages - 1}
                onClick={() => updateSparsity({ page: paging.page + 1 })}
              >
                Next
              </button>
            </span>
            <span>
              <span className="num">{count(data.compared)}</span> compared
            </span>
            {data.unpaired > 0 && (
              <span className="tag inf">
                <span className="gl" />
                {/* #165: shape each complete flex label as one text node. */}
                {`${count(data.unpaired)} unscored, no sibling baseline`}
              </span>
            )}
            {data.excluded > 0 && (
              <span className="tag wrn">
                <span className="gl" />
                {`${count(data.excluded)} excluded, in a cycle`}
              </span>
            )}
            <span>no RDF was changed</span>
          </>
        )}
      </div>
    </>
  );
}
function Baseline({
  group,
  row,
  influence,
}: {
  group: SparsityGroup;
  row: SparsityRow;
  influence: number;
}) {
  const maximum = group.all.reduce(
    (max, item) => Math.max(max, item.children),
    1,
  );
  return (
    <div
      className="sibs"
      role="region"
      aria-label={`Sibling baseline for ${row.name}`}
    >
      <div className="hd">
        {`Measured against the other children of ${group.name}, with ${row.name} excluded from its own baseline`}
      </div>
      {group.all.map((item) => (
        <div
          key={item.iri}
          className={"sib" + (item.iri === row.iri ? " me" : "")}
        >
          <span className="sn">{item.name}</span>
          <span className="bars">
            <i
              style={{
                width: Math.round((item.children / maximum) * 100) + "%",
              }}
            />
          </span>
          <span className="sv">
            {`${item.children} direct, ${decimal(item.discounted)} nearby`}
          </span>
        </div>
      ))}
      <div className="mean">
        {`Peer mean ${decimal(row.peerChildren)} direct over ${plural(row.peers, "peer")}, ${decimal(row.peerDiscounted)} discounted descendants. ` +
          (row.peerDiscounted > 0
            ? `Weighting ${100 - influence} direct to ${influence} descendants.`
            : "The deeper peer mean is zero, so direct children carry the whole weight.")}
      </div>
    </div>
  );
}

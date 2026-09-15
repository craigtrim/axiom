import { PaneToolbar } from "./AdaptivePane";
import { EditableEntityName } from "./InlineRename";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type IDatasource,
  type GridApi,
} from "ag-grid-community";
import {
  useSnapshot,
  act,
  request,
  command,
  panel,
  savePanel,
  report,
  onCommand,
} from "./client";
import {
  branches,
  defaultFilter,
  humanise,
  local,
  type Individual,
  type Entity,
  type TableFilter,
} from "../domain/model";
import { validatePrice } from "../domain/store";
import type { TablePage } from "../shared/protocol";
ModuleRegistry.registerModules([AllCommunityModule]);
export function gridTheme(dark: boolean) {
  return themeQuartz.withParams({
    backgroundColor: dark ? "#252526" : "#ffffff",
    foregroundColor: dark ? "#ededed" : "#202020",
    headerBackgroundColor: dark ? "#2d2d30" : "#f2f2f2",
    borderColor: dark ? "#3e3e42" : "#ddd",
    accentColor: dark ? "#6cb8f6" : "#0f6cbd",
    rowHoverColor: "var(--item-hover)",
    fontFamily: "Segoe UI, sans-serif",
    fontSize: 13,
    rowHeight: 30,
    headerHeight: 32,
    wrapperBorder: false,
  });
}
type Row = Individual & { customerName: string };
export function IndividualsPanel() {
  const s = useSnapshot()!;
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (!s.ontology.example) setNamed(false);
  }, [s.datasetEpoch]);
  if (!s.ontology.example) return <OntologyIndividualsPanel />;
  return (
    <div className="individuals-mode">
      <div className="panel-toolbar">
        <label>
          Records{" "}
          <select
            aria-label="Individual records"
            value={named ? "named" : "orders"}
            onChange={(e) => setNamed(e.target.value === "named")}
          >
            <option value="orders">Example orders</option>
            <option value="named">Named ontology individuals</option>
          </select>
        </label>
      </div>
      {named ? <OntologyIndividualsPanel /> : <ExampleIndividualsPanel />}
    </div>
  );
}
function ExampleIndividualsPanel() {
  const s = useSnapshot()!,
    epoch = useRef(s.datasetEpoch),
    [filter, setFilter] = useState<TableFilter>(
      panel("table.filter", { ...defaultFilter }),
    ),
    [total, setTotal] = useState(s.orderCount),
    [paged, setPaged] = useState(panel("table.accessible", false)),
    api = useRef<GridApi<Row> | null>(null);
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "ui.restore:table.filter")
          setFilter(panel("table.filter", { ...defaultFilter }));
      }),
    [],
  );
  const dark = document.documentElement.dataset.theme === "dark";
  const update = (f: TableFilter) => {
    setFilter(f);
    savePanel("table.filter", f);
  };
  const datasource = useMemo<IDatasource>(() => {
    let alive = true;
    return {
      getRows: (p) => {
        const sort = p.sortModel[0],
          f = {
            ...filter,
            ...(sort
              ? {
                  sort: sort.colId,
                  direction: sort.sort === "asc" ? 1 : -1,
                }
              : {}),
          };
        void request<TablePage>("table", {
          filter: f,
          start: p.startRow,
          end: Math.min(p.endRow, p.startRow + 1000),
        })
          .then((r) => {
            if (alive) {
              setTotal(r.total);
              p.successCallback(r.rows, r.total);
            }
          })
          .catch((e) => {
            if (alive) {
              p.failCallback();
              report(e.message, true);
            }
          });
      },
      destroy: () => {
        alive = false;
      },
    };
  }, [filter, s.version]);
  useEffect(() => {
    api.current?.forEachNode((n) => n.setSelected(n.data?.iri === s.selected));
  }, [s.selected]);
  useEffect(() => {
    if (epoch.current !== s.datasetEpoch) {
      epoch.current = s.datasetEpoch;
      update({ ...defaultFilter });
      api.current?.ensureIndexVisible(0);
    }
  }, [s.datasetEpoch]);
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      {
        colId: "iri",
        field: "iri",
        headerName: "Individual",
        minWidth: 180,
        flex: 1.1,
        valueFormatter: (p) => local(p.value ?? ""),
        cellClass: "individual-cell",
      },
      {
        colId: "type",
        field: "type",
        headerName: "Type",
        minWidth: 140,
        flex: 0.9,
        valueFormatter: (p) => humanise(local(p.value ?? "")),
      },
      {
        colId: "ref",
        field: "reference",
        headerName: "Order ref",
        width: 115,
        cellClass: "mono",
      },
      {
        colId: "branch",
        field: "branch",
        headerName: "Branch",
        width: 130,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: branches },
      },
      {
        colId: "price",
        field: "price",
        headerName: "Price",
        width: 95,
        editable: true,
        cellEditor: "agTextCellEditor",
        cellEditorParams: {
          getValidationErrors: ({ value }: { value: unknown }) => {
            try {
              validatePrice(String(value));
              return null;
            } catch (e) {
              return [(e as Error).message];
            }
          },
        },
        valueFormatter: (p) => "£" + Number(p.value ?? 0).toFixed(2),
        cellClass: "mono numeric",
      },
      {
        colId: "rating",
        field: "rating",
        headerName: "Rating",
        width: 90,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: [1, 2, 3, 4, 5] },
        valueFormatter: (p) => p.value + " / 5",
        cellClass: "mono",
      },
      {
        colId: "ts",
        field: "timestamp",
        headerName: "Prepared",
        width: 145,
        valueFormatter: (p) =>
          p.value
            ? new Date(p.value).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })
            : "",
      },
      {
        colId: "cust",
        field: "customerName",
        headerName: "Customer",
        minWidth: 160,
        flex: 1,
      },
    ],
    [],
  );
  return (
    <section
      className="panel table-panel"
      data-panel="individuals"
      aria-label="Individuals panel"
    >
      <PaneToolbar
        label="Individual actions and filters"
        secondary={
          <>
            <select
              aria-label="Filter by pizza type"
              value={filter.type}
              onChange={(e) => update({ ...filter, type: e.target.value })}
            >
              <option value="">All types</option>
              {s.types.map((t) => (
                <option key={t} value={t}>
                  {humanise(local(t))}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by branch"
              value={filter.branch}
              onChange={(e) => update({ ...filter, branch: e.target.value })}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>

            <button
              onClick={() =>
                update({ ...filter, type: "", branch: "", query: "" })
              }
            >
              Reset
            </button>
            <button
              onClick={() => {
                void act("tableGraph", { filter }).then(() =>
                  command("graph.fit"),
                );
                command("view.graph");
              }}
            >
              Send page to graph
            </button>
          </>
        }
      >
        <input
          aria-label="Filter individuals"
          placeholder="Filter individuals"
          value={filter.query}
          onChange={(e) => update({ ...filter, query: e.target.value })}
        />
        <button onClick={() => command("entity.createIndividual")}>
          New individual
        </button>
      </PaneToolbar>
      <div className="table-summary">
        <span>
          {total.toLocaleString("en-GB")} rows /{" "}
          {s.orderCount.toLocaleString("en-GB")} individuals
        </span>
        <label>
          <input
            type="checkbox"
            checked={paged}
            onChange={(e) => {
              setPaged(e.target.checked);
              savePanel("table.accessible", e.target.checked);
            }}
          />{" "}
          Accessible pages
        </label>
      </div>
      <div className="grid-host">
        <AgGridReact<Row>
          theme={gridTheme(dark)}
          columnDefs={columns}
          defaultColDef={{
            sortable: true,
            resizable: true,
            suppressMovable: false,
          }}
          rowModelType="infinite"
          cacheBlockSize={100}
          maxBlocksInCache={8}
          datasource={datasource}
          getRowId={(p) => p.data.iri}
          rowSelection={{
            mode: "singleRow",
            checkboxes: false,
            enableClickSelection: true,
          }}
          overlayNoRowsTemplate="<div>No individuals match. Loosen the filters or press Reset.</div>"
          animateRows={false}
          ensureDomOrder={true}
          suppressColumnVirtualisation={paged}
          suppressRowVirtualisation={paged}
          pagination={paged}
          paginationPageSize={100}
          paginationPageSizeSelector={[50, 100, 200]}
          singleClickEdit={true}
          readOnlyEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onGridReady={(e) => {
            api.current = e.api;
          }}
          onFirstDataRendered={(e) => {
            const index = panel("table.scroll", 0);
            if (index < total) e.api.ensureIndexVisible(index);
          }}
          onModelUpdated={(e) =>
            e.api.forEachNode((n) => n.setSelected(n.data?.iri === s.selected))
          }
          onBodyScrollEnd={() => {
            if (api.current)
              savePanel(
                "table.scroll",
                api.current.getFirstDisplayedRowIndex(),
              );
          }}
          onSortChanged={(e) => {
            const c = e.api.getColumnState().find((c) => c.sort);
            if (
              c &&
              (c.colId !== filter.sort ||
                (c.sort === "asc" ? 1 : -1) !== filter.direction)
            )
              update({
                ...filter,
                sort: c.colId,
                direction: c.sort === "asc" ? 1 : -1,
              });
          }}
          onRowClicked={(e) => {
            if (e.data) void act("select", { iri: e.data.iri });
          }}
          onCellDoubleClicked={(e) => {
            if (
              e.data &&
              !["branch", "price", "rating"].includes(e.column.getColId())
            ) {
              void act("seed", { iris: [e.data.iri] }).then(() =>
                command("graph.fit"),
              );
              command("view.graph");
            }
          }}
          onCellEditRequest={(e) => {
            if (e.data)
              void act("editCell", {
                iri: e.data.iri,
                column: e.column.getColId(),
                value: String(e.newValue),
              });
          }}
          onCellFocused={(e) => {
            if (e.rowIndex !== null) {
              const r = e.api.getDisplayedRowAtIndex(e.rowIndex)?.data;
              if (r) void act("select", { iri: r.iri });
            }
          }}
        />
      </div>
    </section>
  );
}

function OntologyIndividualsPanel() {
  const s = useSnapshot()!,
    [query, setQuery] = useState(""),
    api = useRef<GridApi<Entity> | null>(null);
  const rows = useMemo(
    () =>
      s.entities.filter(
        (e) =>
          e.kind === "Individual" &&
          (
            e.name +
            " " +
            e.iri +
            " " +
            e.types
              .map((t) => s.entities.find((x) => x.iri === t)?.name ?? t)
              .join(" ")
          )
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [s.entities, query],
  );
  const columns = useMemo<ColDef<Entity>[]>(
    () => [
      {
        headerName: "Individual",
        field: "name",
        flex: 1,
        suppressKeyboardEvent: (p) =>
          !!(p.event.target as HTMLElement).closest("[data-inline-rename]"),
        cellRenderer: ({ data }: { data: Entity }) => (
          <EditableEntityName iri={data.iri} name={data.name}>
            <button
              className="entity-link"
              onClick={() => void act("select", { iri: data.iri })}
            >
              {data.name}
            </button>
          </EditableEntityName>
        ),
      },
      {
        headerName: "Class",
        flex: 1,
        valueGetter: (p) =>
          p.data?.types
            .map((t) => s.entities.find((e) => e.iri === t)?.name ?? local(t))
            .join(", "),
      },
      { headerName: "IRI", field: "iri", flex: 2 },
    ],
    [s.entities],
  );
  useEffect(
    () =>
      api.current?.forEachNode((n) =>
        n.setSelected(n.data?.iri === s.selected),
      ),
    [s.selected, rows],
  );
  return (
    <section
      className="panel"
      data-panel="individuals"
      aria-label="Individuals panel"
    >
      <PaneToolbar
        label="Individual actions"
        secondary={
          <>
            <button onClick={() => setQuery("")}>Reset</button>

            <button
              disabled={!rows.length}
              onClick={() => {
                void act("seed", {
                  iris: rows.slice(0, s.graph.budget).map((e) => e.iri),
                  expand: false,
                }).then(() => command("graph.fit"));
                command("view.graph");
              }}
            >
              Send to graph
            </button>
          </>
        }
      >
        <input
          aria-label="Filter individuals"
          placeholder="Filter individuals"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={() => command("entity.createIndividual")}>
          New individual
        </button>
      </PaneToolbar>
      <div className="table-summary">
        {rows.length} rows / {s.individualCount} individuals
      </div>
      <div className="grid-host">
        <AgGridReact<Entity>
          theme={gridTheme(document.documentElement.dataset.theme === "dark")}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true }}
          getRowId={(p) => p.data.iri}
          rowSelection={{
            mode: "singleRow",
            checkboxes: false,
            enableClickSelection: true,
          }}
          onRowClicked={(e) =>
            e.data && void act("select", { iri: e.data.iri })
          }
          onGridReady={(e) => {
            api.current = e.api;
          }}
          pagination
          paginationPageSize={100}
          paginationPageSizeSelector={false}
          ensureDomOrder
          overlayNoRowsTemplate="No individuals. Use New individual to create one."
        />
      </div>
    </section>
  );
}

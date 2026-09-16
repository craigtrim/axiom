import { countLabel, instanceAction } from "../shared/action-state";
import { useEffect, useState } from "react";
import { INSTANCE_PAGE_SIZE, type InstancePage } from "../shared/instances";
import { displayName } from "../domain/rdf-model";
import { PaneToolbar } from "./AdaptivePane";
import { act, command, request, useSnapshot } from "./client";
import { clearInstanceReport, showInstances } from "./instance-report";
export function InstanceReport({ iri }: { iri: string }) {
  const s = useSnapshot()!;
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [page, setPage] = useState<InstancePage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const entity = s.entities.find((e) => e.iri === iri);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void request<InstancePage>("instances", {
      iri,
      query,
      start,
      datasetEpoch: s.datasetEpoch,
    })
      .then((data) => {
        if (live) {
          setPage(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setPage(null);
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [iri, query, start, s.version, s.datasetEpoch]);
  const label = entity ? displayName(entity) : "Unavailable class";
  return (
    <section
      className="panel instances-report"
      data-panel="individuals"
      aria-label="Instances report"
    >
      <div className="panel-toolbar instance-report-heading">
        <h2 title={label}>Instances of {label}</h2>
        <button onClick={clearInstanceReport}>All individuals</button>
      </div>
      <PaneToolbar
        label="Instance report filters"
        secondary={
          <>
            <label>
              Class{" "}
              <select
                aria-label="Instances of class"
                value={iri}
                onChange={(e) => showInstances(e.target.value)}
              >
                {s.entities
                  .filter((e) => ["Class", "Defined"].includes(e.kind))
                  .map((e) => (
                    <option
                      value={e.iri}
                      key={e.iri}
                      disabled={!instanceAction(e).enabled}
                    >
                      {countLabel(displayName(e), e.instances)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              onClick={() => {
                setQuery("");
                setStart(0);
              }}
            >
              Reset
            </button>
          </>
        }
      >
        <input
          aria-label="Filter instances"
          placeholder="Filter by name or IRI"
          maxLength={512}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setStart(0);
          }}
        />
      </PaneToolbar>
      <div className="table-summary" role="status">
        {loading ? (
          "Loading instances..."
        ) : page ? (
          <>
            {page.total.toLocaleString("en-GB")}{" "}
            {page.total === 1 ? "direct instance" : "direct instances"}
            {query.trim() &&
              " · " + page.filtered.toLocaleString("en-GB") + " matching"}
          </>
        ) : (
          "Report unavailable"
        )}
        <span className="muted">Direct class membership</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="instance-report-scroll" aria-busy={loading}>
        {!loading &&
          page &&
          (page.rows.length ? (
            <table className="instance-report-table">
              <caption className="sr-only">Direct instances of {label}</caption>
              <thead>
                <tr>
                  <th scope="col">Individual</th>
                  <th scope="col">Class</th>
                  {s.ontology.example && (
                    <>
                      <th scope="col">Order ref</th>
                      <th scope="col">Branch</th>
                      <th scope="col">Price</th>
                      <th scope="col">Customer</th>
                    </>
                  )}
                  <th scope="col">IRI</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.iri}>
                    <td>
                      <button
                        className="entity-link"
                        onClick={async () => {
                          await act("select", { iri: row.iri });
                          command("view.inspector");
                        }}
                      >
                        {row.label}
                      </button>
                    </td>
                    <td>{row.classes.join(", ")}</td>
                    {s.ontology.example && (
                      <>
                        <td>{row.reference ?? ""}</td>
                        <td>{row.branch ?? ""}</td>
                        <td>
                          {row.price === undefined
                            ? ""
                            : "£" + row.price.toFixed(2)}
                        </td>
                        <td>{row.customer ?? ""}</td>
                      </>
                    )}
                    <td>{row.iri}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="panel-note">
              {page.total
                ? "No instances match this filter."
                : "This class has no direct instances."}
            </p>
          ))}
      </div>
      <div
        className="panel-toolbar instance-report-paging"
        aria-label="Instance report pages"
      >
        <button
          disabled={loading || !page || page.start === 0}
          onClick={() =>
            setStart(Math.max(0, page!.start - INSTANCE_PAGE_SIZE))
          }
        >
          Previous
        </button>
        <span>
          {!loading &&
            page &&
            (page.filtered
              ? (page.start + 1).toLocaleString("en-GB") +
                " to " +
                (page.start + page.rows.length).toLocaleString("en-GB") +
                " of " +
                page.filtered.toLocaleString("en-GB")
              : "0 rows")}
        </span>
        <button
          disabled={
            loading || !page || page.start + page.rows.length >= page.filtered
          }
          onClick={() => setStart(page!.start + INSTANCE_PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

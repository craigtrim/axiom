import { useEffect, useState } from "react";
import { Modal } from "./Dialogs";
import { request, useSnapshot } from "./client";
import { displayName } from "../domain/rdf-model";
import type { SubclassSuggestion } from "../domain/subclass-suggestions";
interface Matches {
  suggestions: SubclassSuggestion[];
  version: number;
  datasetEpoch: number;
}
export function SubclassSuggestions({
  iri,
  close,
}: {
  iri: string;
  close: () => void;
}) {
  const s = useSnapshot()!;
  const [data, setData] = useState<Matches>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshId, setRefreshId] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    setData(undefined);
    setSelected([]);
    setError("");
    void request<Matches>("subclassSuggestions", { iri })
      .then((result) => {
        if (current) setData(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [iri, refreshId]);
  const entity = s.entities.find((e) => e.iri === iri);
  const label = entity ? displayName(entity) : iri;
  const stale =
    !!data &&
    (data.version !== s.version || data.datasetEpoch !== s.datasetEpoch);
  return (
    <Modal title={"Find existing parent classes for " + label} close={close}>
      <p>
        Make {label} a subclass of the selected existing classes. Matches use
        shorter names formed by omitting words, in the same order.
      </p>
      {!data && !error && <p role="status">Matching class names...</p>}
      {data?.suggestions.length === 0 && (
        <p>No additional parent classes matched this class name.</p>
      )}
      {!!data?.suggestions.length && (
        <div className="subclass-suggestions">
          <table aria-label="Suggested parent classes">
            <thead>
              <tr>
                <th>Possible parent</th>
                <th>Current parents</th>
              </tr>
            </thead>
            <tbody>
              {data.suggestions.map((candidate) => (
                <tr key={candidate.iri}>
                  <td>
                    <label title={candidate.iri}>
                      <input
                        type="checkbox"
                        checked={selected.includes(candidate.iri)}
                        disabled={busy || stale}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, candidate.iri]
                              : current.filter((id) => id !== candidate.iri),
                          )
                        }
                      />
                      {candidate.label}
                    </label>
                  </td>
                  <td>{candidate.parents.join(", ") || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.suggestions.length === 100 && (
            <p>Showing the first 100 matches.</p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {stale && (
        <p role="alert">
          The ontology changed. Find suggestions again before applying.
        </p>
      )}
      <footer>
        <button
          onClick={() => setRefreshId((n) => n + 1)}
          disabled={busy || (!data && !error)}
        >
          Find suggestions again
        </button>
        <button
          className="primary"
          disabled={!data || !selected.length || busy || stale}
          onClick={async () => {
            if (!data || busy) return;
            setBusy(true);
            setError("");
            try {
              await request("applySubclassSuggestions", {
                iri,
                parents: selected,
                version: data.version,
                datasetEpoch: data.datasetEpoch,
              });
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add parents ({selected.length})
        </button>
        <button onClick={close} disabled={busy}>
          Cancel
        </button>
      </footer>
    </Modal>
  );
}

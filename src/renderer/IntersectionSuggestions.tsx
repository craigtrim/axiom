import { useEffect, useState } from "react";
import { Modal } from "./Dialogs";
import { request, useSnapshot } from "./client";
import { SUBCLASS, NS } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import type { IntersectionSuggestion } from "../domain/intersection-suggestions";
export function IntersectionSuggestions({
  iri,
  close,
}: {
  iri: string;
  close: () => void;
}) {
  const s = useSnapshot()!,
    [data, setData] = useState<{
      suggestions: IntersectionSuggestion[];
      version: number;
      datasetEpoch: number;
    }>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [choice, setChoice] = useState<number | null>(null),
    [predicate, setPredicate] = useState(SUBCLASS);
  const refresh = () => {
    setError("");
    setChoice(null);
    void request<typeof data>("intersectionSuggestions", { iri })
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(refresh, [iri]);
  const stale =
    !!data &&
    (data.version !== s.version || data.datasetEpoch !== s.datasetEpoch);
  return (
    <Modal
      title={
        "Suggest intersection for " +
        (s.entities.find((e) => e.iri === iri)
          ? displayName(s.entities.find((e) => e.iri === iri)!)
          : iri)
      }
      close={close}
    >
      <p>
        Matches use existing class labels. Review whether both classes describe
        every instance of this class.
      </p>
      {!data && !error && <p role="status">Matching labels...</p>}
      {data?.suggestions.length === 0 && (
        <p>No suitable label combinations found.</p>
      )}
      {!!data?.suggestions.length && (
        <>
          <table className="intersection-suggestions">
            <thead>
              <tr>
                <th>Members</th>
                <th>Label coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.suggestions.map((candidate, i) => (
                <tr key={candidate.members.join()}>
                  <td>
                    <label>
                      <input
                        type="radio"
                        name="intersection-candidate"
                        checked={choice === i}
                        onChange={() => setChoice(i)}
                      />
                      {candidate.labels.join(", ")}
                    </label>
                    <small>{candidate.reason}</small>
                  </td>
                  <td>{Math.round(candidate.coverage * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            Relationship
            <select
              aria-label="Intersection relationship"
              value={predicate}
              onChange={(e) => setPredicate(e.target.value)}
            >
              <option value={NS.owl + "equivalentClass"}>
                Equivalent to their intersection
              </option>
              <option value={SUBCLASS}>Add both as parents</option>
            </select>
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {stale && (
        <p role="alert">
          The ontology changed. Find suggestions again before applying.
        </p>
      )}
      <footer>
        <button onClick={refresh} disabled={busy}>
          Find suggestions again
        </button>
        <button
          className="primary"
          disabled={choice === null || busy || stale}
          onClick={async () => {
            if (choice === null || !data) return;
            setBusy(true);
            try {
              await request("applyIntersection", {
                iri,
                members: data.suggestions[choice].members,
                predicate,
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
          {predicate === SUBCLASS ? "Add parents" : "Add equivalent definition"}
        </button>
        <button onClick={close} disabled={busy}>
          Cancel
        </button>
      </footer>
    </Modal>
  );
}

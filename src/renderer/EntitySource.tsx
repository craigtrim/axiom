import { lazy, Suspense, useEffect, useState } from "react";
import { sourceFormats, type EntitySourceDocument } from "../shared/source";
import { request, useSnapshot, panel, savePanel } from "./client";
import { entityRetargeted } from "./editor-drafts";
import {
  setEntitySourceDraft,
  useEntitySourceDraft,
} from "./entity-source-draft";
const OntologyEditor = lazy(() => import("./OntologyEditor"));
export function EntitySource({
  iri,
  initialOpen = false,
}: {
  iri: string;
  initialOpen?: boolean;
}) {
  const s = useSnapshot()!;
  const draft = useEntitySourceDraft(iri, s.datasetEpoch);
  const [open, setOpen] = useState(
    () => initialOpen || panel("details.source.open", false),
  );
  const [doc, setDoc] = useState<EntitySourceDocument>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open || draft) return;
    let active = true;
    void request<EntitySourceDocument>("entitySource", { iri })
      .then((value) => {
        if (active) {
          setDoc(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [iri, s.datasetEpoch, s.version, open, !!draft, reload]);
  const loaded = draft?.loaded ?? (doc?.iri === iri ? doc : undefined);
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await request<string>("applyEntitySource", {
        ...draft.loaded,
        text: draft.text,
      });
      setEntitySourceDraft(iri, s.datasetEpoch, null);
      if (next !== iri) entityRetargeted(iri, next, s.datasetEpoch);
      setReload((n) => n + 1);
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="entity-source"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        savePanel("details.source.open", event.currentTarget.open, false);
      }}
    >
      <summary>Source{draft ? " *" : ""}</summary>
      {open && (
        <div className="entity-source-body">
          <div className="entity-source-actions">
            <span className="muted">
              {sourceFormats.find((f) => f.id === loaded?.format)?.label ??
                "Loading source…"}
            </span>
            <button
              disabled={!draft || busy}
              onClick={() => {
                setEntitySourceDraft(iri, s.datasetEpoch, null);
                setReload((n) => n + 1);
                setError("");
              }}
            >
              Discard source edits
            </button>
            <button
              className="primary"
              disabled={!draft || busy}
              onClick={() => void save()}
            >
              Save source
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {draft && draft.loaded.version !== s.version && (
            <p className="muted">
              Source has unsaved edits. Saving checks for changes to this
              entity.
            </p>
          )}
          <Suspense fallback={<p>Loading source editor...</p>}>
            <OntologyEditor
              key={iri + ":" + s.datasetEpoch}
              label="Entity source"
              format={loaded?.format}
              disabled={!loaded || busy}
              value={draft?.text ?? loaded?.text ?? ""}
              change={(text) => {
                if (loaded) {
                  setEntitySourceDraft(iri, s.datasetEpoch, { loaded, text });
                  setError("");
                }
              }}
            />
          </Suspense>
        </div>
      )}
    </details>
  );
}

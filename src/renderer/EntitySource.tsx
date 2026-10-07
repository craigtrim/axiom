import { useEffect, useRef, useState } from "react";
import {
  sourceFormats,
  type EntitySourceDocument,
  type SourceFormat,
} from "../shared/source";
import {
  entitySourceSnippet,
  snippetSourceError,
} from "../shared/entity-source-snippet";
import {
  request,
  useSnapshot,
  panel,
  savePanel,
  onCommand,
  command,
} from "./client";
import { entityRetargeted } from "./editor-drafts";
import {
  setEntitySourceDraft,
  useEntitySourceDraft,
} from "./entity-source-draft";
import { usePaneLayout } from "./AdaptivePane";
import { DetailsSourceEditor } from "./DetailsSourceEditor";

export const detailsFormats: {
  id: SourceFormat;
  label: string;
  extension: string;
}[] = [
  { id: "turtle", label: "Turtle", extension: ".ttl" },
  { id: "rdfxml", label: "RDF/XML", extension: ".rdf" },
  { id: "jsonld", label: "JSON-LD", extension: ".jsonld" },
  { id: "ntriples", label: "N-Triples", extension: ".nt" },
  { id: "nquads", label: "N-Quads", extension: ".nq" },
  { id: "trig", label: "TriG", extension: ".trig" },
];
const cleanError = (error: unknown) =>
  (error as Error).message.replace(
    /^Error invoking remote method '[^']+': Error: /,
    "",
  );
export const sourceErrorLine = (message: string) =>
  Number(
    /\bline (\d+)\b/i.exec(message)?.[1] ?? /^(\d+):\d+:/.exec(message)?.[1],
  ) || undefined;

/** Mounted with the entity, not with the source region: shallow/recovery never
 * drops a draft, its validation result, or its header actions. */
export function useEntitySource(iri: string) {
  const s = useSnapshot()!;
  const { shallow, recovery } = usePaneLayout();
  const draft = useEntitySourceDraft(iri, s.datasetEpoch);
  const [doc, setDoc] = useState<EntitySourceDocument>();
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [reload, setReload] = useState(0);
  const [format, setFormat] = useState<SourceFormat | undefined>(() =>
    panel("details.source.format", undefined),
  );
  const [announcement, announce] = useState("");
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "details.source.format")
          setFormat(panel("details.source.format", undefined));
      }),
    [],
  );
  const visible = !shallow && !recovery;
  useEffect(() => {
    if (!visible || draft || busy) return;
    let active = true;
    void request<EntitySourceDocument>("entitySource", { iri, format })
      .catch((error) => {
        // A previous entity's presentation format must not drop this one's graphs.
        if (cleanError(error).includes("cannot preserve named graphs"))
          return request<EntitySourceDocument>("entitySource", { iri });
        throw error;
      })
      .then((value) => {
        if (active) {
          setDoc(value);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (active) setLoadError(cleanError(error));
      });
    return () => {
      active = false;
    };
  }, [iri, s.datasetEpoch, s.version, visible, !!draft, busy, reload, format]);
  const loaded =
    draft?.loaded ??
    (doc?.iri === iri && doc.datasetEpoch === s.datasetEpoch ? doc : undefined);
  const snippet = entitySourceSnippet(
    draft?.text ?? loaded?.text ?? "",
    loaded ?? { text: "" },
  );
  const state = draft?.stale
    ? "stale"
    : draft?.error
      ? "invalid"
      : draft
        ? "pending"
        : "clean";
  const save = async (): Promise<string | undefined> => {
    if (working.current) return;
    if (!draft) return iri;
    if (draft.stale || draft.error) return;
    working.current = true;
    setBusy(true);
    try {
      const next = await request<string>("applyEntitySource", {
        ...draft.loaded,
        text: draft.text,
      });
      setEntitySourceDraft(iri, s.datasetEpoch, null);
      if (next !== iri) entityRetargeted(iri, next, s.datasetEpoch);
      setReload((n) => n + 1);
      announce("Source applied. One undoable edit.");
      return next;
    } catch (error) {
      const message = snippetSourceError(cleanError(error), snippet);
      const stale = /^This entity changed\b/.test(message);
      setEntitySourceDraft(iri, s.datasetEpoch, {
        ...draft,
        error: stale ? undefined : message,
        stale,
      });
      const line = sourceErrorLine(message);
      announce(
        stale
          ? "The ontology moved under this draft. Discard and reload to work from it."
          : `Source will not parse${line ? " at line " + line : ""}. The ontology is unchanged.`,
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const discard = () => {
    if (working.current) return;
    setEntitySourceDraft(iri, s.datasetEpoch, null);
    setDoc(undefined);
    setReload((n) => n + 1);
    setLoadError("");
    announce(
      state === "stale"
        ? "Draft discarded and reloaded from the ontology."
        : "Draft discarded.",
    );
  };
  const chooseFormat = async (chosen: SourceFormat) => {
    if (working.current || chosen === loaded?.format) return;
    if (!(await save())) {
      announce("Fix or discard the draft before changing format.");
      return;
    }
    setDoc(undefined);
    setFormat(chosen);
    savePanel("details.source.format", chosen, false);
    command("details.source.format");
    announce(
      `Format is now ${detailsFormats.find((f) => f.id === chosen)!.label}.`,
    );
  };
  return {
    state,
    draft,
    loaded,
    snippet,
    busy,
    loadError,
    announcement,
    visible,
    save,
    discard,
    chooseFormat,
    change(text: string) {
      if (!loaded || working.current) return;
      setEntitySourceDraft(iri, s.datasetEpoch, {
        loaded,
        text: snippet.header + text + snippet.footer,
        ...(draft?.stale ? { stale: true } : {}),
      });
      announce("");
    },
  };
}
export type EntitySourceController = ReturnType<typeof useEntitySource>;

export function EntitySource({
  source,
  name,
}: {
  source: EntitySourceController;
  name: string;
}) {
  const format = detailsFormats.find((f) => f.id === source.loaded?.format);
  const line = sourceErrorLine(source.draft?.error ?? "");
  return (
    <section
      className={"details-source srcwrap " + source.state}
      hidden={!source.visible}
      aria-label="Entity source"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          ["pending", "invalid"].includes(source.state)
        ) {
          event.preventDefault();
          event.stopPropagation();
          source.discard();
        }
      }}
    >
      <div className="srcline">
        <select
          className="fmt"
          aria-label="Source format"
          value={format?.id ?? "turtle"}
          disabled={!source.loaded || source.busy}
          onChange={(event) =>
            void source.chooseFormat(event.target.value as SourceFormat)
          }
        >
          {detailsFormats.map((f) => (
            <option
              key={f.id}
              value={f.id}
              disabled={
                source.loaded?.namedGraphs &&
                !sourceFormats.find((v) => v.id === f.id)!.graphs
              }
            >
              {f.label}
            </option>
          ))}
        </select>
        <span className="srcnote">
          {format?.extension ?? "Loading source…"}
        </span>
      </div>
      <DetailsSourceEditor
        value={source.snippet.body}
        label={`Source for ${name}, ${format?.label ?? "Turtle"}`}
        disabled={!source.loaded || source.busy}
        change={source.change}
      />
      {source.draft?.error && (
        <p className="srcerr" role="alert">
          {line && <span className="ln">{"line " + line}</span>}
          <span>{source.draft.error + " The ontology is unchanged."}</span>
        </p>
      )}
      {source.state === "stale" && (
        <p className="srcwarn">
          The ontology changed in another view while this draft was open. The
          draft is kept and cannot overwrite the newer version. Copy anything
          you want, then discard and reload.
        </p>
      )}
      {source.loadError && (
        <p className="srcerr" role="alert">
          {source.loadError}
        </p>
      )}
      {/* craigtrim/axiom#58: no prefix note; only a pending draft gets one. */}
      {source.draft && (
        <p className="srcnote">
          Kept if you close this pane or save the workspace.
        </p>
      )}
    </section>
  );
}

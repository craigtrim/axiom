import { useEffect, useState } from "react";
import { request, useSnapshot, panel, savePanel } from "./client";
import type { LinkedFile, FilePreview } from "../shared/source";
export function LinkedFileCard({ iri }: { iri: string }) {
  const snapshot = useSnapshot()!;
  const [file, setFile] = useState<LinkedFile | null>(null);
  const [preview, setPreview] = useState<FilePreview>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(panel("files.thumbnails", false));
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setFile(null);
    setError("");
    void request<LinkedFile | null>("linkedFile", { iri })
      .then((f) => {
        if (active) setFile(f);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [iri, snapshot.version, snapshot.datasetEpoch]);
  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setLoading(false);
    if (show && file?.image) {
      setLoading(true);
      setError("");
      void window.axiom.files
        .thumbnail(iri)
        .then((p) => {
          if (active) setPreview(p);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [file, show, refresh, iri]);
  if (!file)
    return error ? (
      <p role="alert" className="field-error">
        {error}
      </p>
    ) : null;
  const action = (name: "open" | "reveal") => {
    setError("");
    void window.axiom.files[name](iri).catch((e) => setError(e.message));
  };
  return (
    <section className="inspector-section linked-file" aria-label="Linked file">
      <h3>File</h3>
      <div className="file-path" title={file.path}>
        {file.path}
      </div>
      <div className="file-actions">
        <button onClick={() => action("open")}>Open file</button>
        <button onClick={() => action("reveal")}>Show in folder</button>
        {file.image && (
          <button
            aria-pressed={show}
            onClick={() => {
              setShow(!show);
              savePanel("files.thumbnails", !show, false);
            }}
          >
            {show ? "Hide thumbnail" : "Show thumbnail"}
          </button>
        )}
      </div>
      {loading && <p role="status">Loading thumbnail...</p>}
      {preview && (
        <button
          className="file-thumbnail"
          onClick={() => action("open")}
          title="Open original image"
        >
          <img
            src={preview.dataUrl}
            width={preview.width}
            height={preview.height}
            alt={"Thumbnail of " + file.name}
          />
        </button>
      )}
      {show && file.image && (
        <button onClick={() => setRefresh((n) => n + 1)} disabled={loading}>
          Refresh thumbnail
        </button>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}

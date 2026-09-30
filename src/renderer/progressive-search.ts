import type { DomainMethod } from "../shared/protocol";
/** Publish lexical results immediately, then enrich after typing settles. */
export function progressiveSearch<T>(
  request: <R>(
    method: DomainMethod,
    args: Record<string, unknown>,
  ) => Promise<R>,
  method: "find" | "resourceSuggestions",
  args: Record<string, unknown>,
  receive: (value: T) => void,
  failed: (error: Error) => void,
) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  void request<T>(method, args)
    .then((value) => {
      if (!active) return;
      receive(value);
      timer = setTimeout(() => {
        void request<T | undefined>(
          method === "find" ? "findSemantic" : "resourceSuggestionsSemantic",
          args,
        )
          .then((enriched) => {
            if (active && enriched) receive(enriched);
          })
          .catch(() => {
            /* Lexical results remain usable without the model. */
          });
      }, 180);
    })
    .catch((error) => {
      if (active) failed(error);
    });
  return () => {
    active = false;
    clearTimeout(timer);
    void request("cancelSearch", args).catch(() => {});
  };
}

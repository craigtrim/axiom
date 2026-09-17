import { createContext, useContext, useMemo } from "react";
import * as client from "./client";
import type { GraphSnapshot, Snapshot, DomainMethod } from "../shared/protocol";
export const GraphScope = createContext("graph");
export function useGraphScope() {
  const id = useContext(GraphScope);
  return useMemo(() => {
    const current = () =>
      client.state?.graphs?.[id] ?? (id === "graph" ? client.graph : null);
    const empty = {
      nodes: [],
      edges: [],
      focus: [],
      groups: [],
      rings: [],
      ringOrigin: { x: 0, y: 0 },
      budget: 1000,
      hidden: 0,
      revision: 0,
      mode: "force",
      choice: "auto",
      frozen: false,
    };
    // Canvas handlers keep this reference across renders. Enumeration also supports export snapshots.
    const graph = new Proxy({} as GraphSnapshot, {
      get: (_, k) => Reflect.get(current() ?? empty, k),
      ownKeys: () => Reflect.ownKeys(current() ?? empty),
      getOwnPropertyDescriptor: () => ({
        enumerable: true,
        configurable: true,
      }),
    });
    const state = new Proxy({} as Snapshot, {
      get: (_, k) =>
        k === "graph"
          ? graph
          : k === "selected"
            ? (current()?.selected ?? null)
            : Reflect.get(client.state ?? {}, k),
    });
    const request = <T = unknown,>(
      method: DomainMethod,
      args?: Record<string, unknown>,
    ) => client.request<T>(method, { ...args, graphId: id });
    const act = (method: DomainMethod, args?: Record<string, unknown>) =>
      client.act(method, { ...args, graphId: id });
    const onCommand = (fn: (id: string) => void) =>
      client.onCommand((command) => {
        if (
          (client.state?.activeGraphId ?? "graph") === id ||
          (!command.startsWith("graph.") && !command.startsWith("edge."))
        )
          fn(command);
      });
    const useSnapshot = () => {
      client.useSnapshot();
      return {
        ...client.state,
        graph: current() ?? empty,
        selected: current()?.selected ?? null,
      } as Snapshot;
    };
    return { id, graph, state, request, act, onCommand, useSnapshot };
  }, [id]);
}

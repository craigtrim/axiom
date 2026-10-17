// Issue 87 waits for a mounted graph before replaying shell commands.
import { createContext, useContext, useMemo } from "react";
import * as client from "./client";
import type { GraphSnapshot, Snapshot, DomainMethod } from "../shared/protocol";
export const GraphScope = createContext("graph");
const readyGraphs = new Set<string>();
export const graphCommandsReady = (id: string) => readyGraphs.has(id);
export function suspendGraphCommands(id: string) {
  const suspended = readyGraphs.delete(id);
  return () => {
    if (suspended) {
      readyGraphs.add(id);
      client.command("graph.ready:" + id);
    }
  };
}
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
    const onCommand = (fn: (id: string) => void) => {
      const off = client.onCommand((command) => {
        if (
          (readyGraphs.has(id) &&
            (client.state?.activeGraphId ?? "graph") === id) ||
          (!command.startsWith("graph.") && !command.startsWith("edge."))
        )
          fn(command);
      });
      readyGraphs.add(id);
      client.command("graph.ready:" + id);
      return () => {
        readyGraphs.delete(id);
        off();
      };
    };
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

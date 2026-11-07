// craigtrim/axiom#205: keep membership stable during motion and reuse it for state requests.
import { graphClusters, assignClusterGroups } from "../domain/graph-clusters";
import type { GraphNode, Viewport } from "../domain/viewport";

export class GraphClusterState {
  private nodes?: Viewport["nodes"];
  private edges?: Viewport["edges"];
  private revision = -1;
  private looseness = -1;
  private colors?: boolean;
  private groups: GraphNode[][] = [];
  private dirty = true;

  invalidate() {
    this.dirty = true;
  }

  repaint() {
    this.colors = undefined;
  }

  update(view: Viewport, moving: boolean) {
    const changed =
      this.nodes !== view.nodes ||
      this.edges !== view.edges ||
      this.revision !== view.revision ||
      this.looseness !== view.clusterLooseness;
    if (changed) {
      this.nodes = view.nodes;
      this.edges = view.edges;
      this.revision = view.revision;
      this.looseness = view.clusterLooseness;
      this.dirty = true;
    }
    if (moving) this.dirty = true;
    const recompute = this.dirty && !moving;
    if (recompute) {
      this.groups = graphClusters(
        [...view.nodes.values()],
        [...view.edges.values()],
        view.clusterLooseness,
      );
      this.dirty = false;
    } else if (changed) {
      // Keep surviving memberships; newly admitted nodes remain unassigned.
      this.groups = this.groups
        .map((group) =>
          group
            .map((node) => view.nodes.get(node.iri))
            .filter((node): node is GraphNode => !!node),
        )
        .filter((group) => group.length > 1);
    }
    if (recompute || changed || this.colors !== view.clusterColors) {
      assignClusterGroups(
        [...view.nodes.values()],
        this.groups,
        view.clusterColors,
      );
      this.colors = view.clusterColors;
    }
    return {
      count: this.groups.length,
      pending: this.dirty && view.nodes.size > 0,
    };
  }
}

// #165: generated example records retain inspection without requesting an RDF editor draft.
import type { ReactNode } from "react";
import { kindLabel, shorten } from "../domain/model";
import { displayName } from "../domain/rdf-model";
import type { InspectorData } from "../shared/protocol";
import { act, command, report } from "./client";

export function GeneratedInspector({ data }: { data: InspectorData }) {
  const { entity, order, customer } = data;
  const facts: [string, ReactNode][] = order
    ? [
        ["Order reference", order.reference],
        ["Branch", order.branch],
        ["Price", "£" + order.price.toFixed(2)],
        ["Rating", order.rating + " / 5"],
        [
          "Prepared",
          new Date(order.timestamp).toLocaleString("en-GB", {
            timeZone: "UTC",
          }),
        ],
        [
          "Customer",
          customer && (
            <button
              className="lnk"
              onClick={() => void act("select", { iri: customer.iri })}
            >
              {customer.name}
            </button>
          ),
        ],
      ]
    : data.values.map(({ predicate, term }) => [
        shorten(predicate),
        term.value,
      ]);
  return (
    <div className="inspector-content-grid">
      <div className="bar" role="group" aria-label="Inspector actions">
        <span className="state">Generated example record</span>
        <span className="flex" />
        <button
          className="btn quiet"
          onClick={() =>
            void window.axiom
              .copy(entity.iri)
              .then(() => report("Copied entity IRI."))
          }
        >
          Copy IRI
        </button>
        <button
          className="btn quiet"
          onClick={() => {
            void act("seed", { iris: [entity.iri] }).then(() =>
              command("graph.fit"),
            );
            command("view.graph");
          }}
        >
          Show in graph
        </button>
      </div>
      <div className="ibody">
        <div className="ident">
          <div className="nm">
            <strong>{displayName(entity)}</strong>
            <span className="kind">{kindLabel(entity.kind)}</span>
          </div>
          <div className="iri" title={entity.iri}>
            {entity.iri}
          </div>
        </div>
        <div className="sect">
          <span className="t">{order ? "Order data" : "Customer data"}</span>
        </div>
        <table
          className="st"
          aria-label={order ? "Order data" : "Customer data"}
        >
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {facts.map(([name, value], index) => (
              <tr key={name + index}>
                <th scope="row" className="p">
                  {name}
                </th>
                <td className="v">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

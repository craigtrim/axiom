// craigtrim/axiom#89: Inspector owns its grouped rows; Details and Find retain these controls.
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StatementGroup } from "./statement-groups";
import "./statement-groups.css";
import { DetailsGlyph } from "./DetailsGlyph";
import { FindGlyph } from "./FindGlyph";

export function StatementGroupRow<Value>({
  group,
  name,
  predicate,
  renderValue,
  valueKey,
  add,
  remove,
  removable = () => true,
  details = false,
  find = false,
}: {
  group: StatementGroup<Value>;
  name: string;
  predicate: ReactNode | ((hidden: number) => ReactNode);
  renderValue(value: Value, index: number): ReactNode;
  valueKey(value: Value, index: number): string | number;
  add?: () => void;
  remove(value: Value, index: number): void;
  removable?: (value: Value) => boolean;
  details?: boolean;
  find?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const pendingFocus = useRef<{ index: number; selector: string } | null>(null);
  const id = useId();
  const grouped = group.values.length > 1;
  const shown = expanded ? group.values : group.values.slice(0, 3);
  const hidden = group.values.length - shown.length;
  const predicateNode =
    typeof predicate === "function" ? predicate(hidden) : predicate;
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const fields = row.current?.querySelectorAll<HTMLElement>(
      ".statement-value-line",
    );
    const field =
      fields?.[Math.min(pendingFocus.current.index, fields.length - 1)];
    // Issue 85 hides actions outside focus; reveal the remaining row before
    // returning keyboard focus to its remove action after deleting a value.
    if (pendingFocus.current.selector === ".statement-value-remove")
      field?.querySelector<HTMLElement>("input, select")?.focus();
    field?.querySelector<HTMLElement>(pendingFocus.current.selector)?.focus();
    pendingFocus.current = null;
  }, [group.values.length]);
  const addValue = () => {
    pendingFocus.current = {
      index: group.values.length,
      selector: "input, select",
    };
    setExpanded(true);
    add?.();
  };
  const addButton = (inline = false) =>
    add && (
      <button
        type="button"
        className={`statement-text-action${inline ? " statement-value-action" : ""}`}
        // Keep a focused single-value tools line in place until click dispatch.
        onMouseDown={(event) => {
          if (details && event.button === 0) event.preventDefault();
        }}
        onClick={(event) => {
          // Finish the previous cell before appending the new blank value.
          event.currentTarget.focus();
          addValue();
        }}
      >
        + Add value
      </button>
    );
  return (
    <tr
      ref={row}
      className="statement-group-row"
      data-predicate={group.predicate}
      data-readonly={
        group.values.every((value) => !removable(value)) || undefined
      }
    >
      <td>
        <div className="statement-group-predicate">
          {predicateNode}
          {hidden > 0 && typeof predicate !== "function" && (
            <span className="statement-value-count">{group.values.length}</span>
          )}
        </div>
      </td>
      <td>
        <div
          id={id}
          className={`statement-value-stack${grouped ? " grouped" : ""}`}
        >
          {shown.map((value, index) => (
            <div
              className="statement-value-line"
              key={valueKey(value, index)}
              data-value-index={index}
            >
              <div className="statement-value-field">
                {renderValue(value, index)}
              </div>
              {/* Find reserves the action slot even for an empty value (craigtrim/axiom#83). */}
              {find && !removable(value) && (
                <span className="find-value-action-slot" />
              )}
              {removable(value) && (
                <button
                  type="button"
                  className="statement-value-action statement-value-remove"
                  aria-label={`Remove this ${name} value`}
                  title={`Remove this ${name} value`}
                  onMouseDown={(event) => {
                    if (details && event.button === 0) event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    pendingFocus.current = {
                      index: Math.max(0, index - 1),
                      selector: ".statement-value-remove",
                    };
                    remove(value, index);
                  }}
                >
                  {details ? (
                    <DetailsGlyph kind="remove" />
                  ) : find ? (
                    <FindGlyph name="close" />
                  ) : (
                    "×"
                  )}
                </button>
              )}
              {/* Issue 85: Details reveals the tools line while the row holds focus. */}
              {!grouped && !details && addButton(true)}
            </div>
          ))}
          {(grouped || details) && (add || group.values.length > 3) && (
            <div
              className={
                "statement-value-tools" +
                (!grouped ? " statement-single-tools" : "")
              }
            >
              {addButton()}
              {group.values.length > 3 && (
                <button
                  type="button"
                  className="statement-text-action statement-value-expand"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onMouseDown={(event) => {
                    if (details && event.button === 0) event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setExpanded(!expanded);
                  }}
                >
                  {expanded ? "Show fewer" : `${hidden} more`}
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

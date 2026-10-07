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
  inspector = false,
}: {
  group: StatementGroup<Value>;
  name: string;
  predicate: ReactNode;
  renderValue(value: Value, index: number): ReactNode;
  valueKey(value: Value, index: number): string | number;
  add?: () => void;
  remove(value: Value, index: number): void;
  removable?: (value: Value) => boolean;
  details?: boolean;
  inspector?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const pendingFocus = useRef<{ index: number; selector: string } | null>(null);
  const id = useId();
  const grouped = group.values.length > 1;
  const shown = expanded ? group.values : group.values.slice(0, 3);
  const hidden = group.values.length - shown.length;
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const fields = row.current?.querySelectorAll<HTMLElement>(
      ".statement-value-line, .inspector-value",
    );
    const field =
      fields?.[Math.min(pendingFocus.current.index, fields.length - 1)];
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
        onClick={addValue}
      >
        + Add value
      </button>
    );
  if (inspector)
    return (
      <tr ref={row} data-predicate={group.predicate}>
        <td>
          <div className="pred">{predicate}</div>
        </td>
        <td>
          <div className="vals" id={id}>
            {shown.map((value, index) => (
              <div className="inspector-value" key={valueKey(value, index)}>
                {renderValue(value, index)}
                {removable(value) && (
                  <button
                    type="button"
                    className="ib row-remove"
                    aria-label={`Remove this ${name} value`}
                    onClick={() => remove(value, index)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {group.values.length > 3 ? (
              <div
                style={{ display: "flex", gap: "var(--sp-2)", paddingTop: 2 }}
              >
                {add && (
                  <button
                    type="button"
                    className="btn tiny quiet"
                    onClick={addValue}
                  >
                    Add value
                  </button>
                )}
                <button
                  type="button"
                  className="btn tiny quiet"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? "Show fewer" : `${hidden} more`}
                </button>
              </div>
            ) : (
              add && (
                <button
                  type="button"
                  className="btn tiny quiet single-add"
                  aria-label={`Add value for ${name}`}
                  onClick={addValue}
                >
                  Add value
                </button>
              )
            )}
          </div>
        </td>
      </tr>
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
          {predicate}
          {hidden > 0 && (
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
              {removable(value) && (
                <button
                  type="button"
                  className="statement-value-action statement-value-remove"
                  aria-label={`Remove this ${name} value`}
                  title={`Remove this ${name} value`}
                  onClick={() => {
                    pendingFocus.current = {
                      index: Math.max(0, index - 1),
                      selector: ".statement-value-remove",
                    };
                    remove(value, index);
                  }}
                >
                  {details ? <DetailsGlyph kind="remove" /> : "×"}
                </button>
              )}
              {!grouped && addButton(true)}
            </div>
          ))}
          {grouped && (add || group.values.length > 3) && (
            <div className="statement-value-tools">
              {addButton()}
              {group.values.length > 3 && (
                <button
                  type="button"
                  className="statement-text-action statement-value-expand"
                  aria-expanded={expanded}
                  aria-controls={id}
                  onClick={() => setExpanded(!expanded)}
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

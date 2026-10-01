import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { parseNumberDraft, type NumberRange } from "./number-draft";

type Validity = (id: string, valid: boolean | null) => void;
export const NumberValidation = createContext<Validity>(() => {});
export function useNumberValidation() {
  const [invalid, setInvalid] = useState(new Set<string>());
  const report = useCallback<Validity>((id, valid) => {
    setInvalid((before) => {
      if (before.has(id) === (valid === false)) return before;
      const next = new Set(before);
      if (valid === false) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return { invalid: invalid.size > 0, report };
}

export function NumberField({
  value,
  change,
  min,
  max,
  integer = false,
  step = 1,
  ...props
}: NumberRange & {
  value: number;
  change(value: number): void;
  step?: number;
} & Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "min" | "max" | "step"
  >) {
  const id = useId(),
    report = useContext(NumberValidation);
  const [text, setText] = useState(String(value));
  const focused = useRef(false),
    sent = useRef(new Set<number>());
  const parsed = parseNumberDraft(text, { min, max, integer });
  const valid = parsed !== undefined;
  useEffect(() => {
    // Acknowledging an applied value must not rewrite a newer edit or its spelling.
    if (sent.current.delete(value)) return;
    if (!focused.current) setText(String(value));
  }, [value]);
  useLayoutEffect(() => report(id, valid), [id, report, valid]);
  useLayoutEffect(() => () => report(id, null), [id, report]);
  const edit = (next: string) => {
    setText(next);
    const number = parseNumberDraft(next, { min, max, integer });
    if (number !== undefined && number !== value) {
      sent.current.add(number);
      change(number);
    }
  };
  return (
    <span className="number-field">
      <input
        {...props}
        type="text"
        role="spinbutton"
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={parsed}
        aria-invalid={!valid}
        aria-describedby={
          [props["aria-describedby"], !valid ? id : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onChange={(event) => edit(event.target.value)}
        onFocus={(event) => {
          focused.current = true;
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          focused.current = false;
          props.onBlur?.(event);
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = Math.min(
              max,
              Math.max(
                min,
                (parsed ?? value) + (event.key === "ArrowUp" ? step : -step),
              ),
            );
            edit(String(Number(next.toPrecision(12))));
          }
        }}
      />
      <span id={id} className="number-field-error" aria-live="polite">
        {!valid &&
          `Enter ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`}
      </span>
    </span>
  );
}

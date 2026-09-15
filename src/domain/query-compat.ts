import {
  DateTimeLiteral,
  TimeLiteral,
  DateLiteral,
  DurationLiteral,
  YearMonthDurationLiteral,
  Literal,
  NamedNode,
  NonLexicalLiteral,
  RDFEqualTypeError,
  string,
  bool,
} from "@comunica/utils-expression-evaluator";
import { TermFunctionDatatype } from "@comunica/actor-function-factory-term-datatype/lib/TermFunctionDatatype";
import { TermFunctionLang } from "@comunica/actor-function-factory-term-lang/lib/TermFunctionLang";
import { TermFunctionEncodeForUri } from "@comunica/actor-function-factory-term-encode-for-uri/lib/TermFunctionEncodeForUri";
import { TermFunctionEquality } from "@comunica/actor-function-factory-term-equality/lib/TermFunctionEquality";
import { NS } from "./model";
let installed = false;
/**
 * Narrow compatibility fixes for the pinned Comunica 5.4.0 function packages.
 * Each rule has W3C and Axiom literal regression coverage. No parser/algebra is replaced.
 */
export function installQueryCompatibility() {
  if (installed) return;
  installed = true;
  // STR describes the original RDF term, not a reserialized internal value.
  for (const Type of [
    DateTimeLiteral,
    TimeLiteral,
    DateLiteral,
    DurationLiteral,
    YearMonthDurationLiteral,
  ]) {
    const original = Type.prototype.str;
    Type.prototype.str = function () {
      return this.strValue ?? original.call(this as never);
    };
  }
  const datatype = TermFunctionDatatype.prototype.applyOnTerms;
  TermFunctionDatatype.prototype.applyOnTerms = function (args, evaluator) {
    if (args.length === 1 && args[0] instanceof NonLexicalLiteral)
      return new NamedNode(args[0].dataType);
    return datatype.call(this, args, evaluator);
  };
  const lang = TermFunctionLang.prototype.applyOnTerms;
  TermFunctionLang.prototype.applyOnTerms = function (args, evaluator) {
    if (args.length === 1 && args[0] instanceof NonLexicalLiteral)
      return string(args[0].language ?? "");
    return lang.call(this, args, evaluator);
  };
  const encode = TermFunctionEncodeForUri.prototype.applyOnTerms;
  TermFunctionEncodeForUri.prototype.applyOnTerms = function (args, evaluator) {
    encode.call(this, args, evaluator); // Retain standard arity and argument-type errors.
    return string(
      encodeURIComponent(args[0].str()).replace(
        /[!'()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      ),
    );
  };
  const equal = TermFunctionEquality.prototype.applyOnTerms;
  TermFunctionEquality.prototype.applyOnTerms = function (args, evaluator) {
    const [left, right] = args;
    if (
      args.length === 2 &&
      left instanceof Literal &&
      right instanceof Literal
    ) {
      // A language-tagged literal and a literal of another kind are different RDF terms.
      if (!!left.language !== !!right.language) return bool(false);
      if (
        left.dataType === NS.xsd + "date" ||
        right.dataType === NS.xsd + "date"
      ) {
        if (left.dataType !== right.dataType) return bool(false);
        const a = dateInterval(left.str()),
          b = dateInterval(right.str());
        if (a && b && a.uncertain !== b.uncertain) {
          if (a.end < b.start || b.end < a.start) return bool(false);
          throw new RDFEqualTypeError([left, right]);
        }
      }
    }
    try {
      return equal.call(this, args, evaluator);
    } catch (error) {
      // RDFterm-equal still recognizes identical ill-typed terms.
      if (
        left instanceof NonLexicalLiteral &&
        right instanceof NonLexicalLiteral &&
        left.dataType === right.dataType &&
        left.str() === right.str()
      )
        return bool(true);
      throw error;
    }
  };
}
function dateInterval(value: string) {
  const m = value.match(/^(-?\d{4,}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) return undefined;
  const time = Date.parse(m[1] + "T00:00:00" + (m[2] ?? "Z"));
  if (!Number.isFinite(time)) return undefined;
  const uncertainty = m[2] ? 0 : 14 * 60 * 60 * 1000;
  return {
    start: time - uncertainty,
    end: time + uncertainty,
    uncertain: !m[2],
  };
}

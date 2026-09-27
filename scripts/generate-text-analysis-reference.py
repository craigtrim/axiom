"""Record live OWL parsing expectations from the original Python Mutato repo.

Run with the original dependencies installed, not the C compatibility adapter:
  python scripts/generate-text-analysis-reference.py --mutato ../mutatos/mutato
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests/fixtures/text-analysis"
PREFIXES = """@prefix : <https://example.org/spans#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
:Entity a owl:Class; rdfs:label "entity" .
"""


def cases():
    pair = []
    # The original distance test explicitly covers zero to four intervening words.
    # Extend both sides of that boundary in both directions and three casings.
    for left, right in [("alpha", "beta"), ("beta", "alpha"),
                        ("ALPHA", "BETA"), ("Alpha", "Beta")]:
        for gap in range(8):
            pair.append(" ".join([left] + ["blah"] * gap + [right]))
    for separator in [" ", "  ", "\t", "\n", "\r\n", "\n\n", "\u00a0",
                      ", ", "; ", ": ", ". ", "! ", "? ", " / ", " - ",
                      " and ", " or ", " not ", " never ", " without ",
                      " in the ", " one two three ", " one two three four "]:
        for left, right in [("alpha", "beta"), ("beta", "alpha")]:
            pair.append(left + separator + right)
    pair += ["alpha", "beta", "alpha blah", "blah beta", "alphabet beta",
             "alpha betamax", "blah blah", "alpha alpha", "beta beta",
             "alpha+beta", "alpha alpha blah beta", "alpha blah beta beta",
             "alpha beta alpha beta", "alpha beta. alpha beta.",
             "alpha beta blah blah blah blah alpha", "beta alpha blah blah blah blah beta",
             "prefix alpha blah beta suffix", "  alpha blah beta  ",
             "😀 alpha blah beta 🐈", "café alpha blah beta résumé",
             '"alpha blah beta"', "(alpha blah beta)",
             "alpha blah, blah beta", "alpha blah blah, beta",
             "alpha blah blah blah, beta", "alpha\nblah\tbeta",
             "alpha in London beta", "Alice saw alpha blah beta in London"]
    nested = []
    for left, right in [("kidney injury", "acute"), ("acute", "kidney injury"),
                        ("renal trauma", "sudden"), ("sudden", "renal trauma")]:
        for gap in range(6):
            nested.append(" ".join([left] + ["blah"] * gap + [right]))
    nested += ["😀 kidney injury blah acute.", "😀 kidney injury\nblah acute.", "kidney\ninjury blah acute",
               "kidney injury", "acute", "injury blah acute", "kidney blah acute",
               "kidney injury and acute; kidney injury and acute"]
    ordinary = [" ".join([a] + ["blah"] * n + [b])
                for a, b in [("research", "methods"), ("methods", "research")]
                for n in range(7)]
    ordinary += ["Research Methods", "RESEARCH METHODS", "research and methods",
                 "research in methods", "research", "methods", "research methodologies"]
    return [
        ("plus", ':Pair a owl:Class; rdfs:subClassOf :Entity; rdfs:label "pair"; skos:altLabel "alpha+beta" .', pair),
        ("seealso", ':Pair a owl:Class; rdfs:subClassOf :Entity; rdfs:label "pair"; rdfs:seeAlso "alpha+beta" .', pair[:8] + ["beta blah alpha", "alpha", "beta"]),
        ("nested", """:renal_trauma a owl:Class; rdfs:subClassOf :Entity; rdfs:label "renal trauma"; skos:altLabel "kidney injury" .
:Acute a owl:Class; rdfs:subClassOf :Entity; rdfs:label "acute"; skos:altLabel "sudden" .
:Condition a owl:Class; rdfs:subClassOf :Entity; rdfs:label "condition"; skos:altLabel "renal_trauma+acute" .""", nested),
        ("ordinary", ':research_methods a owl:Class; rdfs:subClassOf :Entity; rdfs:label "research methods" .', ordinary),
    ]


def source_entities(text, tokens):
    """Locate unchanged reference leaf spellings with a sequential regex cursor.

    Fixtures deliberately avoid abbreviation/contraction expansions. Source ranges
    are independent of Axiom's mapper and Mutato's rewritten x/y coordinates.
    """
    cursor = 0

    def visit(token):
        nonlocal cursor
        if token.get("swaps"):
            ranges = [visit(child) for child in token["swaps"]["tokens"]]
            ranges = [r for r in ranges if r is not None]
            return (ranges[0][0], ranges[-1][1]) if ranges else None
        chars = [ch for ch in token["text"] if not ch.isspace()]
        if not chars:
            return None
        pattern = r"\s*" + r"\s*".join(
            "['\"]" if ch in "'\"" else re.escape(ch) for ch in chars)
        match = re.compile(pattern).match(text, cursor)
        if match is None:
            raise ValueError(f"Reference leaf cannot be located: {token['text']!r} in {text!r} at {cursor}")
        start = cursor
        while start < match.end() and text[start].isspace():
            start += 1
        cursor = match.end()
        return start, cursor

    def utf16(offset):
        return len(text[:offset].encode("utf-16-le")) // 2

    result = []
    for token in tokens:
        span = visit(token)
        if token.get("swaps") and span:
            start, end = span
            result.append({"start": utf16(start), "end": utf16(end),
                           "label": token["swaps"]["canon"],
                           "method": token["swaps"]["type"], "surface": text[start:end]})
    assert not text[cursor:].strip(), (text, cursor)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mutato", type=Path, required=True)
    args = parser.parse_args()
    original = args.mutato.resolve()
    os.environ["SPAN_DISTANCE"] = "4"
    sys.path.insert(0, str(original))
    from mutato.finder.multiquery import FindOntologyData
    from mutato.parser import MutatoAPI
    import mutato
    import spacy
    assert Path(mutato.__file__).resolve().is_relative_to(original)
    model = spacy.load("en_core_web_sm")
    OUT.mkdir(parents=True, exist_ok=True)
    profiles = []
    with tempfile.TemporaryDirectory(prefix="axiom-mutato-") as temporary:
        for name, declarations, texts in cases():
            turtle = PREFIXES + declarations + "\n"
            (Path(temporary) / f"{name}.owl").write_text(turtle, encoding="utf-8")
            (OUT / f"{name}.owl").write_text(turtle, encoding="utf-8")
            finder = FindOntologyData([name], temporary, "https://example.org/spans#")
            api = MutatoAPI(finder, en_spacy_model=model)
            rows = []
            for i, text in enumerate(dict.fromkeys(texts)):
                tokens = api.swap_input_text(text)
                canonical = " ".join(t["swaps"]["canon"] if t.get("swaps") else t["text"].strip()
                                     for t in tokens if t.get("swaps") or t["text"].strip())
                rows.append({"id": f"{name}-{i + 1:03}", "text": text, "canonical": canonical,
                             "entities": source_entities(text, tokens)})
            by_text = {row["text"]: row for row in rows}
            # Independently specified positive and negative examples prevent a
            # mis-authored ontology from turning a span profile into all negatives.
            if name in ("plus", "seealso"):
                assert by_text["alpha blah blah beta"]["entities"] == [
                    {"start": 0, "end": 20, "label": "pair", "method": "spans", "surface": "alpha blah blah beta"}]
                assert by_text["alpha blah blah blah blah beta"]["entities"] == []
            elif name == "nested":
                assert by_text["kidney injury blah acute"]["canonical"] == "condition"
                assert by_text["kidney injury blah acute"]["entities"][0]["method"] == "spans"
                assert by_text["😀 kidney injury\nblah acute."]["entities"] == [
                    {"start": 3, "end": 27, "label": "condition", "method": "spans", "surface": "kidney injury\nblah acute"}]
            elif name == "ordinary":
                assert by_text["research blah blah blah methods"]["canonical"] == "research_methods"
                assert by_text["research blah blah blah blah methods"]["entities"] == []
            profiles.append({"name": name, "owl": f"{name}.owl", "cases": rows})
            print(f"{name}: {len(rows)} reference cases", flush=True)
    source_files = ["mutato/finder/singlequery/svc/generate_plus_spans.py",
                    "mutato/parser/dmo/spans/span_distance_check.py",
                    "mutato/parser/dmo/span_match_swapper.py"]
    metadata = {"mutatoCommit": subprocess.check_output(["git", "-C", str(original), "rev-parse", "HEAD"], text=True).strip(),
                "sourceSha256": {p: hashlib.sha256((original / p).read_bytes()).hexdigest() for p in source_files},
                "spacy": importlib.metadata.version("spacy"),
                "model": importlib.metadata.version("en-core-web-sm"),
                "lingpatlab": importlib.metadata.version("lingpatlab"),
                "distance": 4}
    (OUT / "reference.json").write_text(json.dumps({"reference": metadata, "profiles": profiles},
                                                  ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

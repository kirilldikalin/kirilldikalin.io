#!/usr/bin/env python3

import json
import math
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent

PUBLIC_PAGES = (
    "index.html",
    "algorithmic_atlas/index.html",
    "algorithmic_atlas/chapters/before-computers.html",
    "algorithmic_atlas/chapters/euclidean-algorithm.html",
    "algorithmic_atlas/chapters/turing-machine-transition.html",
    "algorithmic_atlas/chapters/input-size-and-cost.html",
    "algorithmic_atlas/chapters/asymptotic-estimates.html",
    "algorithmic_atlas/chapters/growth-rates.html",
    "algorithmic_atlas/chapters/sums-products-recurrences.html",
    "algorithmic_atlas/chapters/sets-relations-functions-logic.html",
    "algorithmic_atlas/chapters/proof-methods-induction.html",
    "algorithmic_atlas/chapters/correctness-invariants-termination.html",
    "algorithmic_atlas/chapters/combinatorics-counting.html",
    "algorithmic_atlas/chapters/probability-spaces.html",
    "algorithmic_atlas/chapters/random-variables-concentration.html",
    "algorithmic_atlas/chapters/computation-models.html",
    "algorithmic_atlas/chapters/analysis-cases.html",
    "algorithmic_atlas/chapters/polynomial-efficiency.html",
    "algorithmic_atlas/chapters/linear-data-structures.html",
    "algorithmic_atlas/chapters/hash-tables.html",
    "algorithmic_atlas/chapters/balanced-search-trees.html",
    "algorithmic_atlas/chapters/augmented-search-trees.html",
    "algorithmic_atlas/chapters/priority-queues-heaps.html",
    "algorithmic_atlas/chapters/disjoint-set-union.html",
    "algorithmic_atlas/chapters/b-trees-external-memory.html",
    "algorithmic_atlas/chapters/randomized-data-structures.html",
    "algorithmic_atlas/chapters/range-query-structures.html",
    "algorithmic_atlas/chapters/tries-radix-trees.html",
    "algorithmic_atlas/chapters/persistent-succinct-structures.html",
    "algorithmic_atlas/chapters/probabilistic-filters.html",
    "algorithmic_atlas/chapters/lsm-learned-indexes.html",
    "algorithmic_atlas/chapters/exhaustive-search.html",
    "algorithmic_atlas/chapters/divide-and-conquer.html",
    "algorithmic_atlas/chapters/sorting-and-lower-bounds.html",
    "algorithmic_atlas/chapters/selection-order-statistics.html",
    "algorithmic_atlas/chapters/greedy-algorithms.html",
    "algorithmic_atlas/chapters/matroids.html",
    "algorithmic_atlas/chapters/dynamic-programming.html",
    "algorithmic_atlas/chapters/advanced-dynamic-programming.html",
    "algorithmic_atlas/chapters/local-search.html",
    "algorithmic_atlas/chapters/meet-in-the-middle.html",
    "algorithmic_atlas/chapters/online-algorithms.html",
    "algorithmic_atlas/chapters/reductions-and-formulations.html",
    "algorithmic_atlas/chapters/linear-convex-optimization.html",
    "algorithmic_atlas/chapters/multiplicative-weights.html",
    "algorithmic_atlas/chapters/graph-language-traversals.html",
    "algorithmic_atlas/chapters/dag-topological-scc.html",
    "algorithmic_atlas/chapters/single-source-shortest-paths.html",
    "algorithmic_atlas/chapters/all-pairs-shortest-paths.html",
    "algorithmic_atlas/chapters/minimum-spanning-trees.html",
    "algorithmic_atlas/chapters/max-flow-min-cut.html",
    "algorithmic_atlas/chapters/circulations-min-cost-flow.html",
    "algorithmic_atlas/chapters/graph-matchings.html",
    "algorithmic_atlas/chapters/connectivity-cuts-network-design.html",
    "algorithmic_atlas/chapters/traveling-salesman-exact.html",
    "algorithmic_atlas/chapters/dynamic-graph-algorithms.html",
    "algorithmic_atlas/chapters/linear-algebra-for-graphs.html",
    "algorithmic_atlas/chapters/spectral-graph-algorithms.html",
    "algorithmic_atlas/chapters/parallel-distributed-graphs.html",
    "articles/myths_DE.html",
    "brain/main_brain.html",
    "brain/map_msk/map_msk.html",
    "brain/map_russia/map_russia.html",
    "brain/pi.html",
    "brain/pisano.html",
    "euler/euler.html",
    "euler/439.html",
    "euler/439/interactive/divisor-sum-explorer.html",
    "euler/579.html",
    "euler/579/interactive/lattice-cube-explorer.html",
    "euler/763.html",
    "euler/763/interactive/amoeba-layers-explorer.html",
    "euler/780.html",
    "euler/780/interactive/toriangulations-explorer.html",
    "euler/786.html",
    "euler/792.html",
    "euler/798.html",
    "euler/798/interactive/card-stacking-explorer.html",
    "euler/1003.html",
    "euler/1003/interactive/sad-integers-explorer.html",
    "euler/1007.html",
    "euler/1007/interactive/alternating-difference-explorer.html",
    "knowlege_base/iKnowledge_base.html",
    "translation_of_articles/translation_of_articles.html",
    "translation_of_articles/part_1/chapter_1/CFSFT.html",
    "translation_of_articles/part_1/chapter_1/One_Size_Fits_All.html",
)

REFERENCE_ATTRIBUTES = {
    "a": ("href",),
    "img": ("src",),
    "iframe": ("src",),
    "link": ("href",),
    "script": ("src",),
    "source": ("src", "srcset"),
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.references = []
        self.atlas_node_id = None
        self.atlas_blocks = []
        self.notation_ids = []
        self.visible_text = []
        self.display_math_outside_wrapper = []
        self.theory_text = []
        self.theory_formula_blocks = 0
        self.theory_proof_blocks = 0
        self.atlas_lab_minutes = None
        self.reading_time_outputs = 0
        self._ignored_text_depth = 0
        self._math_wrapper_depth = 0
        self._content_depth = 0
        self._theory_exclusion_depth = 0
        self._open_tags = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)

        if "id" in attributes:
            self.ids.append(attributes["id"])
        if tag == "body" and attributes.get("data-atlas-node-id"):
            self.atlas_node_id = attributes["data-atlas-node-id"]
            self.atlas_lab_minutes = attributes.get("data-atlas-lab-minutes")
        if "data-atlas-reading-time" in attributes:
            self.reading_time_outputs += 1
        if attributes.get("data-atlas-block"):
            self.atlas_blocks.append(attributes["data-atlas-block"])
        if attributes.get("data-notation-id"):
            self.notation_ids.append(attributes["data-notation-id"])
        if tag in {"script", "style"}:
            self._ignored_text_depth += 1
        classes = attributes.get("class", "").split()
        is_math_wrapper = "atlas-math" in classes
        is_content_root = "atlas-chapter-content" in classes
        content_active = self._content_depth > 0 or is_content_root
        excluded_block = attributes.get("data-atlas-block") in {
            "lab", "exercises", "sources"
        }
        is_theory_excluded = (
            is_math_wrapper
            or excluded_block
            or "atlas-block__label" in classes
            or "hidden" in attributes
        )
        if (
            content_active
            and self._theory_exclusion_depth == 0
            and is_math_wrapper
        ):
            self.theory_formula_blocks += 1
        if (
            content_active
            and self._theory_exclusion_depth == 0
            and (
                attributes.get("data-atlas-block") == "proof"
                or "data-reading-proof" in attributes
            )
        ):
            self.theory_proof_blocks += 1
        self._open_tags.append(
            (tag, is_math_wrapper, is_content_root, is_theory_excluded)
        )
        if is_math_wrapper:
            self._math_wrapper_depth += 1
        if is_content_root:
            self._content_depth += 1
        if is_theory_excluded:
            self._theory_exclusion_depth += 1

        for attribute in REFERENCE_ATTRIBUTES.get(tag, ()):
            value = attributes.get(attribute)
            if value:
                self.references.append((tag, attribute, value))

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self._ignored_text_depth:
            self._ignored_text_depth -= 1
        for index in range(len(self._open_tags) - 1, -1, -1):
            open_tag, _, _, _ = self._open_tags[index]
            if open_tag != tag:
                continue
            closed = self._open_tags[index:]
            del self._open_tags[index:]
            self._math_wrapper_depth -= sum(
                1 for _, is_wrapper, _, _ in closed if is_wrapper
            )
            self._content_depth -= sum(
                1 for _, _, is_content_root, _ in closed if is_content_root
            )
            self._theory_exclusion_depth -= sum(
                1 for _, _, _, is_excluded in closed if is_excluded
            )
            break

    def handle_data(self, data):
        if not self._ignored_text_depth and data.strip():
            self.visible_text.append(data)
            if self._content_depth and not self._theory_exclusion_depth:
                self.theory_text.append(data)
            self.notation_ids.extend(
                re.findall(
                    r"\\class\{atlas-notation-token notation-id-([a-z0-9-]+)\}",
                    data,
                )
            )
            if (
                self._math_wrapper_depth == 0
                and (r"\[" in data or r"\]" in data)
            ):
                self.display_math_outside_wrapper.append(data.strip()[:80])


def math_delimiter_errors(text):
    errors = []
    delimiter_pattern = re.compile(r"\\\(|\\\)|\\\[|\\\]|(?<!\\)\$\$|(?<!\\)\$")
    raw_command_pattern = re.compile(r"\\[A-Za-z]+")
    bare_command_pattern = re.compile(
        r"(?<![\\A-Za-z])"
        r"(class|operatorname|lfloor|rfloor|lceil|rceil|frac|Theta|Omega|"
        r"nleq|leq|geq|le|ge|lambda|pi|ldots|times|cdot|sqrt|infty|"
        r"mathbb|mathcal|varepsilon|Pr|Phi)"
        r"(?=[{_\s\\0-9A-Z(,;])"
    )
    mode = None
    previous_end = 0
    math_start = None

    def add_raw_commands(fragment, offset):
        for command in raw_command_pattern.finditer(fragment):
            errors.append(
                f"TeX command outside math at character "
                f"{offset + command.start()}: {command.group(0)}"
            )

    def add_bare_commands(fragment, offset):
        for command in bare_command_pattern.finditer(fragment):
            errors.append(
                f"possible TeX command without backslash at character "
                f"{offset + command.start()}: {command.group(1)}"
            )

    for delimiter in delimiter_pattern.finditer(text):
        token = delimiter.group(0)
        if mode is None:
            add_raw_commands(text[previous_end:delimiter.start()], previous_end)
            if token == r"\(":
                mode = ("inline", r"\)")
                math_start = delimiter.end()
            elif token == r"\[":
                mode = ("display", r"\]")
                math_start = delimiter.end()
            elif token == "$":
                mode = ("inline", "$")
                math_start = delimiter.end()
            elif token == "$$":
                mode = ("display", "$$")
                math_start = delimiter.end()
            else:
                errors.append(
                    f"closing delimiter without opener at character {delimiter.start()}"
                )
        else:
            expected = mode[1]
            if token != expected:
                errors.append(
                    f"expected {expected} before {token} at character {delimiter.start()}"
                )
            else:
                add_bare_commands(text[math_start:delimiter.start()], math_start)
                mode = None
                math_start = None
                previous_end = delimiter.end()

    if mode is None:
        add_raw_commands(text[previous_end:], previous_end)
    else:
        errors.append(f"unclosed {mode[0]} math delimiter")
    return errors


def parse_page(path):
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def count_words(text):
    return len(
        re.findall(
            r"[^\W_]+(?:[-‑‒–—'][^\W_]+)*",
            text,
            re.UNICODE,
        )
    )


def reading_metrics(parser):
    words = count_words(" ".join(parser.theory_text))
    formulas = parser.theory_formula_blocks
    proofs = parser.theory_proof_blocks
    minutes = math.ceil(words / 180 + 0.35 * formulas + 0.75 * proofs)
    return {
        "words": words,
        "formulaBlocks": formulas,
        "proofBlocks": proofs,
        "theoryMinutes": minutes,
    }


def local_target(source, value):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None

    if value.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None

    decoded_path = unquote(parsed.path)
    if not decoded_path:
        target = source
    elif decoded_path.startswith("/"):
        target = ROOT / decoded_path.lstrip("/")
    else:
        target = source.parent / decoded_path

    return target.resolve(), unquote(parsed.fragment)


def atlas_route_path(route):
    if not isinstance(route, str) or not route.startswith("./"):
        return None
    return (ROOT / "algorithmic_atlas" / route[2:]).resolve()


def validate_atlas(errors, parsed_pages):
    graph_path = ROOT / "algorithmic_atlas/data/atlas-graph.json"
    notation_path = ROOT / "algorithmic_atlas/data/math-notations.json"
    try:
        graph = json.loads(graph_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"algorithmic_atlas/data/atlas-graph.json: {error}")
        return

    try:
        registry = json.loads(notation_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"algorithmic_atlas/data/math-notations.json: {error}")
        return

    nodes = graph.get("nodes", [])
    node_by_id = {
        node.get("id"): node
        for node in nodes
        if isinstance(node, dict) and isinstance(node.get("id"), str)
    }
    published_routes = set()
    chapter_parsers = {}

    for node in nodes:
        node_id = node.get("id", "<missing>")
        publication = node.get("publication")
        features = node.get("features")
        if not isinstance(features, dict):
            errors.append(f"atlas node {node_id}: features must be an object")
            continue

        if publication == "planned":
            if node.get("route") is not None:
                errors.append(f"atlas node {node_id}: planned node must not have a route")
            if any(features.get(name) for name in ("proof", "interactive", "exercises")):
                errors.append(
                    f"atlas node {node_id}: planned node advertises missing content"
                )
            continue

        if publication != "published":
            errors.append(f"atlas node {node_id}: unknown publication state {publication}")
            continue

        target = atlas_route_path(node.get("route"))
        if target is None:
            errors.append(f"atlas node {node_id}: published route must be local")
            continue
        try:
            target.relative_to(ROOT / "algorithmic_atlas")
        except ValueError:
            errors.append(f"atlas node {node_id}: route escapes the atlas")
            continue
        if target in published_routes:
            errors.append(f"atlas node {node_id}: duplicate published route")
        published_routes.add(target)
        if not target.is_file():
            errors.append(f"atlas node {node_id}: published page does not exist")
            continue

        parser = parsed_pages.get(target)
        if parser is None:
            parser = parse_page(target)
            parsed_pages[target] = parser
        chapter_parsers[node_id] = parser
        if parser.atlas_node_id != node_id:
            errors.append(
                f"{target.relative_to(ROOT)}: body data-atlas-node-id "
                f"must be {node_id}"
            )

        actual_features = {
            "proof": "proof" in parser.atlas_blocks,
            "interactive": "lab" in parser.atlas_blocks,
            "exercises": "exercises" in parser.atlas_blocks,
        }
        for feature, actual in actual_features.items():
            if features.get(feature) is not actual:
                errors.append(
                    f"atlas node {node_id}: features.{feature}={features.get(feature)!r} "
                    f"but page content is {actual}"
                )

        declared_reading = node.get("reading")
        if declared_reading is not None:
            actual_reading = reading_metrics(parser)
            for field, actual in actual_reading.items():
                if declared_reading.get(field) != actual:
                    errors.append(
                        f"atlas node {node_id}: reading.{field}="
                        f"{declared_reading.get(field)!r} but page content is {actual}"
                    )
            if parser.reading_time_outputs != 1:
                errors.append(
                    f"atlas node {node_id}: page needs one computed reading-time output"
                )
            if str(declared_reading.get("labMinutes")) != parser.atlas_lab_minutes:
                errors.append(
                    f"atlas node {node_id}: page laboratory time does not match graph"
                )

        visible_text = " ".join(parser.visible_text)
        for math_error in math_delimiter_errors(visible_text):
            errors.append(f"{target.relative_to(ROOT)}: {math_error}")
        for snippet in parser.display_math_outside_wrapper:
            errors.append(
                f"{target.relative_to(ROOT)}: display math is outside "
                f".atlas-math: {snippet}"
            )

    entries = registry.get("entries")
    if registry.get("schemaVersion") != 1 or not isinstance(entries, list):
        errors.append("math notation registry: unsupported schema")
        return

    notation_by_id = {}
    for entry in entries:
        notation_id = entry.get("id") if isinstance(entry, dict) else None
        if not notation_id:
            errors.append("math notation registry: entry id is required")
            continue
        if notation_id in notation_by_id:
            errors.append(f"math notation registry: duplicate id {notation_id}")
            continue
        notation_by_id[notation_id] = entry

        if entry.get("scope") not in {"global", "local"}:
            errors.append(f"math notation {notation_id}: invalid scope")
        if entry.get("scope") == "local" and entry.get("chapterId") not in node_by_id:
            errors.append(f"math notation {notation_id}: unknown local chapter")

        definition = entry.get("firstDefinition")
        if not isinstance(definition, dict):
            errors.append(f"math notation {notation_id}: firstDefinition is required")
            continue
        definition_node = node_by_id.get(definition.get("chapterId"))
        if not definition_node or definition_node.get("publication") != "published":
            errors.append(f"math notation {notation_id}: definition chapter is unavailable")
            continue
        definition_parser = chapter_parsers.get(definition.get("chapterId"))
        if (
            definition_parser is None
            or definition.get("anchor") not in definition_parser.ids
        ):
            errors.append(f"math notation {notation_id}: definition anchor is missing")

    for node_id, parser in chapter_parsers.items():
        for notation_id in parser.notation_ids:
            entry = notation_by_id.get(notation_id)
            if entry is None:
                errors.append(f"atlas chapter {node_id}: unknown notation {notation_id}")
            elif entry.get("scope") == "local" and entry.get("chapterId") != node_id:
                errors.append(
                    f"atlas chapter {node_id}: local notation {notation_id} is out of scope"
                )


def print_atlas_metrics():
    graph = json.loads(
        (ROOT / "algorithmic_atlas/data/atlas-graph.json").read_text(
            encoding="utf-8"
        )
    )
    metrics = {}
    for node in graph.get("nodes", []):
        target = atlas_route_path(node.get("route"))
        if node.get("publication") != "published" or not target or not target.is_file():
            continue
        metrics[node["id"]] = reading_metrics(parse_page(target))
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


def main():
    errors = []
    parsed_pages = {}

    for relative_path in PUBLIC_PAGES:
        page = ROOT / relative_path
        if not page.is_file():
            errors.append(f"{relative_path}: public page does not exist")
            continue

        parser = parse_page(page)
        parsed_pages[page.resolve()] = parser

        duplicate_ids = sorted({value for value in parser.ids if parser.ids.count(value) > 1})
        for duplicate_id in duplicate_ids:
            errors.append(f"{relative_path}: duplicate id #{duplicate_id}")

    for source, parser in list(parsed_pages.items()):
        source_name = source.relative_to(ROOT)

        for tag, attribute, value in parser.references:
            if attribute == "srcset":
                values = [item.strip().split()[0] for item in value.split(",")]
            else:
                values = [value]

            for reference in values:
                target_data = local_target(source, reference)
                if target_data is None:
                    continue

                target, fragment = target_data
                try:
                    target.relative_to(ROOT)
                except ValueError:
                    errors.append(
                        f"{source_name}: {tag}[{attribute}] escapes the repository: {reference}"
                    )
                    continue

                if not target.exists():
                    errors.append(
                        f"{source_name}: {tag}[{attribute}] target does not exist: {reference}"
                    )
                    continue

                if fragment and target.suffix.lower() in {".html", ".htm"}:
                    target_parser = parsed_pages.get(target)
                    if target_parser is None:
                        target_parser = parse_page(target)
                        parsed_pages[target] = target_parser

                    if fragment not in target_parser.ids:
                        errors.append(
                            f"{source_name}: anchor #{fragment} does not exist in "
                            f"{target.relative_to(ROOT)}"
                        )

    validate_atlas(errors, parsed_pages)

    if errors:
        print("Site integrity check failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    print(
        f"Site integrity check passed: {len(parsed_pages)} HTML pages and their local references."
    )


if __name__ == "__main__":
    if "--atlas-metrics" in sys.argv[1:]:
        print_atlas_metrics()
    else:
        main()

#!/usr/bin/env python3
"""Build the static Central Administrative Okrug street quiz dataset.

The script intentionally uses only the Python standard library.  Live OSM data
is fetched from Overpass once during development and converted into a compact,
deterministic JSON file for GitHub Pages.  Supplying --raw-dir makes the source
responses reusable; --offline then guarantees that no network request is made.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "cao-map.json"
DEFAULT_OVERRIDES = ROOT / "data" / "street_overrides.json"
DEFAULT_COLLISIONS = ROOT / "data" / "street_alias_collisions.json"

DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = (
    "kirilldikalin.io-moscow-street-quiz/1.0 "
    "(+https://kirilldikalin.github.io/kirilldikalin.io/)"
)

CAO_WIKIDATA = "Q190412"
EXPECTED_DISTRICTS = {
    "Q626920": ("arbat", "Арбат"),
    "Q1669860": ("basmanny", "Басманный"),
    "Q862107": ("zamoskvorechye", "Замоскворечье"),
    "Q2626343": ("krasnoselsky", "Красносельский"),
    "Q2626320": ("meshchansky", "Мещанский"),
    "Q2320761": ("presnensky", "Пресненский"),
    "Q942798": ("tagansky", "Таганский"),
    "Q2710104": ("tverskoy", "Тверской"),
    "Q862100": ("khamovniki", "Хамовники"),
    "Q2704875": ("yakimanka", "Якиманка"),
}
DISTRICT_ORDER = [
    "arbat",
    "basmanny",
    "zamoskvorechye",
    "krasnoselsky",
    "meshchansky",
    "presnensky",
    "tagansky",
    "tverskoy",
    "khamovniki",
    "yakimanka",
]

CORE_HIGHWAYS = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "pedestrian",
}
AUXILIARY_HIGHWAYS = {
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
    "service",
    "footway",
}
ALIAS_TAGS = ("alt_name", "official_name", "short_name", "loc_name")
STREET_TYPE_WORDS = (
    "улица",
    "переулок",
    "площадь",
    "бульвар",
    "проспект",
    "набережная",
    "проезд",
    "шоссе",
    "тупик",
    "аллея",
    "линия",
    "просек",
    "мост",
    "путепровод",
    "эстакада",
    "тоннель",
    "тракт",
    "спуск",
)
QUIZ_KINDS = {
    "улица",
    "переулок",
    "проспект",
    "бульвар",
    "набережная",
    "проезд",
    "площадь",
    "шоссе",
    "тупик",
    "аллея",
    "линия",
    "просек",
}

SIMPLIFY_TOLERANCE_METERS = 5.0
MIN_STREET_LENGTH_METERS = 20.0
MIN_DISTRICT_OVERLAP_METERS = 2.0
COORDINATE_PRECISION = 6
EPSILON = 1e-11
EARTH_RADIUS_METERS = 6_371_008.8
REFERENCE_LATITUDE = math.radians(55.75)
METERS_PER_DEGREE_LAT = math.pi * EARTH_RADIUS_METERS / 180.0
METERS_PER_DEGREE_LON = METERS_PER_DEGREE_LAT * math.cos(REFERENCE_LATITUDE)

Point = tuple[float, float]
Line = list[Point]
Ring = list[Point]
MultiPolygon = list[list[Ring]]


DISCOVERY_QUERY = f"""
[out:json][timeout:120];
rel
  ["boundary"="administrative"]
  ["admin_level"="5"]
  ["wikidata"="{CAO_WIKIDATA}"]
  ->.cao;
.cao map_to_area ->.cao_area;
(
  .cao;
  rel(area.cao_area)
    ["boundary"="administrative"]
    ["admin_level"="8"];
);
out tags qt;
""".strip()

class BuildError(RuntimeError):
    """A source-data or generated-data invariant failed."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--overrides", type=Path, default=DEFAULT_OVERRIDES)
    parser.add_argument("--collisions-output", type=Path, default=DEFAULT_COLLISIONS)
    parser.add_argument(
        "--raw-dir",
        type=Path,
        help="Cache discovery/boundaries/features Overpass responses here.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Replace cached responses in --raw-dir.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Require all responses to exist in --raw-dir; never use the network.",
    )
    parser.add_argument(
        "--validate-only",
        type=Path,
        metavar="JSON",
        help="Validate an existing cao-map.json without rebuilding it.",
    )
    return parser.parse_args()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BuildError(f"Required file is missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BuildError(f"Invalid JSON in {path}: {exc}") from exc


def write_json(path: Path, value: Any, *, compact: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=False,
        )
    else:
        text = json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=False,
        )
    path.write_text(text + "\n", encoding="utf-8")


def fetch_overpass(endpoint: str, query: str, attempts: int = 4) -> dict[str, Any]:
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json",
        },
        method="POST",
    )
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=420) as response:
                result = json.load(response)
            if not isinstance(result, dict) or "elements" not in result:
                raise BuildError("Overpass returned JSON without an elements array")
            return result
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            json.JSONDecodeError,
        ) as exc:
            last_error = exc
            if attempt == attempts:
                break
            delay = attempt * 3
            print(
                f"Overpass attempt {attempt}/{attempts} failed: {exc}; "
                f"retrying in {delay}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    raise BuildError(f"Overpass request failed after {attempts} attempts: {last_error}")


def cached_query(
    *,
    name: str,
    query: str,
    raw_dir: Path,
    endpoint: str,
    refresh: bool,
    offline: bool,
) -> dict[str, Any]:
    path = raw_dir / f"{name}.json"
    query_path = raw_dir / f"{name}.overpassql"
    cached_query_text = (
        query_path.read_text(encoding="utf-8").strip()
        if query_path.exists()
        else None
    )
    if path.exists() and not refresh and cached_query_text == query.strip():
        print(f"Using cached {path}")
        return read_json(path)
    if path.exists() and not refresh and offline:
        raise BuildError(
            f"Cached query does not match the builder for {name}: {query_path}"
        )
    if offline:
        raise BuildError(f"Offline source response is missing: {path}")
    print(f"Fetching {name} from {endpoint}")
    result = fetch_overpass(endpoint, query)
    write_json(path, result, compact=True)
    query_path.write_text(query.strip() + "\n", encoding="utf-8")
    return result


def timestamp_from_response(response: dict[str, Any]) -> str:
    timestamp = response.get("osm3s", {}).get("timestamp_osm_base")
    if not isinstance(timestamp, str) or not timestamp:
        raise BuildError("Overpass response has no osm3s.timestamp_osm_base")
    return timestamp


def discover_relations(
    response: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    relations = [
        element
        for element in response.get("elements", [])
        if element.get("type") == "relation"
    ]
    cao = [
        relation
        for relation in relations
        if relation.get("tags", {}).get("wikidata") == CAO_WIKIDATA
        and relation.get("tags", {}).get("admin_level") == "5"
    ]
    if len(cao) != 1:
        raise BuildError(f"Expected one CAO relation, got {len(cao)}")

    districts = [
        relation
        for relation in relations
        if relation.get("tags", {}).get("admin_level") == "8"
    ]
    qids = [relation.get("tags", {}).get("wikidata") for relation in districts]
    if len(districts) != 10:
        raise BuildError(f"Expected 10 CAO districts, got {len(districts)}")
    if len(set(qids)) != len(qids):
        raise BuildError("District Wikidata IDs are missing or duplicated")
    unknown = sorted(set(qids) - set(EXPECTED_DISTRICTS))
    missing = sorted(set(EXPECTED_DISTRICTS) - set(qids))
    if unknown or missing:
        raise BuildError(
            f"Unexpected district set; unknown={unknown or 'none'}, "
            f"missing={missing or 'none'}"
        )
    return cao[0], districts


def boundaries_query(relation_ids: Iterable[int]) -> str:
    ids = ",".join(str(value) for value in sorted(relation_ids))
    return (
        "[out:json][timeout:180];\n"
        f"rel(id:{ids});\n"
        "out body geom qt;"
    )


def features_query(bbox: Sequence[float]) -> str:
    west, south, east, north = bbox
    overpass_bbox = f"{south:.7f},{west:.7f},{north:.7f},{east:.7f}"
    return (
        "[out:json][timeout:300];\n"
        "(\n"
        f'  way({overpass_bbox})["highway"]["name"];\n'
        f'  way({overpass_bbox})["waterway"="river"]["name"="Москва"];\n'
        ");\n"
        "out body geom qt;"
    )


def overpass_geometry(member: dict[str, Any]) -> Line:
    geometry = member.get("geometry")
    if not isinstance(geometry, list) or len(geometry) < 2:
        return []
    line: Line = []
    for item in geometry:
        if not isinstance(item, dict) or "lon" not in item or "lat" not in item:
            raise BuildError(f"Invalid member geometry in way {member.get('ref')}")
        line.append((float(item["lon"]), float(item["lat"])))
    return dedupe_adjacent(line)


def point_key(point: Point) -> tuple[int, int]:
    return (round(point[0] * 10**7), round(point[1] * 10**7))


def same_point(left: Point, right: Point) -> bool:
    return point_key(left) == point_key(right)


def dedupe_adjacent(points: Sequence[Point]) -> Line:
    result: Line = []
    for point in points:
        if not result or not same_point(result[-1], point):
            result.append(point)
    return result


def stitch_rings(lines: list[Line], relation_name: str, role: str) -> list[Ring]:
    pending = [line[:] for line in lines if len(line) >= 2]
    rings: list[Ring] = []
    while pending:
        ring = pending.pop(0)
        while not same_point(ring[0], ring[-1]):
            match_index = None
            reverse = False
            prepend = False
            for index, candidate in enumerate(pending):
                if same_point(ring[-1], candidate[0]):
                    match_index = index
                    break
                if same_point(ring[-1], candidate[-1]):
                    match_index = index
                    reverse = True
                    break
                if same_point(ring[0], candidate[-1]):
                    match_index = index
                    prepend = True
                    break
                if same_point(ring[0], candidate[0]):
                    match_index = index
                    reverse = True
                    prepend = True
                    break
            if match_index is None:
                raise BuildError(
                    f"Cannot close {role} ring for {relation_name}; "
                    f"{len(pending) + 1} fragments remain"
                )
            candidate = pending.pop(match_index)
            if reverse:
                candidate.reverse()
            if prepend:
                ring = candidate[:-1] + ring
            else:
                ring.extend(candidate[1:])
        ring = dedupe_adjacent(ring)
        if len(ring) < 4:
            raise BuildError(f"Degenerate {role} ring for {relation_name}")
        if not same_point(ring[0], ring[-1]):
            ring.append(ring[0])
        rings.append(ring)
    return rings


def point_on_segment(point: Point, start: Point, end: Point) -> bool:
    cross = (
        (point[0] - start[0]) * (end[1] - start[1])
        - (point[1] - start[1]) * (end[0] - start[0])
    )
    if abs(cross) > EPSILON:
        return False
    return (
        min(start[0], end[0]) - EPSILON
        <= point[0]
        <= max(start[0], end[0]) + EPSILON
        and min(start[1], end[1]) - EPSILON
        <= point[1]
        <= max(start[1], end[1]) + EPSILON
    )


def point_in_ring(point: Point, ring: Ring) -> bool:
    inside = False
    for start, end in zip(ring, ring[1:]):
        if point_on_segment(point, start, end):
            return True
        if (start[1] > point[1]) == (end[1] > point[1]):
            continue
        x_intersection = (
            (end[0] - start[0])
            * (point[1] - start[1])
            / (end[1] - start[1])
            + start[0]
        )
        if point[0] < x_intersection:
            inside = not inside
    return inside


def point_in_multipolygon(point: Point, polygons: MultiPolygon) -> bool:
    for polygon in polygons:
        if not polygon or not point_in_ring(point, polygon[0]):
            continue
        if any(point_in_ring(point, hole) for hole in polygon[1:]):
            continue
        return True
    return False


def relation_to_multipolygon(relation: dict[str, Any]) -> MultiPolygon:
    tags = relation.get("tags", {})
    name = tags.get("name") or f"relation {relation.get('id')}"
    lines_by_role: dict[str, list[Line]] = {"outer": [], "inner": []}
    for member in relation.get("members", []):
        if member.get("type") != "way":
            continue
        role = member.get("role") or "outer"
        if role not in lines_by_role:
            continue
        line = overpass_geometry(member)
        if line:
            lines_by_role[role].append(line)
    if not lines_by_role["outer"]:
        raise BuildError(f"No outer way geometry for {name}")

    outers = stitch_rings(lines_by_role["outer"], name, "outer")
    inners = stitch_rings(lines_by_role["inner"], name, "inner")
    polygons: MultiPolygon = [[outer] for outer in outers]
    for inner in inners:
        point = inner[0]
        candidates = [
            index
            for index, polygon in enumerate(polygons)
            if point_in_ring(point, polygon[0])
        ]
        if not candidates:
            raise BuildError(f"Inner ring is outside every outer ring for {name}")
        polygons[candidates[0]].append(inner)
    return polygons


def relation_geometry_by_id(
    response: dict[str, Any],
) -> dict[int, dict[str, Any]]:
    result = {}
    for element in response.get("elements", []):
        if element.get("type") != "relation":
            continue
        osm_id = int(element["id"])
        if osm_id in result:
            raise BuildError(f"Duplicate relation {osm_id} in boundary response")
        result[osm_id] = element
    return result


def project(point: Point) -> Point:
    return (
        point[0] * METERS_PER_DEGREE_LON,
        point[1] * METERS_PER_DEGREE_LAT,
    )


def distance_meters(start: Point, end: Point) -> float:
    start_xy = project(start)
    end_xy = project(end)
    return math.hypot(end_xy[0] - start_xy[0], end_xy[1] - start_xy[1])


def line_length_meters(line: Sequence[Point]) -> float:
    return sum(distance_meters(start, end) for start, end in zip(line, line[1:]))


def lines_length_meters(lines: Iterable[Sequence[Point]]) -> float:
    return sum(line_length_meters(line) for line in lines)


def bbox_for_points(points: Iterable[Point]) -> list[float]:
    points = list(points)
    if not points:
        raise BuildError("Cannot calculate a bbox for empty geometry")
    return [
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    ]


def bbox_for_multipolygon(polygons: MultiPolygon) -> list[float]:
    return bbox_for_points(
        point for polygon in polygons for ring in polygon for point in ring
    )


def bbox_for_lines(lines: Iterable[Sequence[Point]]) -> list[float]:
    return bbox_for_points(point for line in lines for point in line)


def bboxes_intersect(left: Sequence[float], right: Sequence[float]) -> bool:
    return not (
        left[2] < right[0]
        or left[0] > right[2]
        or left[3] < right[1]
        or left[1] > right[3]
    )


class PolygonClipper:
    def __init__(self, polygons: MultiPolygon) -> None:
        self.polygons = polygons
        self.bbox = bbox_for_multipolygon(polygons)
        self.edges: list[tuple[Point, Point, list[float]]] = []
        for polygon in polygons:
            for ring in polygon:
                for start, end in zip(ring, ring[1:]):
                    self.edges.append(
                        (start, end, bbox_for_points((start, end)))
                    )

    def clip_lines(self, lines: Iterable[Sequence[Point]]) -> list[Line]:
        clipped: list[Line] = []
        for line in lines:
            if len(line) < 2:
                continue
            if not bboxes_intersect(bbox_for_points(line), self.bbox):
                continue
            current: Line = []
            for start, end in zip(line, line[1:]):
                pieces = self._clip_segment(start, end)
                if not pieces:
                    if len(current) >= 2:
                        clipped.append(current)
                    current = []
                    continue
                for piece_start, piece_end in pieces:
                    if current and same_point(current[-1], piece_start):
                        if not same_point(current[-1], piece_end):
                            current.append(piece_end)
                    else:
                        if len(current) >= 2:
                            clipped.append(current)
                        current = [piece_start, piece_end]
            if len(current) >= 2:
                clipped.append(current)
        return [dedupe_adjacent(line) for line in clipped if len(line) >= 2]

    def _clip_segment(self, start: Point, end: Point) -> list[tuple[Point, Point]]:
        if same_point(start, end):
            return []
        segment_bbox = bbox_for_points((start, end))
        parameters = [0.0, 1.0]
        direction = (end[0] - start[0], end[1] - start[1])
        for edge_start, edge_end, edge_bbox in self.edges:
            if not bboxes_intersect(segment_bbox, edge_bbox):
                continue
            edge_direction = (
                edge_end[0] - edge_start[0],
                edge_end[1] - edge_start[1],
            )
            denominator = cross(direction, edge_direction)
            delta = (edge_start[0] - start[0], edge_start[1] - start[1])
            if abs(denominator) <= EPSILON:
                continue
            t = cross(delta, edge_direction) / denominator
            u = cross(delta, direction) / denominator
            if -EPSILON <= t <= 1.0 + EPSILON and -EPSILON <= u <= 1.0 + EPSILON:
                parameters.append(max(0.0, min(1.0, t)))
        parameters = sorted_unique(parameters)
        pieces: list[tuple[Point, Point]] = []
        for left, right in zip(parameters, parameters[1:]):
            if right - left <= EPSILON:
                continue
            midpoint = interpolate(start, end, (left + right) / 2)
            if point_in_multipolygon(midpoint, self.polygons):
                pieces.append(
                    (interpolate(start, end, left), interpolate(start, end, right))
                )
        return pieces


def cross(left: Point, right: Point) -> float:
    return left[0] * right[1] - left[1] * right[0]


def interpolate(start: Point, end: Point, parameter: float) -> Point:
    return (
        start[0] + (end[0] - start[0]) * parameter,
        start[1] + (end[1] - start[1]) * parameter,
    )


def sorted_unique(values: Iterable[float]) -> list[float]:
    result: list[float] = []
    for value in sorted(values):
        if not result or abs(value - result[-1]) > EPSILON:
            result.append(value)
    return result


def perpendicular_distance_meters(point: Point, start: Point, end: Point) -> float:
    point_xy = project(point)
    start_xy = project(start)
    end_xy = project(end)
    direction = (end_xy[0] - start_xy[0], end_xy[1] - start_xy[1])
    denominator = direction[0] ** 2 + direction[1] ** 2
    if denominator == 0:
        return math.hypot(point_xy[0] - start_xy[0], point_xy[1] - start_xy[1])
    parameter = (
        (point_xy[0] - start_xy[0]) * direction[0]
        + (point_xy[1] - start_xy[1]) * direction[1]
    ) / denominator
    projected = (
        start_xy[0] + parameter * direction[0],
        start_xy[1] + parameter * direction[1],
    )
    return math.hypot(point_xy[0] - projected[0], point_xy[1] - projected[1])


def simplify_line(line: Sequence[Point], tolerance_meters: float) -> Line:
    if len(line) <= 2:
        return list(line)
    max_distance = -1.0
    max_index = 0
    for index in range(1, len(line) - 1):
        distance = perpendicular_distance_meters(
            line[index], line[0], line[-1]
        )
        if distance > max_distance:
            max_distance = distance
            max_index = index
    if max_distance <= tolerance_meters:
        return [line[0], line[-1]]
    left = simplify_line(line[: max_index + 1], tolerance_meters)
    right = simplify_line(line[max_index:], tolerance_meters)
    return left[:-1] + right


def simplify_ring(ring: Ring, tolerance_meters: float) -> Ring:
    if len(ring) <= 4:
        return ring[:]
    open_ring = ring[:-1] if same_point(ring[0], ring[-1]) else ring[:]
    # Split a closed ring at the point farthest from the first one so the
    # Douglas-Peucker baseline is non-degenerate.
    start_xy = project(open_ring[0])
    split_index = max(
        range(1, len(open_ring)),
        key=lambda index: math.hypot(
            project(open_ring[index])[0] - start_xy[0],
            project(open_ring[index])[1] - start_xy[1],
        ),
    )
    first = simplify_line(open_ring[: split_index + 1], tolerance_meters)
    second = simplify_line(
        open_ring[split_index:] + [open_ring[0]], tolerance_meters
    )
    simplified = dedupe_adjacent(first[:-1] + second)
    if len(simplified) < 3:
        return ring[:]
    if not same_point(simplified[0], simplified[-1]):
        simplified.append(simplified[0])
    if len(simplified) < 4:
        return ring[:]
    return simplified


def simplify_multipolygon(
    polygons: MultiPolygon, tolerance_meters: float
) -> MultiPolygon:
    return [
        [simplify_ring(ring, tolerance_meters) for ring in polygon]
        for polygon in polygons
    ]


def merge_connected_lines(lines: Iterable[Line]) -> list[Line]:
    pending = [dedupe_adjacent(line) for line in lines if len(line) >= 2]
    merged: list[Line] = []
    while pending:
        current = pending.pop()
        changed = True
        while changed:
            changed = False
            for index, candidate in enumerate(pending):
                if same_point(current[-1], candidate[0]):
                    current.extend(candidate[1:])
                elif same_point(current[-1], candidate[-1]):
                    current.extend(reversed(candidate[:-1]))
                elif same_point(current[0], candidate[-1]):
                    current = candidate[:-1] + current
                elif same_point(current[0], candidate[0]):
                    current = list(reversed(candidate[1:])) + current
                else:
                    continue
                pending.pop(index)
                changed = True
                break
        merged.append(dedupe_adjacent(current))
    return merged


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.casefold().replace("ё", "е")
    value = re.sub(r"[‐‑‒–—−]", "-", value)
    value = value.replace("«", "").replace("»", "").replace('"', "")
    value = re.sub(r"\s+", " ", value).strip(" .,\t\n\r")
    return value


def display_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def split_tag_names(value: Any) -> list[str]:
    if not isinstance(value, str):
        return []
    return [
        display_text(part)
        for part in re.split(r"\s*;\s*", value)
        if display_text(part)
    ]


def stripped_type_alias(value: str) -> str | None:
    normalized = normalize_text(value)
    words = "|".join(re.escape(word) for word in STREET_TYPE_WORDS)
    patterns = (
        rf"^(?:{words})\s+(.+)$",
        rf"^(.+?)\s+(?:{words})$",
    )
    for pattern in patterns:
        match = re.match(pattern, normalized)
        if match:
            candidate = match.group(1).strip()
            if len(candidate) >= 2:
                return candidate
    return None


def kind_from_name(value: str) -> str:
    normalized = normalize_text(value)
    for kind in STREET_TYPE_WORDS:
        if re.search(rf"(?:^|\s){re.escape(kind)}(?:$|\s)", normalized):
            return kind
    return "дорога"


def street_id(normalized_name: str) -> str:
    digest = hashlib.sha1(normalized_name.encode("utf-8")).hexdigest()[:12]
    return f"street-{digest}"


def quantize_number(value: float) -> float:
    return round(value, COORDINATE_PRECISION)


def quantize_line(line: Sequence[Point]) -> list[list[float]]:
    return [[quantize_number(point[0]), quantize_number(point[1])] for point in line]


def quantize_multipolygon(polygons: MultiPolygon) -> list[list[list[list[float]]]]:
    return [
        [quantize_line(ring) for ring in polygon]
        for polygon in polygons
    ]


def quantize_bbox(bbox: Sequence[float]) -> list[float]:
    return [quantize_number(value) for value in bbox]


def feature_lines(element: dict[str, Any]) -> list[Line]:
    geometry = element.get("geometry")
    if not isinstance(geometry, list) or len(geometry) < 2:
        return []
    line = [
        (float(item["lon"]), float(item["lat"]))
        for item in geometry
        if isinstance(item, dict) and "lon" in item and "lat" in item
    ]
    line = dedupe_adjacent(line)
    return [line] if len(line) >= 2 else []


def load_overrides(path: Path) -> dict[str, Any]:
    value = read_json(path)
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise BuildError(f"{path} must contain schemaVersion=1")
    expected = {"schemaVersion", "excludeNames", "forceIncludeNames", "rename", "aliases"}
    unknown = set(value) - expected
    if unknown:
        raise BuildError(f"Unknown override keys: {sorted(unknown)}")
    for key in ("excludeNames", "forceIncludeNames"):
        if not isinstance(value.get(key), list):
            raise BuildError(f"Override {key} must be an array")
    for key in ("rename", "aliases"):
        if not isinstance(value.get(key), dict):
            raise BuildError(f"Override {key} must be an object")
    if not all(isinstance(item, str) for item in value["excludeNames"]):
        raise BuildError("excludeNames must contain only strings")
    if not all(isinstance(item, str) for item in value["forceIncludeNames"]):
        raise BuildError("forceIncludeNames must contain only strings")
    if not all(
        isinstance(key, str) and isinstance(item, str)
        for key, item in value["rename"].items()
    ):
        raise BuildError("rename must map strings to strings")
    if not all(
        isinstance(key, str)
        and isinstance(item, list)
        and all(isinstance(alias, str) for alias in item)
        for key, item in value["aliases"].items()
    ):
        raise BuildError("aliases must map strings to arrays of strings")
    return value


def source_name_after_overrides(
    source_name: str, rename: dict[str, str]
) -> str:
    normalized = normalize_text(source_name)
    rename_by_normalized = {
        normalize_text(old): display_text(new) for old, new in rename.items()
    }
    return rename_by_normalized.get(normalized, display_text(source_name))


def build_districts(
    discovered: list[dict[str, Any]],
    boundary_relations: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, PolygonClipper]]:
    districts: list[dict[str, Any]] = []
    clippers: dict[str, PolygonClipper] = {}
    for relation in discovered:
        tags = relation["tags"]
        qid = tags["wikidata"]
        district_id, display_name = EXPECTED_DISTRICTS[qid]
        osm_id = int(relation["id"])
        geometry_relation = boundary_relations.get(osm_id)
        if not geometry_relation:
            raise BuildError(f"Boundary geometry is missing for district {osm_id}")
        full_geometry = relation_to_multipolygon(geometry_relation)
        clippers[district_id] = PolygonClipper(full_geometry)
        simplified = simplify_multipolygon(
            full_geometry, SIMPLIFY_TOLERANCE_METERS
        )
        districts.append(
            {
                "id": district_id,
                "name": display_name,
                "osmRelationId": osm_id,
                "wikidata": qid,
                "bbox": quantize_bbox(bbox_for_multipolygon(full_geometry)),
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": quantize_multipolygon(simplified),
                },
            }
        )
    order = {district_id: index for index, district_id in enumerate(DISTRICT_ORDER)}
    districts.sort(key=lambda item: order[item["id"]])
    return districts, clippers


def build_streets(
    response: dict[str, Any],
    cao_clipper: PolygonClipper,
    district_clippers: dict[str, PolygonClipper],
    overrides: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, int]]:
    excluded = {normalize_text(name) for name in overrides["excludeNames"]}
    forced = {normalize_text(name) for name in overrides["forceIncludeNames"]}
    groups: dict[str, dict[str, Any]] = {}
    auxiliary: list[dict[str, Any]] = []
    counters: dict[str, int] = defaultdict(int)

    for element in response.get("elements", []):
        tags = element.get("tags", {})
        highway = tags.get("highway")
        source_name = tags.get("name")
        if element.get("type") != "way" or not highway or not source_name:
            continue
        counters["sourceWayCount"] += 1
        canonical_name = source_name_after_overrides(source_name, overrides["rename"])
        key = normalize_text(canonical_name)
        if key in excluded:
            counters["excludedOverrideWayCount"] += 1
            continue
        raw_lines = feature_lines(element)
        if not raw_lines:
            counters["emptySourceWayCount"] += 1
            continue

        is_core = highway in CORE_HIGHWAYS or key in forced
        if not is_core:
            if highway in AUXILIARY_HIGHWAYS:
                auxiliary.append(element)
            else:
                counters["excludedHighwayWayCount"] += 1
            continue

        clipped = cao_clipper.clip_lines(raw_lines)
        if not clipped:
            counters["outsideCaoWayCount"] += 1
            continue
        group = groups.setdefault(
            key,
            {
                "name": canonical_name,
                "lines": [],
                "highwayTypes": set(),
                "sourceAliases": set(),
                "sourceWayIds": set(),
            },
        )
        group["lines"].extend(clipped)
        group["highwayTypes"].add(highway)
        group["sourceWayIds"].add(int(element["id"]))
        for tag_name in ALIAS_TAGS:
            for alias in split_tag_names(tags.get(tag_name)):
                group["sourceAliases"].add(alias)

    # Service roads, named footways and link roads may complete the rendering of
    # a street, but never introduce a new quiz answer by themselves.
    for element in auxiliary:
        tags = element["tags"]
        canonical_name = source_name_after_overrides(tags["name"], overrides["rename"])
        key = normalize_text(canonical_name)
        group = groups.get(key)
        if not group:
            counters["unusedAuxiliaryWayCount"] += 1
            continue
        clipped = cao_clipper.clip_lines(feature_lines(element))
        if not clipped:
            continue
        group["lines"].extend(clipped)
        group["highwayTypes"].add(tags["highway"])
        group["sourceWayIds"].add(int(element["id"]))
        counters["usedAuxiliaryWayCount"] += 1

    streets_working: list[dict[str, Any]] = []
    dropped_short_names: list[str] = []
    for key, group in groups.items():
        merged = merge_connected_lines(group["lines"])
        length = lines_length_meters(merged)
        if length < MIN_STREET_LENGTH_METERS and key not in forced:
            dropped_short_names.append(group["name"])
            continue
        simplified = [
            simplify_line(line, SIMPLIFY_TOLERANCE_METERS)
            for line in merged
            if len(line) >= 2
        ]
        simplified = [
            line
            for line in simplified
            if len(line) >= 2 and line_length_meters(line) >= 0.5
        ]
        if not simplified:
            raise BuildError(f"Street {group['name']} has empty geometry")

        overlap_by_district: dict[str, float] = {}
        street_bbox = bbox_for_lines(merged)
        for district_id in DISTRICT_ORDER:
            clipper = district_clippers[district_id]
            if not bboxes_intersect(street_bbox, clipper.bbox):
                continue
            overlap = lines_length_meters(clipper.clip_lines(merged))
            if overlap >= MIN_DISTRICT_OVERLAP_METERS:
                overlap_by_district[district_id] = overlap
        if not overlap_by_district:
            raise BuildError(f"Street {group['name']} belongs to no CAO district")
        quiz_district_id = max(
            overlap_by_district,
            key=lambda district_id: (
                overlap_by_district[district_id],
                -DISTRICT_ORDER.index(district_id),
            ),
        )
        identifier = street_id(key)
        source_aliases = {
            normalize_text(alias)
            for alias in group["sourceAliases"]
            if normalize_text(alias)
        }
        streets_working.append(
            {
                "id": identifier,
                "name": group["name"],
                "kind": kind_from_name(group["name"]),
                "normalizedName": key,
                "sourceAliases": source_aliases,
                "typeAlias": stripped_type_alias(group["name"]),
                "districtIds": [
                    district_id
                    for district_id in DISTRICT_ORDER
                    if district_id in overlap_by_district
                ],
                "quizDistrictId": quiz_district_id,
                "highwayTypes": sorted(group["highwayTypes"]),
                "lengthMeters": round(length),
                "bbox": quantize_bbox(street_bbox),
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [
                        quantize_line(line)
                        for line in sorted(
                            simplified,
                            key=lambda item: (
                                point_key(item[0]),
                                point_key(item[-1]),
                                len(item),
                            ),
                        )
                    ],
                },
            }
        )

    if not streets_working:
        raise BuildError("Street filtering produced no streets")

    id_to_name: dict[str, str] = {}
    for street in streets_working:
        other = id_to_name.setdefault(street["id"], street["name"])
        if other != street["name"]:
            raise BuildError(
                f"Street ID collision {street['id']}: {other} / {street['name']}"
            )

    by_normalized_name = {
        street["normalizedName"]: street for street in streets_working
    }
    override_aliases: dict[str, set[str]] = defaultdict(set)
    for target, values in overrides["aliases"].items():
        target_key = normalize_text(
            source_name_after_overrides(target, overrides["rename"])
        )
        if target_key not in by_normalized_name:
            raise BuildError(f"Alias override targets unknown street: {target}")
        for alias in values:
            normalized_alias = normalize_text(alias)
            if normalized_alias:
                override_aliases[target_key].add(normalized_alias)

    alias_claims: dict[str, set[str]] = defaultdict(set)
    alias_origins: dict[tuple[str, str], set[str]] = defaultdict(set)
    for street in streets_working:
        key = street["normalizedName"]
        candidates: list[tuple[str, str]] = [(key, "canonical")]
        candidates.extend((alias, "osm") for alias in street["sourceAliases"])
        if street["typeAlias"]:
            candidates.append((street["typeAlias"], "type-stripped"))
        candidates.extend(
            (alias, "override") for alias in override_aliases.get(key, set())
        )
        for alias, origin in candidates:
            alias_claims[alias].add(street["id"])
            alias_origins[(alias, street["id"])].add(origin)

    collisions = {
        alias: sorted(street_ids)
        for alias, street_ids in alias_claims.items()
        if len(street_ids) > 1
    }
    collision_report = []
    street_by_id = {street["id"]: street for street in streets_working}
    for alias in sorted(collisions):
        collision_report.append(
            {
                "alias": alias,
                "omitted": True,
                "streets": [
                    {
                        "id": street_id_value,
                        "name": street_by_id[street_id_value]["name"],
                        "origins": sorted(
                            alias_origins[(alias, street_id_value)]
                        ),
                    }
                    for street_id_value in collisions[alias]
                ],
            }
        )

    streets: list[dict[str, Any]] = []
    for street in streets_working:
        aliases = sorted(
            alias
            for alias, street_ids in alias_claims.items()
            if street["id"] in street_ids and alias not in collisions
        )
        if street["normalizedName"] not in aliases:
            raise BuildError(
                f"Canonical alias was lost for {street['name']}; "
                "another street normalizes to the same name"
            )
        output = {
            key: value
            for key, value in street.items()
            if key not in {"normalizedName", "sourceAliases", "typeAlias"}
        }
        output["aliases"] = aliases
        streets.append(output)

    streets.sort(key=lambda item: normalize_text(item["name"]))
    counters["droppedShortStreetCount"] = len(dropped_short_names)
    return (
        streets,
        {
            "collisions": collision_report,
            "droppedShortStreets": sorted(dropped_short_names, key=normalize_text),
        },
        dict(counters),
    )


def build_river(
    response: dict[str, Any], context_clipper: PolygonClipper
) -> dict[str, Any]:
    source_way_ids: list[int] = []
    lines: list[Line] = []
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        if (
            element.get("type") == "way"
            and tags.get("waterway") == "river"
            and tags.get("name") == "Москва"
        ):
            source_way_ids.append(int(element["id"]))
            lines.extend(context_clipper.clip_lines(feature_lines(element)))
    lines = merge_connected_lines(lines)
    if not lines:
        raise BuildError("Moskva River geometry is empty")
    simplified = [
        simplify_line(line, SIMPLIFY_TOLERANCE_METERS)
        for line in lines
        if len(line) >= 2
    ]
    return {
        "name": "Москва-река",
        "osmName": "Москва",
        "osmWayIds": sorted(source_way_ids),
        "bbox": quantize_bbox(bbox_for_lines(lines)),
        "geometry": {
            "type": "MultiLineString",
            "coordinates": [
                quantize_line(line)
                for line in sorted(
                    simplified,
                    key=lambda item: (
                        point_key(item[0]),
                        point_key(item[-1]),
                    ),
                )
            ],
        },
    }


def validate_dataset(dataset: dict[str, Any]) -> dict[str, int]:
    required_top_level = {"meta", "districts", "streets", "context"}
    if set(dataset) != required_top_level:
        raise BuildError(
            f"Top-level contract must be {sorted(required_top_level)}, "
            f"got {sorted(dataset)}"
        )
    meta = dataset["meta"]
    if meta.get("schemaVersion") != 1:
        raise BuildError("meta.schemaVersion must be 1")
    if not isinstance(meta.get("datasetVersion"), str) or not meta["datasetVersion"]:
        raise BuildError("meta.datasetVersion must be a non-empty string")

    districts = dataset["districts"]
    if len(districts) != 10:
        raise BuildError(f"Expected 10 districts, got {len(districts)}")
    district_ids = [district.get("id") for district in districts]
    if len(set(district_ids)) != len(district_ids):
        raise BuildError("Duplicate district IDs")
    if set(district_ids) != set(DISTRICT_ORDER):
        raise BuildError(
            f"Unknown/missing district IDs: {sorted(set(district_ids) ^ set(DISTRICT_ORDER))}"
        )

    street_ids: set[str] = set()
    alias_to_street: dict[str, str] = {}
    line_count = 0
    coordinate_count = 0
    for street in dataset["streets"]:
        identifier = street.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise BuildError("Street without a valid ID")
        if identifier in street_ids:
            raise BuildError(f"Duplicate street ID: {identifier}")
        street_ids.add(identifier)
        if not street.get("name"):
            raise BuildError(f"Street {identifier} has no name")
        if not isinstance(street.get("kind"), str) or not street["kind"]:
            raise BuildError(f"Street {street['name']} has no kind")
        if street["kind"] not in QUIZ_KINDS:
            raise BuildError(
                f"Street {street['name']} has disallowed quiz kind "
                f"{street['kind']}"
            )
        normalized_name = normalize_text(street["name"])
        if "(дублер)" in normalized_name:
            raise BuildError(
                f"Duplicate carriageway leaked as a separate answer: "
                f"{street['name']}"
            )
        if normalized_name.startswith("проектируемый проезд"):
            raise BuildError(
                f"Projected technical road leaked into quiz: {street['name']}"
            )
        district_values = street.get("districtIds")
        if not district_values:
            raise BuildError(f"Street {street['name']} has no districts")
        unknown_districts = set(district_values) - set(district_ids)
        if unknown_districts:
            raise BuildError(
                f"Street {street['name']} has unknown districts: "
                f"{sorted(unknown_districts)}"
            )
        if street.get("quizDistrictId") not in district_values:
            raise BuildError(
                f"Street {street['name']} quizDistrictId is not in districtIds"
            )
        aliases = street.get("aliases")
        if not isinstance(aliases, list) or not aliases:
            raise BuildError(f"Street {street['name']} has no aliases")
        if len(aliases) != len(set(aliases)):
            raise BuildError(f"Street {street['name']} has duplicate aliases")
        for alias in aliases:
            if alias != normalize_text(alias):
                raise BuildError(
                    f"Alias is not normalized for {street['name']}: {alias}"
                )
            owner = alias_to_street.setdefault(alias, identifier)
            if owner != identifier:
                raise BuildError(
                    f"Alias collision escaped the report: {alias} "
                    f"({owner}, {identifier})"
                )
        geometry = street.get("geometry", {})
        lines = geometry.get("coordinates")
        if geometry.get("type") != "MultiLineString" or not lines:
            raise BuildError(f"Street {street['name']} has empty geometry")
        for line in lines:
            if len(line) < 2:
                raise BuildError(f"Street {street['name']} has a short line")
            line_count += 1
            coordinate_count += len(line)

    context = dataset["context"]
    if not isinstance(context, list) or len(context) != 2:
        raise BuildError("context must contain exactly two entities")
    context_ids: set[str] = set()
    for item in context:
        if not isinstance(item, dict):
            raise BuildError("context contains a non-object entity")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier:
            raise BuildError("Context entity has no ID")
        if identifier in context_ids:
            raise BuildError(f"Duplicate context ID: {identifier}")
        context_ids.add(identifier)
        if not item.get("name") or item.get("kind") not in {"boundary", "river"}:
            raise BuildError(f"Invalid context entity: {identifier}")
        geometry = item.get("geometry", {})
        if not geometry.get("coordinates"):
            raise BuildError(f"Context {identifier} has empty geometry")
    if context_ids != {"cao-boundary", "moskva-river"}:
        raise BuildError(f"Unexpected context IDs: {sorted(context_ids)}")

    return {
        "districts": len(districts),
        "streets": len(dataset["streets"]),
        "aliases": len(alias_to_street),
        "streetLines": line_count,
        "streetCoordinates": coordinate_count,
    }


def build(args: argparse.Namespace, raw_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    overrides = load_overrides(args.overrides)
    discovery = cached_query(
        name="discovery",
        query=DISCOVERY_QUERY,
        raw_dir=raw_dir,
        endpoint=args.endpoint,
        refresh=args.refresh,
        offline=args.offline,
    )
    cao, discovered_districts = discover_relations(discovery)
    relation_ids = [int(cao["id"])] + [
        int(relation["id"]) for relation in discovered_districts
    ]
    boundary_query_text = boundaries_query(relation_ids)
    boundaries = cached_query(
        name="boundaries",
        query=boundary_query_text,
        raw_dir=raw_dir,
        endpoint=args.endpoint,
        refresh=args.refresh,
        offline=args.offline,
    )
    boundary_relations = relation_geometry_by_id(boundaries)
    missing_boundaries = sorted(set(relation_ids) - set(boundary_relations))
    if missing_boundaries:
        raise BuildError(f"Boundary relations missing: {missing_boundaries}")

    cao_osm_id = int(cao["id"])
    cao_full_geometry = relation_to_multipolygon(boundary_relations[cao_osm_id])
    cao_clipper = PolygonClipper(cao_full_geometry)
    cao_bbox = bbox_for_multipolygon(cao_full_geometry)
    feature_query_text = features_query(cao_bbox)
    features = cached_query(
        name="features",
        query=feature_query_text,
        raw_dir=raw_dir,
        endpoint=args.endpoint,
        refresh=args.refresh,
        offline=args.offline,
    )
    districts, district_clippers = build_districts(
        discovered_districts, boundary_relations
    )
    streets, collision_details, counters = build_streets(
        features, cao_clipper, district_clippers, overrides
    )
    west, south, east, north = cao_bbox
    bbox_geometry: MultiPolygon = [
        [[
            (west, south),
            (east, south),
            (east, north),
            (west, north),
            (west, south),
        ]]
    ]
    river = build_river(features, PolygonClipper(bbox_geometry))

    timestamps = [
        timestamp_from_response(discovery),
        timestamp_from_response(boundaries),
        timestamp_from_response(features),
    ]
    generated_at = max(timestamps)
    cao_simplified = simplify_multipolygon(
        cao_full_geometry, SIMPLIFY_TOLERANCE_METERS
    )
    dataset = {
        "meta": {
            "schemaVersion": 1,
            "datasetVersion": "",
            "generatedAt": generated_at,
            "coordinateOrder": "longitude-latitude",
            "crs": "EPSG:4326",
            "bbox": quantize_bbox(cao_bbox),
            "simplificationToleranceMeters": SIMPLIFY_TOLERANCE_METERS,
            "minimumStreetLengthMeters": MIN_STREET_LENGTH_METERS,
            "source": {
                "name": "OpenStreetMap",
                "license": "ODbL-1.0",
                "copyrightUrl": "https://www.openstreetmap.org/copyright",
                "overpassEndpoint": args.endpoint,
                "caoWikidata": CAO_WIKIDATA,
                "caoRelationId": cao_osm_id,
                "osmTimestamps": sorted(set(timestamps)),
                "queries": {
                    "discoverySha256": hashlib.sha256(
                        DISCOVERY_QUERY.encode("utf-8")
                    ).hexdigest(),
                    "boundariesSha256": hashlib.sha256(
                        boundary_query_text.encode("utf-8")
                    ).hexdigest(),
                    "featuresSha256": hashlib.sha256(
                        feature_query_text.encode("utf-8")
                    ).hexdigest(),
                },
            },
            "counts": {
                "districts": len(districts),
                "streets": len(streets),
                "aliasCollisions": len(collision_details["collisions"]),
                **counters,
            },
        },
        "districts": districts,
        "streets": streets,
        "context": [
            {
                "id": "cao-boundary",
                "name": "Центральный административный округ",
                "kind": "boundary",
                "osmRelationId": cao_osm_id,
                "wikidata": CAO_WIKIDATA,
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": quantize_multipolygon(cao_simplified),
                },
            },
            {
                "id": "moskva-river",
                "kind": "river",
                **river,
            },
        ],
    }
    version_payload = json.dumps(
        dataset,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    timestamp_token = re.sub(r"[^0-9]", "", generated_at)[:14]
    dataset_version = (
        f"osm-{timestamp_token}-"
        f"{hashlib.sha256(version_payload).hexdigest()[:12]}"
    )
    dataset["meta"]["datasetVersion"] = dataset_version
    stats = validate_dataset(dataset)
    collision_report = {
        "schemaVersion": 1,
        "datasetVersion": dataset_version,
        "generatedAt": generated_at,
        "description": (
            "Ambiguous aliases are intentionally omitted from cao-map.json."
        ),
        **collision_details,
    }
    print(
        "Validated: "
        + ", ".join(f"{key}={value}" for key, value in stats.items())
    )
    return dataset, collision_report


def main() -> int:
    args = parse_args()
    try:
        if args.validate_only:
            stats = validate_dataset(read_json(args.validate_only))
            print(
                "Validated: "
                + ", ".join(f"{key}={value}" for key, value in stats.items())
            )
            return 0

        if args.offline and not args.raw_dir:
            raise BuildError("--offline requires --raw-dir")
        if args.raw_dir:
            args.raw_dir.mkdir(parents=True, exist_ok=True)
            dataset, collisions = build(args, args.raw_dir)
        else:
            with tempfile.TemporaryDirectory(prefix="cao-map-osm-") as temp:
                dataset, collisions = build(args, Path(temp))
        write_json(args.output, dataset, compact=True)
        write_json(args.collisions_output, collisions, compact=False)
        print(f"Wrote {args.output} ({args.output.stat().st_size} bytes)")
        print(
            f"Wrote {args.collisions_output} "
            f"({args.collisions_output.stat().st_size} bytes)"
        )
        return 0
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

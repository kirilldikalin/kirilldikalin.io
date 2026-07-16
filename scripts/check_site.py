#!/usr/bin/env python3

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent

PUBLIC_PAGES = (
    "index.html",
    "articles/myths_DE.html",
    "brain/main_brain.html",
    "brain/map_msk/map_msk.html",
    "brain/map_russia/map_russia.html",
    "brain/pi.html",
    "brain/pisano.html",
    "euler/euler.html",
    "euler/439.html",
    "euler/579.html",
    "euler/763.html",
    "euler/780.html",
    "euler/786.html",
    "euler/792.html",
    "euler/798.html",
    "euler/1003.html",
    "knowlege_base/iKnowledge_base.html",
    "translation_of_articles/translation_of_articles.html",
    "translation_of_articles/part_1/chapter_1/CFSFT.html",
    "translation_of_articles/part_1/chapter_1/One_Size_Fits_All.html",
)

REFERENCE_ATTRIBUTES = {
    "a": ("href",),
    "img": ("src",),
    "link": ("href",),
    "script": ("src",),
    "source": ("src", "srcset"),
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.references = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)

        if "id" in attributes:
            self.ids.append(attributes["id"])

        for attribute in REFERENCE_ATTRIBUTES.get(tag, ()):
            value = attributes.get(attribute)
            if value:
                self.references.append((tag, attribute, value))


def parse_page(path):
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


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

    if errors:
        print("Site integrity check failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    print(
        f"Site integrity check passed: {len(parsed_pages)} HTML pages and their local references."
    )


if __name__ == "__main__":
    main()

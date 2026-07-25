Personal website [kirilldikalin.io](https://kirilldikalin.github.io/kirilldikalin.io/)

Contains:

<h2>Projects</h2>

- [Translation of articles from "designing data-intensive applications"](https://kirilldikalin.github.io/kirilldikalin.io/translation_of_articles/translation_of_articles.html)
- [Self-created Knowledge Base](https://kirilldikalin.github.io/kirilldikalin.io/knowlege_base/iKnowledge_base.html)
- [Analysis of solutions to tasks of the Euler project](https://kirilldikalin.github.io/kirilldikalin.io/euler/euler.html)

<h2>General</h2>

- [Memory training, such as memorizing the numbers after the decimal point in the number pi](https://kirilldikalin.github.io/kirilldikalin.io/brain/main_brain.html)
- [Moscow CAO street and bridge trainer](https://kirilldikalin.github.io/kirilldikalin.io/brain/map_msk/map_msk.html)

<br><br>

Содержит:

<h2>Проекты</h2>

- [Перевод статей упомянутых в книге "Высоко-нагруженные приложения. Программирование масштабирование поддержка"](https://kirilldikalin.github.io/kirilldikalin.io/translation_of_articles/translation_of_articles.html)
- [Self made база знаний](https://kirilldikalin.github.io/kirilldikalin.io/knowlege_base/iKnowledge_base.html)
- [Разбор решений заданий проекта Эйлера](https://kirilldikalin.github.io/kirilldikalin.io/euler/euler.html)

<h2>Общее</h2>

- [Тренировка памяти](https://kirilldikalin.github.io/kirilldikalin.io/brain/main_brain.html)
- [Тренажёр улиц и мостов ЦАО Москвы](https://kirilldikalin.github.io/kirilldikalin.io/brain/map_msk/map_msk.html)

## Browser dependencies

- Highlight.js is loaded only by the knowledge base, where it highlights Python code examples.
- MathJax is loaded only by Euler pages that contain TeX formulas.
- The Moscow streets trainer uses a local copy of Leaflet 1.9.4 and a local GeoJSON dataset derived
  from OpenStreetMap. It does not request map tiles or a map API at runtime. The regular mode
  tracks answers; learning mode reveals names on the map for all or selected CAO districts.

## Yandex Maps API key

The Moscow streets trainer no longer uses Yandex Maps. The remaining browser integration is the
experimental Russia map in `brain/map_russia/map_russia.html`; its key is also present in the Git
history. A browser key cannot be hidden by moving it to another JavaScript file, an environment
variable, or a GitHub Actions secret because the final value is delivered to every visitor.

Rotate the historical key and protect any replacement in the Yandex developer dashboard:

1. Allow requests only from `kirilldikalin.github.io`.
2. Use a separate key for local development if local map testing is required.
3. Configure usage limits and notifications.
4. Rotate the current key if its restriction history is unknown.

## Validation

Run the public page, link, and anchor check locally:

```shell
python3 scripts/check_site.py
node --test brain/map_msk/tests/*.test.js
python3 brain/map_msk/tools/build_cao_map.py --validate-only brain/map_msk/data/cao-map.json
```

GitHub Actions runs these checks and validates JavaScript syntax on pushes to `master` and
`develop`, and on pull requests.

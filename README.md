Personal website [kirilldikalin.io](https://kirilldikalin.github.io/kirilldikalin.io/)

Contains:

<h2>Projects</h2>

- [Translation of articles from "designing data-intensive applications"](https://kirilldikalin.github.io/kirilldikalin.io/translation_of_articles/translation_of_articles.html)
- [Self-created Knowledge Base](https://kirilldikalin.github.io/kirilldikalin.io/knowlege_base/iKnowledge_base.html)
- [Analysis of solutions to tasks of the Euler project](https://kirilldikalin.github.io/kirilldikalin.io/euler/euler.html)

<h2>General</h2>

- [Memory training, such as memorizing the numbers after the decimal point in the number pi](https://kirilldikalin.github.io/kirilldikalin.io/brain/main_brain.html)

<br><br>

Содержит:

<h2>Проекты</h2>

- [Перевод статей упомянутых в книге "Высоко-нагруженные приложения. Программирование масштабирование поддержка"](https://kirilldikalin.github.io/kirilldikalin.io/translation_of_articles/translation_of_articles.html)
- [Self made база знаний](https://kirilldikalin.github.io/kirilldikalin.io/knowlege_base/iKnowledge_base.html)
- [Разбор решений заданий проекта Эйлера](https://kirilldikalin.github.io/kirilldikalin.io/euler/euler.html)

<h2>Общее</h2>

- [Тренировка памяти](https://kirilldikalin.github.io/kirilldikalin.io/brain/main_brain.html)

## Browser dependencies

- Highlight.js is loaded only by the knowledge base, where it highlights Python code examples.
- MathJax is loaded only by Euler pages that contain TeX formulas.
- The Moscow streets trainer uses the Yandex Maps browser API without jQuery.

## Yandex Maps API key

The browser must receive the Yandex Maps API key, so moving it to another JavaScript file or an
environment variable would not make it secret on GitHub Pages. Protect the production key in the
Yandex developer dashboard:

1. Allow requests only from `kirilldikalin.github.io`.
2. Use a separate key for local development if local map testing is required.
3. Configure usage limits and notifications.
4. Rotate the current key if its restriction history is unknown.

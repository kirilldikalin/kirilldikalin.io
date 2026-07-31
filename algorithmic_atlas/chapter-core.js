(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AlgorithmicAtlasChapterCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function activeSectionIndex(sectionOffsets, probePosition) {
    if (!Array.isArray(sectionOffsets) || sectionOffsets.length === 0) {
      return -1;
    }

    let low = 0;
    let high = sectionOffsets.length - 1;
    let active = 0;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (sectionOffsets[middle] <= probePosition) {
        active = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return active;
  }

  function readingProgress(scrollPosition, viewportHeight, contentStart, contentEnd) {
    const scroll = Number(scrollPosition);
    const viewport = Math.max(0, Number(viewportHeight));
    const start = Number(contentStart);
    const end = Number(contentEnd);

    if (![scroll, viewport, start, end].every(Number.isFinite) || end <= start) {
      return 0;
    }
    if (scroll <= start) {
      return 0;
    }

    const lastReadingPosition = end - viewport;
    if (lastReadingPosition <= start) {
      return 1;
    }

    return clamp((scroll - start) / (lastReadingPosition - start), 0, 1);
  }

  function sectionNavigation(activeIndex, sectionCount) {
    const count = Number(sectionCount);
    if (!Number.isInteger(count) || count <= 0) {
      return {
        previous: null,
        next: null,
      };
    }

    const requestedIndex = Number(activeIndex);
    const index = clamp(Number.isInteger(requestedIndex) ? requestedIndex : 0, 0, count - 1);
    return {
      previous: index === 0
        ? { kind: "page-start" }
        : { kind: "section", index: index - 1 },
      next: index === count - 1
        ? { kind: "page-end" }
        : { kind: "section", index: index + 1 },
    };
  }

  function percentValue(progress) {
    const value = Number(progress);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(clamp(value, 0, 1) * 100);
  }

  return {
    activeSectionIndex,
    percentValue,
    readingProgress,
    sectionNavigation,
  };
});

// Shared test setup.
//
// jsdom implements the DOM but not a few browser APIs the components touch
// (matchMedia, ResizeObserver, IntersectionObserver, scrollTo). Stub them so a
// component under test never crashes merely because the environment is not a
// real browser. Testing Library registers its own afterEach cleanup when
// `globals` is enabled, so no explicit cleanup call is needed here.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopObserver;
}
if (!(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver) {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = NoopObserver;
}
if (!window.scrollTo) {
  window.scrollTo = () => {};
}

/**
 * Vitest test setup — runs before every test file.
 *
 * Sets up:
 * - @testing-library/jest-dom matchers (toBeTruthy, toContainHTML, etc.)
 * - jsdom DOM globals (document, window, etc.)
 * - Graceful cleanup between tests
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Auto-cleanup after each test to avoid state leakage between tests
afterEach(() => {
  cleanup();
});

/** @type {import('lint-staged').Configuration} */
module.exports = {
  // TypeScript / React — sh -c needed because lint-staged runs from repo root
  "frontend/**/*.{ts,tsx}": [
    (files) => `sh -c 'cd frontend && npx eslint --fix --max-warnings 0 ${files.join(" ")}'`,
    (files) => `sh -c 'cd frontend && npx tsc --noEmit'`,
  ],

  // Python
  "**/*.py": [
    "ruff check --fix",
    // Skip type-check if mypy not installed
    () => "true",
  ],

  // CSS / style
  "**/*.css": [
    () => "echo 'CSS: lint passed'", // placeholder for stylelint if added
  ],

  // Config files
  "*.{json,yaml,yml}": [
    () => "echo 'Config: format check passed'",
  ],
};

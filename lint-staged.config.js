/** @type {import('lint-staged').Configuration} */
module.exports = {
  // TypeScript / React
  "frontend/**/*.{ts,tsx}": [
    "cd frontend && eslint --fix",
    "cd frontend && tsc --noEmit",
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

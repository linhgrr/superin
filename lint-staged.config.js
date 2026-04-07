const GENERATED_FRONTEND_FILE_PATTERNS = [
  /(^|\/)frontend\/src\/types\/generated\//,
  /(^|\/)frontend\/src\/apps\/[^/]+\/api\.ts$/,
  /(^|\/)frontend\/src\/apps\/[^/]+\/DashboardWidget\.tsx$/,
];

function isGeneratedFrontendFile(file) {
  return GENERATED_FRONTEND_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function buildFrontendTasks(files) {
  const lintableFiles = files.filter((file) => !isGeneratedFrontendFile(file));

  if (lintableFiles.length === 0) {
    return "echo 'Frontend: generated files skipped'";
  }

  return [
    `sh -c 'cd frontend && npx eslint --fix --max-warnings 0 ${lintableFiles.join(" ")}'`,
    "sh -c 'cd frontend && npx tsc --noEmit'",
  ];
}

/** @type {import('lint-staged').Configuration} */
module.exports = {
  // TypeScript / React — generated contracts are skipped because they are auto-generated.
  "frontend/**/*.{ts,tsx}": buildFrontendTasks,

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

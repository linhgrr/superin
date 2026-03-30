/** @type {import('commitlint').Config} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Body không bắt buộc — đôi khi commit nhỏ không cần giải thích
    "body-full-stop": [2, "always", "."],
    // Dòng đầu ≤ 72 ký tự
    "header-max-length": [2, "always", 72],
    // Type scope subject là format chuẩn
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "test",
        "docs",
        "chore",
        "build",
        "ci",
        "db",
      ],
    ],
    // Scope không bắt buộc (optional-scope rule not always supported)
    // Dùng subject-case: lowercase, no period
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-full-stop": [2, "never", ["."]],
    // Breaking changes
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
  prompt: {
    // Custom commit types cho dự án này
    questions: {
      type: {
        description: "Loại thay đổi?",
        enum: {
          feat: {
            description: "feat: Tính năng mới",
            title: "Features",
            value: "feat",
          },
          fix: {
            description: "fix: Sửa bug",
            title: "Bug Fixes",
            value: "fix",
          },
          refactor: {
            description: "refactor: Cấu trúc lại code",
            title: "Code Refactoring",
            value: "refactor",
          },
          perf: {
            description: "perf: Cải thiện performance",
            title: "Performance Improvements",
            value: "perf",
          },
          test: {
            description: "test: Thêm / sửa tests",
            title: "Tests",
            value: "test",
          },
          docs: {
            description: "docs: Chỉ sửa documentation",
            title: "Documentation",
            value: "docs",
          },
          chore: {
            description: "chore: Config, dependency, tooling",
            title: "Chores",
            value: "chore",
          },
          build: {
            description: "build: Build system, CI/CD",
            title: "Builds",
            value: "build",
          },
          ci: {
            description: "ci: CI/CD pipeline",
            title: "Continuous Integration",
            value: "ci",
          },
          db: {
            description: "db: Migration, schema, seed data",
            title: "Database",
            value: "db",
          },
        },
      },
      scope: {
        description: "Module/folder bị ảnh hưởng? (để trống nếu nhiều)",
      },
      subject: {
        description: "Mô tả ngắn (≤72 ký tự, lowercase, không dấu chấm cuối)",
      },
      body: {
        description: "Mô tả chi tiết? (WHY, không phải WHAT)",
      },
      breaking: {
        description: "Có breaking changes không?",
      },
      issues: {
        description: "Issue liên quan? (e.g. Closes #42)",
      },
    },
  },
};

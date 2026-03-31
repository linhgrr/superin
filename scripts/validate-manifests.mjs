import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const frontendAppsRoot = path.join(repoRoot, "frontend", "src", "apps");

function fail(message) {
  console.error(`manifest validation failed: ${message}`);
  process.exit(1);
}

function loadFrontendManifests() {
  const appDirs = readdirSync(frontendAppsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return appDirs.map((appId) => {
    const appRoot = path.join(frontendAppsRoot, appId);
    const manifestPath = path.join(appRoot, "manifest.json");

    if (!existsSync(manifestPath)) {
      fail(`missing frontend manifest: ${path.relative(repoRoot, manifestPath)}`);
    }

    for (const requiredFile of ["AppView.tsx", "DashboardWidget.tsx", "api.ts", "index.ts"]) {
      const filePath = path.join(appRoot, requiredFile);
      if (!existsSync(filePath)) {
        fail(`missing frontend app file: ${path.relative(repoRoot, filePath)}`);
      }
    }

    return JSON.parse(readFileSync(manifestPath, "utf8"));
  });
}

function loadBackendManifests() {
  const isLinhdzActive = process.env.CONDA_DEFAULT_ENV === "linhdz";
  const command = isLinhdzActive ? "python" : "conda";
  const args = isLinhdzActive
    ? ["scripts/export_backend_manifests.py"]
    : ["run", "-n", "linhdz", "python", "scripts/export_backend_manifests.py"];

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(
      result.stderr.trim() ||
        result.stdout.trim() ||
        "could not export backend manifests"
    );
  }

  return JSON.parse(result.stdout);
}

function compareManifests(frontendManifests, backendManifests) {
  const frontendById = new Map(frontendManifests.map((manifest) => [manifest.id, manifest]));
  const backendById = new Map(backendManifests.map((manifest) => [manifest.id, manifest]));

  const frontendIds = [...frontendById.keys()].sort();
  const backendIds = [...backendById.keys()].sort();

  if (frontendIds.join(",") !== backendIds.join(",")) {
    fail(
      `app ids differ.\nfrontend: ${frontendIds.join(", ")}\nbackend: ${backendIds.join(", ")}`
    );
  }

  for (const appId of backendIds) {
    const frontendManifest = frontendById.get(appId);
    const backendManifest = backendById.get(appId);

    if (!frontendManifest || !backendManifest) {
      fail(`missing manifest pair for app ${appId}`);
    }

    const frontendWidgets = new Map(
      frontendManifest.widgets.map((widget) => [widget.id, widget.size])
    );
    const backendWidgets = new Map(
      backendManifest.widgets.map((widget) => [widget.id, widget.size])
    );

    const frontendWidgetIds = [...frontendWidgets.keys()].sort();
    const backendWidgetIds = [...backendWidgets.keys()].sort();

    if (frontendWidgetIds.join(",") !== backendWidgetIds.join(",")) {
      fail(
        `widget ids differ for ${appId}.\nfrontend: ${frontendWidgetIds.join(", ")}\nbackend: ${backendWidgetIds.join(", ")}`
      );
    }

    for (const widgetId of backendWidgetIds) {
      const frontendSize = frontendWidgets.get(widgetId);
      const backendSize = backendWidgets.get(widgetId);

      if (frontendSize !== backendSize) {
        fail(
          `widget size differs for ${widgetId}. frontend=${frontendSize} backend=${backendSize}`
        );
      }
    }
  }
}

const frontendManifests = loadFrontendManifests();
const backendManifests = loadBackendManifests();

compareManifests(frontendManifests, backendManifests);

console.log(
  `manifest validation passed for ${backendManifests.length} apps and ${backendManifests.reduce(
    (sum, app) => sum + app.widgets.length,
    0
  )} widgets`
);

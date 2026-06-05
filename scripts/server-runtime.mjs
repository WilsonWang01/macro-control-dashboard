import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(repoRoot, ".cache", "runtime");
const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

const runtimeSources = [
  "server/app.ts",
  "server/dataService.ts",
  "server/lib/cache.ts",
  "server/lib/csv.ts",
  "server/lib/http.ts",
  "server/sources/blsEmployment.ts",
  "server/sources/cboe.ts",
  "server/sources/ecb.ts",
  "server/sources/fred.ts",
  "server/sources/japanMof.ts",
  "server/sources/marketRates.ts",
  "server/sources/tic.ts",
  "server/sources/treasury.ts",
  "shared/metrics.ts",
  "shared/rules.ts",
  "shared/types.ts"
];

export async function loadDataService() {
  await mkdir(runtimeDir, { recursive: true });
  execFileSync(
    process.execPath,
    [
      tscBin,
      "--target",
      "ES2022",
      "--module",
      "CommonJS",
      "--moduleResolution",
      "Node",
      "--outDir",
      runtimeDir,
      "--rootDir",
      repoRoot,
      "--skipLibCheck",
      "--esModuleInterop",
      "--allowSyntheticDefaultImports",
      "--resolveJsonModule",
      "--noEmit",
      "false",
      ...runtimeSources
    ],
    { cwd: repoRoot, stdio: "inherit" }
  );
  await writeFile(join(runtimeDir, "package.json"), "{\"type\":\"commonjs\"}\n", "utf8");

  const require = createRequire(import.meta.url);
  return require(join(runtimeDir, "server", "dataService.js"));
}

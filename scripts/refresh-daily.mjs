import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadDataService } from "./server-runtime.mjs";

const { getDashboard } = await loadDataService();
const snapshot = await getDashboard(true);
const outDir = join(process.cwd(), ".cache");
const outFile = join(outDir, "latest-dashboard-snapshot.json");

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(snapshot, null, 2), "utf8");

const lines = [
  `updatedAt=${snapshot.generatedAt}`,
  `riskState=${snapshot.riskState}`,
  `riskScore=${snapshot.riskScore}`,
  `regime=${snapshot.regime}`,
  `headline=${snapshot.interpretation.headline}`,
  `alerts=${snapshot.alerts.length}`,
  `snapshot=${outFile}`
];

console.log(lines.join("\n"));

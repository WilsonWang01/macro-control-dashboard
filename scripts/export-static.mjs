import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadDataService } from "./server-runtime.mjs";

const { getDashboard, getSources } = await loadDataService();
const outDir = join(process.cwd(), "public", "api");
const [dashboard, sources] = await Promise.all([getDashboard(false), getSources(false)]);

await mkdir(outDir, { recursive: true });
await Promise.all([
  writeFile(join(outDir, "dashboard.json"), JSON.stringify(dashboard, null, 2), "utf8"),
  writeFile(join(outDir, "sources.json"), JSON.stringify(sources, null, 2), "utf8")
]);

console.log(`staticApi=${outDir}`);

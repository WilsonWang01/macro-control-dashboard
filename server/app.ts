import cors from "cors";
import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDashboard, getSeries, getSources } from "./dataService";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/dashboard", async (_request, response, next) => {
  try {
    response.json(await getDashboard(false));
  } catch (error) {
    next(error);
  }
});

app.post("/api/refresh", async (_request, response, next) => {
  try {
    response.json(await getDashboard(true));
  } catch (error) {
    next(error);
  }
});

app.get("/api/sources", async (_request, response, next) => {
  try {
    response.json(await getSources(false));
  } catch (error) {
    next(error);
  }
});

app.get("/api/series", async (request, response, next) => {
  try {
    const query = z
      .object({
        ids: z.string().min(1),
        start: z.string().optional(),
        end: z.string().optional()
      })
      .parse(request.query);

    response.json(
      await getSeries(
        query.ids.split(",").map((id) => id.trim()).filter(Boolean),
        query.start,
        query.end
      )
    );
  } catch (error) {
    next(error);
  }
});

const dist = join(process.cwd(), "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(join(dist, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  response.status(500).json({ error: message });
});

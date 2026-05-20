import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Macro dashboard API listening on http://${host}:${port}`);
});

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const defaultAttempts = 1;
const maxResponseBytes = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  const buffer = await fetchBufferWithRetry(url, timeoutMs);
  return buffer.toString("utf8");
}

export async function fetchBuffer(url: string, timeoutMs = 9000): Promise<Buffer> {
  return fetchBufferWithRetry(url, timeoutMs);
}

export async function fetchDecodedText(
  url: string,
  encoding: string,
  timeoutMs = 9000
): Promise<string> {
  const buffer = await fetchBufferWithRetry(url, timeoutMs);
  return new TextDecoder(encoding).decode(buffer);
}

async function fetchBufferWithRetry(
  url: string,
  timeoutMs: number
): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= defaultAttempts; attempt += 1) {
    try {
      return await fetchOnce(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt === defaultAttempts) break;
      await delay(350 * attempt);
    }
  }

  try {
    return await fetchWithCurl(url, timeoutMs);
  } catch (curlError) {
    const primaryMessage = formatError(lastError);
    const fallbackMessage = formatError(curlError);
    throw new Error(`Fetch failed (${primaryMessage}); curl fallback failed (${fallbackMessage})`);
  }
}

async function fetchOnce(
  url: string,
  timeoutMs: number
): Promise<Buffer> {
  const response = await fetchResponse(url, timeoutMs);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchWithCurl(url: string, timeoutMs: number): Promise<Buffer> {
  const timeoutSeconds = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-L",
      "--http1.1",
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      timeoutSeconds,
      "-H",
      "user-agent: macro-control-dashboard/0.1",
      "-H",
      "cache-control: no-cache",
      "-H",
      "pragma: no-cache",
      url
    ],
    {
      encoding: "buffer",
      maxBuffer: maxResponseBytes
    }
  );

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

function formatError(error: unknown): string {
  if (isAbortError(error)) {
    return "timed out";
  }

  return error instanceof Error ? error.message : String(error);
}

async function fetchResponse(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "macro-control-dashboard/0.1",
        "cache-control": "no-cache",
        "pragma": "no-cache"
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

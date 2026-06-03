const defaultAttempts = 2;

export async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  return fetchWithRetry(url, timeoutMs, async (response) => response.text());
}

export async function fetchDecodedText(
  url: string,
  encoding: string,
  timeoutMs = 9000
): Promise<string> {
  return fetchWithRetry(url, timeoutMs, async (response) => {
    const buffer = await response.arrayBuffer();
    return new TextDecoder(encoding).decode(buffer);
  });
}

async function fetchWithRetry<T>(
  url: string,
  timeoutMs: number,
  readResponse: (response: Response) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= defaultAttempts; attempt += 1) {
    try {
      return await fetchOnce(url, timeoutMs, readResponse);
    } catch (error) {
      lastError = error;
      if (attempt === defaultAttempts) break;
      await delay(350 * attempt);
    }
  }

  if (isAbortError(lastError)) {
    throw new Error(`Timed out after ${timeoutMs}ms`);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchOnce<T>(
  url: string,
  timeoutMs: number,
  readResponse: (response: Response) => Promise<T>
): Promise<T> {
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

    return await readResponse(response);
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

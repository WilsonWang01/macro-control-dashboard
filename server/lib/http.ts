export async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "macro-control-dashboard/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDecodedText(
  url: string,
  encoding: string,
  timeoutMs = 9000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "macro-control-dashboard/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new TextDecoder(encoding).decode(buffer);
  } finally {
    clearTimeout(timer);
  }
}

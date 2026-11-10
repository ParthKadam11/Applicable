import { config } from "../config.js";

const lastRequestByHost = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectHostDelay(url: string): Promise<void> {
  const host = new URL(url).host;
  const last = lastRequestByHost.get(host) ?? 0;
  const wait = config.PER_HOST_DELAY_MS - (Date.now() - last);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestByHost.set(host, Date.now());
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  await respectHostDelay(url);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.HTTP_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": config.USER_AGENT,
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(
        `HTTP ${res.status} for ${url}`,
        res.status,
        text.slice(0, 500),
      );
    }

    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  await respectHostDelay(url);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.HTTP_TIMEOUT_MS,
  );

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": config.USER_AGENT,
        ...(init?.headers ?? {}),
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(
        `HTTP ${res.status} for ${url}`,
        res.status,
        text.slice(0, 500),
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

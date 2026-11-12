import { CSRF_HEADER_NAME, type ApiErrorBody } from "@bannerai/shared";
import { API_URL } from "@/lib/env";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();
export const onUnauthorized = (listener: UnauthorizedListener): (() => void) => {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
};

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** FormData uploads are sent as-is (no JSON encoding). */
  formData?: FormData;
  signal?: AbortSignal;
  /** Skip the global 401 handler (used by the auth bootstrap). */
  silent401?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error */
  }
  const code = body?.error?.code ?? `http_${res.status}`;
  const message = body?.error?.message ?? res.statusText ?? "Request failed";
  return new ApiError(res.status, code, message, body?.error?.details);
}

/** Typed fetch wrapper: cookie credentials, CSRF header, JSON encoding and error normalization. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const method = options.method ?? "GET";
  if (method !== "GET" && csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body, credentials: "include", signal: options.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Could not reach the server. Is the backend running?");
  }

  if (res.status === 401 && !options.silent401) {
    unauthorizedListeners.forEach((l) => l());
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

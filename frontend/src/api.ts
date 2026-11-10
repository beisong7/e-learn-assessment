const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    notifyUnauthorized?: boolean;
    keepalive?: boolean;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      keepalive: options.keepalive,
      credentials: 'include',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(0, 'We couldn’t reach the server. Check your connection and try again.');
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (response.status === 401 && options.notifyUnauthorized !== false)
      window.dispatchEvent(new Event('learnova:session-expired'));
    throw new ApiError(
      response.status,
      payload?.error?.message || 'Something went wrong. Please try again.',
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

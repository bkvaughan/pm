import { vi } from "vitest";

type Handler = (body: unknown) => { status?: number; body?: unknown };

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Stub fetch with handlers keyed by "METHOD /path". Unmatched requests fail
 * the test with a 599 so missing mocks are obvious.
 */
export const mockFetch = (routes: Record<string, Handler>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const handler = routes[key];
    if (!handler) {
      return json(599, { detail: `Unmocked request: ${key}` });
    }
    const result = handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    return json(result.status ?? 200, result.body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

export const requestsTo = (fetchMock: ReturnType<typeof mockFetch>, key: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === key)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

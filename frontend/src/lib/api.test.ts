import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "@/lib/api";

const respond = (response: Response) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

describe("request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON bodies and parses JSON responses", async () => {
    respond(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(request("/api/x", { method: "POST", body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      signal: undefined,
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("returns undefined for 204 responses", async () => {
    respond(new Response(null, { status: 204 }));

    await expect(request("/api/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it.each([
    [{ detail: "Board not found." }, 404, "Board not found."],
    [{ detail: [{ msg: "String should have at least 8 characters" }] }, 422,
      "String should have at least 8 characters"],
    [null, 500, "Request failed (500)."],
  ])("raises ApiError with a readable message for %j", async (payload, status, message) => {
    respond(new Response(payload === null ? "boom" : JSON.stringify(payload), { status }));

    const error = await request("/api/x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message, status });
  });
});

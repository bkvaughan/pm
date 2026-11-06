import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { initialData } from "@/test/fixtures";
import { mockFetch, requestsTo } from "@/test/mockFetch";

const demoUser = { id: "user-1", username: "user", displayName: "Demo User" };
const roadmap = {
  id: "board-1",
  name: "Product Roadmap",
  cardCount: 8,
  createdAt: "2026-11-01T10:00:00+00:00",
  updatedAt: "2026-11-01T10:00:00+00:00",
};

const signedInRoutes = {
  "GET /api/auth/me": () => ({ body: demoUser }),
  "GET /api/boards": () => ({ body: [roadmap] }),
  "GET /api/boards/board-1": () => ({ body: initialData }),
  "POST /api/auth/logout": () => ({ status: 204 }),
};

describe("AppShell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the sign-in screen without a session", async () => {
    mockFetch({
      "GET /api/auth/me": () => ({ status: 401, body: { detail: "Not signed in." } }),
    });
    render(<AppShell />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("restores a session and opens a board from the list", async () => {
    mockFetch(signedInRoutes);
    render(<AppShell />);

    expect(await screen.findByTestId("user-display-name")).toHaveTextContent(
      "Demo User"
    );
    await userEvent.click(await screen.findByRole("button", { name: "Product Roadmap" }));

    expect(await screen.findAllByLabelText("Column title")).toHaveLength(5);
    expect(screen.getByTestId("current-board-name")).toHaveTextContent(
      "Product Roadmap"
    );
    expect(window.location.search).toBe("?board=board-1");

    await userEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(await screen.findByRole("heading", { name: "Your boards" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("reopens the board named in the URL", async () => {
    window.history.replaceState(null, "", "/?board=board-1");
    mockFetch(signedInRoutes);
    render(<AppShell />);

    expect(await screen.findAllByLabelText("Column title")).toHaveLength(5);
  });

  it("falls back to the board list for an unknown board in the URL", async () => {
    window.history.replaceState(null, "", "/?board=missing");
    mockFetch(signedInRoutes);
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "Your boards" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("signs in, then logs out", async () => {
    let signedIn = false;
    const fetchMock = mockFetch({
      ...signedInRoutes,
      "GET /api/auth/me": () =>
        signedIn ? { body: demoUser } : { status: 401, body: { detail: "Not signed in." } },
      "POST /api/auth/login": () => {
        signedIn = true;
        return { body: demoUser };
      },
    });
    render(<AppShell />);

    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your boards" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, "POST /api/auth/logout")).toHaveLength(1);
  });

  it("opens account settings and updates the top bar name", async () => {
    mockFetch({
      ...signedInRoutes,
      "PATCH /api/account": () => ({ body: { ...demoUser, displayName: "Dana" } }),
    });
    render(<AppShell />);

    await userEvent.click(await screen.findByRole("button", { name: "Account settings" }));
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "Dana");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await vi.waitFor(() =>
      expect(screen.getByTestId("user-display-name")).toHaveTextContent("Dana")
    );
  });
});

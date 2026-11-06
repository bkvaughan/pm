import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "@/components/AuthScreen";
import { mockFetch, requestsTo } from "@/test/mockFetch";

const demoUser = { id: "user-1", username: "user", displayName: "Demo User" };

describe("AuthScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs in with valid credentials", async () => {
    const fetchMock = mockFetch({
      "POST /api/auth/login": () => ({ body: demoUser }),
    });
    const onAuthenticated = vi.fn();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(demoUser));
    expect(requestsTo(fetchMock, "POST /api/auth/login")).toEqual([
      { username: "user", password: "password" },
    ]);
  });

  it("shows the server error for rejected credentials", async () => {
    mockFetch({
      "POST /api/auth/login": () => ({
        status: 401,
        body: { detail: "Incorrect username or password." },
      }),
    });
    const onAuthenticated = vi.fn();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("creates an account", async () => {
    const created = { id: "user-2", username: "alice", displayName: "Alice" };
    const fetchMock = mockFetch({
      "POST /api/auth/register": () => ({ status: 201, body: created }),
    });
    const onAuthenticated = vi.fn();
    render(<AuthScreen onAuthenticated={onAuthenticated} />);

    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(
      screen.getByRole("heading", { name: "Create your account" })
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Display name"), "Alice");
    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Password"), "long-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await vi.waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(created));
    expect(requestsTo(fetchMock, "POST /api/auth/register")).toEqual([
      { username: "alice", password: "long-password", displayName: "Alice" },
    ]);
  });

  it("shows validation errors from registration", async () => {
    mockFetch({
      "POST /api/auth/register": () => ({
        status: 409,
        body: { detail: "That username is already taken." },
      }),
    });
    render(<AuthScreen onAuthenticated={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await userEvent.type(screen.getByLabelText("Display name"), "Someone");
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "long-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That username is already taken."
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
  });
});

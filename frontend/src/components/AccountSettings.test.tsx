import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSettings } from "@/components/AccountSettings";
import { mockFetch, requestsTo } from "@/test/mockFetch";

const user = { id: "user-1", username: "user", displayName: "Demo User" };

const renderSettings = () => {
  const onUserChange = vi.fn();
  const onAccountDeleted = vi.fn();
  render(
    <AccountSettings
      user={user}
      onUserChange={onUserChange}
      onAccountDeleted={onAccountDeleted}
    />
  );
  return { onUserChange, onAccountDeleted };
};

const section = (name: string) => screen.getByRole("region", { name });

describe("AccountSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates the display name", async () => {
    const updated = { ...user, displayName: "Dana" };
    const fetchMock = mockFetch({
      "PATCH /api/account": () => ({ body: updated }),
    });
    const { onUserChange } = renderSettings();

    const input = screen.getByLabelText("Display name");
    expect(input).toHaveValue("Demo User");
    await userEvent.clear(input);
    await userEvent.type(input, "Dana");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await within(section("Profile")).findByRole("status")).toHaveTextContent(
      "Profile saved."
    );
    expect(onUserChange).toHaveBeenCalledWith(updated);
    expect(requestsTo(fetchMock, "PATCH /api/account")).toEqual([
      { displayName: "Dana" },
    ]);
  });

  it("changes the password and clears the form", async () => {
    const fetchMock = mockFetch({
      "POST /api/account/password": () => ({ status: 204 }),
    });
    renderSettings();

    await userEvent.type(screen.getByLabelText("Current password"), "password");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await within(section("Password")).findByRole("status")).toHaveTextContent(
      "Password changed."
    );
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(requestsTo(fetchMock, "POST /api/account/password")).toEqual([
      { currentPassword: "password", newPassword: "new-password" },
    ]);
  });

  it("shows a wrong current password error", async () => {
    mockFetch({
      "POST /api/account/password": () => ({
        status: 400,
        body: { detail: "Current password is incorrect." },
      }),
    });
    renderSettings();

    await userEvent.type(screen.getByLabelText("Current password"), "nope");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await within(section("Password")).findByRole("alert")).toHaveTextContent(
      "Current password is incorrect."
    );
  });

  it("deletes the account after password confirmation", async () => {
    mockFetch({ "POST /api/account/delete": () => ({ status: 204 }) });
    const { onAccountDeleted } = renderSettings();

    await userEvent.type(
      screen.getByLabelText("Confirm with your password"),
      "password"
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    await vi.waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
  });

  it("keeps the account when the delete password is wrong", async () => {
    mockFetch({
      "POST /api/account/delete": () => ({
        status: 400,
        body: { detail: "Password is incorrect." },
      }),
    });
    const { onAccountDeleted } = renderSettings();

    await userEvent.type(screen.getByLabelText("Confirm with your password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(
      await within(section("Delete account")).findByRole("alert")
    ).toHaveTextContent("Password is incorrect.");
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});

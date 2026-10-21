import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LoginGate } from "@/components/LoginGate";

describe("LoginGate", () => {
  it("requires sign-in before showing the board", async () => {
    render(
      <LoginGate>
        <p>Board content</p>
      </LoginGate>
    );

    expect(await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })).toBeInTheDocument();
    expect(screen.queryByText("Board content")).not.toBeInTheDocument();
  });

  it("rejects incorrect credentials", async () => {
    render(
      <LoginGate>
        <p>Board content</p>
      </LoginGate>
    );

    await userEvent.type(screen.getByLabelText("Username"), "wrong");
    await userEvent.type(screen.getByLabelText("Password"), "credentials");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(screen.queryByText("Board content")).not.toBeInTheDocument();
  });

  it("shows the board with valid credentials and logs out", async () => {
    render(
      <LoginGate>
        <p>Board content</p>
      </LoginGate>
    );

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Board content")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Sign in to Kanban Studio" })).toBeInTheDocument();
    expect(screen.queryByText("Board content")).not.toBeInTheDocument();
  });
});

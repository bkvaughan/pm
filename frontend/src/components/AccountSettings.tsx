"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, type User } from "@/lib/api";
import { Field } from "@/components/Field";

type AccountSettingsProps = {
  user: User;
  onUserChange: (user: User) => void;
  onAccountDeleted: () => void;
};

type Status = { kind: "success" | "error"; message: string } | null;

const useFormAction = () => {
  const [status, setStatus] = useState<Status>(null);
  const [isBusy, setIsBusy] = useState(false);
  const run = async (action: () => Promise<string | void>) => {
    setStatus(null);
    setIsBusy(true);
    try {
      const message = await action();
      if (message) {
        setStatus({ kind: "success", message });
      }
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    } finally {
      setIsBusy(false);
    }
  };
  return { status, isBusy, run };
};

const Section = ({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: Status;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className="rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[0_4px_12px_rgba(3,33,71,0.06)]"
  >
    <h3 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
      {title}
    </h3>
    <p className="mt-1 text-sm text-[var(--gray-text)]">{description}</p>
    <div className="mt-5">{children}</div>
    {status && (
      <p
        role={status.kind === "error" ? "alert" : "status"}
        className={
          status.kind === "error"
            ? "mt-3 text-sm font-semibold text-red-700"
            : "mt-3 text-sm font-semibold text-emerald-700"
        }
      >
        {status.message}
      </p>
    )}
  </section>
);

const buttonClass =
  "mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60";

export const AccountSettings = ({
  user,
  onUserChange,
  onAccountDeleted,
}: AccountSettingsProps) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const profile = useFormAction();
  const password = useFormAction();
  const deletion = useFormAction();

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void profile.run(async () => {
      onUserChange(await api.updateAccount(displayName));
      return "Profile saved.";
    });
  };

  const savePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void password.run(async () => {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      return "Password changed. Other sessions were signed out.";
    });
  };

  const deleteAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void deletion.run(async () => {
      await api.deleteAccount(deletePassword);
      onAccountDeleted();
    });
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <div>
        <h2 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Account settings
        </h2>
        <p className="mt-1 text-sm text-[var(--gray-text)]">
          Signed in as <span className="font-semibold">{user.username}</span>
        </p>
      </div>

      <Section
        title="Profile"
        description="Your display name appears in the top bar."
        status={profile.status}
      >
        <form onSubmit={saveProfile}>
          <Field
            id="account-display-name"
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            maxLength={100}
          />
          <button
            type="submit"
            disabled={profile.isBusy}
            className={`${buttonClass} bg-[var(--secondary-purple)]`}
          >
            Save profile
          </button>
        </form>
      </Section>

      <Section
        title="Password"
        description="Changing your password signs out your other sessions."
        status={password.status}
      >
        <form onSubmit={savePassword} className="space-y-4">
          <Field
            id="current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <Field
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            minLength={8}
            hint="At least 8 characters."
          />
          <button
            type="submit"
            disabled={password.isBusy}
            className={`${buttonClass} bg-[var(--secondary-purple)]`}
          >
            Change password
          </button>
        </form>
      </Section>

      <Section
        title="Delete account"
        description="Permanently deletes your account and all of your boards."
        status={deletion.status}
      >
        <form onSubmit={deleteAccount}>
          <Field
            id="delete-password"
            label="Confirm with your password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={setDeletePassword}
          />
          <button
            type="submit"
            disabled={deletion.isBusy}
            className={`${buttonClass} bg-red-600`}
          >
            Delete account
          </button>
        </form>
      </Section>
    </main>
  );
};

"use client";

import { useState, type FormEvent } from "react";
import { api, type User } from "@/lib/api";
import { Field } from "@/components/Field";

type AuthScreenProps = {
  onAuthenticated: (user: User) => void;
};

export const AuthScreen = ({ onAuthenticated }: AuthScreenProps) => {
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = isRegistering
        ? await api.register(username, password, displayName)
        : await api.login(username, password);
      onAuthenticated(user);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to sign in."
      );
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegistering ? "signIn" : "register");
    setError(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {isRegistering ? "Create your account" : "Sign in to Kanban Studio"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isRegistering
            ? "Your account starts with an empty board."
            : "Sign in to open your project boards."}
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {isRegistering && (
            <Field
              id="display-name"
              label="Display name"
              autoComplete="name"
              value={displayName}
              onChange={setDisplayName}
              maxLength={100}
            />
          )}
          <Field
            id="username"
            label="Username"
            autoComplete="username"
            value={username}
            onChange={setUsername}
            hint={isRegistering ? "3-32 letters, numbers, dots, dashes, or underscores." : undefined}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={isRegistering ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            minLength={isRegistering ? 8 : undefined}
            hint={isRegistering ? "At least 8 characters." : undefined}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {isRegistering ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegistering ? "Already have an account?" : "New to Kanban Studio?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isRegistering ? "Sign in" : "Create an account"}
          </button>
        </p>
      </section>
    </main>
  );
};

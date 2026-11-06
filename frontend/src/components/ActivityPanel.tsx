"use client";

import { useEffect, useState } from "react";
import { api, type ActivityEntry } from "@/lib/api";

type ActivityPanelProps = {
  boardId: string;
  // Changes whenever the board is saved, so the list refetches.
  version: number;
};

export const formatRelativeTime = (iso: string, now: Date) => {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export const ActivityPanel = ({ boardId, version }: ActivityPanelProps) => {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    api.boardActivity(boardId).then(
      (next) => {
        if (isCurrent) {
          setEntries(next);
          setError(null);
        }
      },
      (loadError: unknown) => {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load activity.",
          );
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [boardId, version]);

  const now = new Date();

  return (
    <section
      aria-label="Board activity"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        {!entries && !error && (
          <p role="status" className="text-xs text-[var(--gray-text)]">
            Loading activity...
          </p>
        )}
        {entries && entries.length === 0 && (
          <p className="text-xs text-[var(--gray-text)]">No activity yet.</p>
        )}
        {entries && entries.length > 0 && (
          <ol className="space-y-2" aria-label="Recent changes">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl bg-[var(--surface)] px-3 py-2 text-xs leading-5"
              >
                <p className="text-[var(--navy-dark)]">{entry.message}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[var(--gray-text)]">
                  <time dateTime={entry.createdAt} title={entry.createdAt}>
                    {formatRelativeTime(entry.createdAt, now)}
                  </time>
                  {entry.source === "assistant" && (
                    <span className="rounded-full bg-[rgba(117,57,145,0.1)] px-1.5 font-semibold text-[var(--secondary-purple)]">
                      Assistant
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ActivityPanel } from "@/components/ActivityPanel";

type BoardSidebarProps = {
  boardId: string;
  activityVersion: number;
  assistant: ReactNode;
  archived: ReactNode;
  archivedCount: number;
};

type Tab = "assistant" | "activity" | "archived";

const tabs: { id: Tab; label: string }[] = [
  { id: "assistant", label: "Assistant" },
  { id: "activity", label: "Activity" },
  { id: "archived", label: "Archived" },
];

export const BoardSidebar = ({
  boardId,
  activityVersion,
  assistant,
  archived,
  archivedCount,
}: BoardSidebarProps) => {
  const [tab, setTab] = useState<Tab>("assistant");

  return (
    <aside
      aria-label="Board sidebar"
      className="flex h-[480px] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white shadow-[0_4px_12px_rgba(3,33,71,0.06)] xl:h-auto"
    >
      <div
        role="tablist"
        aria-label="Sidebar"
        className="flex border-b border-[var(--stroke)]"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`sidebar-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`sidebar-panel-${id}`}
            onClick={() => setTab(id)}
            className={clsx(
              "flex-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-sm font-semibold transition",
              tab === id
                ? "border-[var(--secondary-purple)] text-[var(--navy-dark)]"
                : "border-transparent text-[var(--gray-text)] hover:text-[var(--navy-dark)]",
            )}
          >
            {label}
            {id === "archived" && archivedCount > 0 && ` (${archivedCount})`}
          </button>
        ))}
      </div>
      {/* The assistant stays mounted so its conversation survives tab switches. */}
      <div
        role="tabpanel"
        id="sidebar-panel-assistant"
        aria-labelledby="sidebar-tab-assistant"
        hidden={tab !== "assistant"}
        className="flex min-h-0 flex-1 flex-col"
      >
        {assistant}
      </div>
      {tab === "activity" && (
        <div
          role="tabpanel"
          id="sidebar-panel-activity"
          aria-labelledby="sidebar-tab-activity"
          className="flex min-h-0 flex-1 flex-col"
        >
          <ActivityPanel boardId={boardId} version={activityVersion} />
        </div>
      )}
      {tab === "archived" && (
        <div
          role="tabpanel"
          id="sidebar-panel-archived"
          aria-labelledby="sidebar-tab-archived"
          className="flex min-h-0 flex-1 flex-col"
        >
          {archived}
        </div>
      )}
    </aside>
  );
};

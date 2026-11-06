import { useState } from "react";
import type { Card } from "@/lib/kanban";

type ArchivedCardsPanelProps = {
  entries: { card: Card; columnTitle: string }[];
  onRestore: (cardId: string) => void;
  onDelete: (cardId: string) => void;
};

const buttonClass =
  "rounded-lg px-2 py-1 text-xs font-semibold transition";

export const ArchivedCardsPanel = ({
  entries,
  onRestore,
  onDelete,
}: ArchivedCardsPanelProps) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <p className="p-4 text-sm text-[var(--gray-text)]">
        No archived cards. Archiving a card hides it from the board; restore it
        here.
      </p>
    );
  }

  return (
    <ul
      aria-label="Archived cards"
      className="min-h-0 flex-1 divide-y divide-[var(--stroke)] overflow-y-auto"
    >
      {entries.map(({ card, columnTitle }) => (
        <li key={card.id} className="px-4 py-3">
          <p className="text-sm font-semibold text-[var(--navy-dark)]">{card.title}</p>
          <p className="text-xs text-[var(--gray-text)]">From {columnTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {confirmingId === card.id ? (
              <>
                <span className="text-xs font-semibold text-red-700">
                  Delete permanently?
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(card.id)}
                  className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className={`${buttonClass} text-[var(--gray-text)] hover:text-[var(--navy-dark)]`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onRestore(card.id)}
                  aria-label={`Restore ${card.title}`}
                  className={`${buttonClass} border border-[var(--stroke)] text-[var(--primary-blue)] hover:border-[var(--primary-blue)]`}
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(card.id)}
                  aria-label={`Delete ${card.title} permanently`}
                  className={`${buttonClass} text-[var(--gray-text)] hover:bg-red-50 hover:text-red-600`}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

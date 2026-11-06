import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  MAX_WIP_LIMIT,
  parseWipLimit,
  type Card,
  type CardFields,
  type Column,
} from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { MoreIcon, TrashIcon } from "@/components/icons";

type KanbanColumnProps = {
  column: Column;
  cards: Card[]; // the visible cards
  activeCount: number; // unarchived cards, visible or filtered out
  isDropTarget: boolean;
  canDelete: boolean;
  isFirst: boolean;
  isLast: boolean;
  onRename: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onMove: (columnId: string, offset: -1 | 1) => void;
  onSetWipLimit: (columnId: string, wipLimit: number | null) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onArchiveCard: (cardId: string) => void;
  onEditCard: (cardId: string, fields: Partial<CardFields>) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  activeCount,
  isDropTarget,
  canDelete,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onMove,
  onSetWipLimit,
  onAddCard,
  onArchiveCard,
  onEditCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const total = activeCount;
  const isFiltered = cards.length !== total;
  const isOverLimit = column.wipLimit !== null && total > column.wipLimit;
  const countText = isFiltered
    ? `${cards.length}/${total}`
    : column.wipLimit !== null
      ? `${total}/${column.wipLimit}`
      : String(total);
  const countLabel = [
    isFiltered ? `${cards.length} of ${total} cards shown` : `${total} cards`,
    column.wipLimit !== null &&
      `${isOverLimit ? "over" : "within"} the WIP limit of ${column.wipLimit}`,
  ]
    .filter(Boolean)
    .join(", ");

  const commitWipLimit = (input: HTMLInputElement) => {
    const wipLimit = parseWipLimit(input.value);
    if (wipLimit === undefined) {
      input.value = column.wipLimit?.toString() ?? "";
      return;
    }
    if (wipLimit !== column.wipLimit) {
      onSetWipLimit(column.id, wipLimit);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[420px] min-w-[170px] flex-1 basis-0 flex-col rounded-2xl border p-3 transition",
        isOver || isDropTarget
          ? "border-[var(--accent-yellow)] bg-amber-50 shadow-[0_0_0_3px_rgba(236,173,10,0.18)]"
          : "border-[var(--stroke)] bg-[rgba(3,33,71,0.03)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-1">
        <input
          key={column.title}
          defaultValue={column.title}
          onBlur={(event) => {
            const title = event.target.value.trim();
            event.target.value = title || column.title;
            if (title && title !== column.title) {
              onRename(column.id, title);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-display text-sm font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-white/70 focus:bg-white focus:ring-2 focus:ring-[rgba(32,157,215,0.4)]"
          aria-label="Column title"
          title={column.title}
        />
        <span
          className={clsx(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm",
            isOverLimit ? "bg-red-600 text-white" : "bg-white text-[var(--gray-text)]"
          )}
          aria-label={countLabel}
          title={countLabel}
          data-testid="count-badge"
        >
          {countText}
        </span>
        <button
          type="button"
          onClick={() => setShowOptions((open) => !open)}
          aria-label={`Column options for ${column.title}`}
          aria-expanded={showOptions}
          title="Column options"
          className="shrink-0 rounded-md p-1 text-[var(--gray-text)] transition hover:bg-white hover:text-[var(--primary-blue)]"
        >
          <MoreIcon width={13} height={13} />
        </button>
      </div>
      {showOptions && (
        <div
          className="mt-2 space-y-2 rounded-lg border border-[var(--stroke)] bg-white p-2 text-xs"
          data-testid="options-panel"
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onMove(column.id, -1)}
              disabled={isFirst}
              className="flex-1 rounded-md border border-[var(--stroke)] px-2 py-1 font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:opacity-40"
            >
              Move left
            </button>
            <button
              type="button"
              onClick={() => onMove(column.id, 1)}
              disabled={isLast}
              className="flex-1 rounded-md border border-[var(--stroke)] px-2 py-1 font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:opacity-40"
            >
              Move right
            </button>
          </div>
          <label className="flex items-center justify-between gap-2 font-semibold text-[var(--navy-dark)]">
            WIP limit
            <input
              key={column.wipLimit ?? "none"}
              type="number"
              min={1}
              max={MAX_WIP_LIMIT}
              defaultValue={column.wipLimit ?? ""}
              placeholder="None"
              onBlur={(event) => commitWipLimit(event.target)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="w-20 rounded-md border border-[var(--stroke)] px-2 py-1 font-normal outline-none focus:border-[var(--primary-blue)]"
            />
          </label>
          {canDelete && (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              aria-label={`Delete column ${column.title}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 font-semibold text-red-700 transition hover:bg-red-50"
            >
              <TrashIcon width={13} height={13} />
              Delete column
            </button>
          )}
        </div>
      )}
      {isConfirmingDelete && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs">
          <span className="flex-1 font-semibold text-red-700">
            {column.cardIds.length
              ? `Delete this column and its ${column.cardIds.length} ${column.cardIds.length === 1 ? "card" : "cards"}?`
              : "Delete this column?"}
          </span>
          <button
            type="button"
            onClick={() => onDelete(column.id)}
            className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(false)}
            className="rounded-md px-2.5 py-1 font-semibold text-[var(--gray-text)]"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onArchive={onArchiveCard}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-[rgba(3,33,71,0.15)] px-3 py-8 text-center text-xs font-semibold text-[var(--gray-text)]">
            {total ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};

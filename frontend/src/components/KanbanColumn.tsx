import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  isDropTarget: boolean;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  isDropTarget,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[420px] flex-col rounded-2xl border p-3 transition",
        isOver || isDropTarget
          ? "border-[var(--accent-yellow)] bg-amber-50 shadow-[0_0_0_3px_rgba(236,173,10,0.18)]"
          : "border-[var(--stroke)] bg-[rgba(3,33,71,0.03)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
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
        />
        <span
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)] shadow-sm"
          aria-label={`${cards.length} cards`}
        >
          {cards.length}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-[rgba(3,33,71,0.15)] px-3 py-8 text-center text-xs font-semibold text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};

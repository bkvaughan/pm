import type { Card } from "@/lib/kanban";
import { CardMeta } from "@/components/CardMeta";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rotate-1 rounded-xl border border-[rgba(32,157,215,0.35)] bg-white p-3 shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <h4 className="font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
      {card.title}
    </h4>
    <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">
      {card.details}
    </p>
    <CardMeta card={card} />
  </article>
);

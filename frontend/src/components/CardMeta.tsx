import clsx from "clsx";
import {
  dueStatus,
  formatDueDate,
  toIsoDate,
  type Card,
  type DueStatus,
  type Priority,
} from "@/lib/kanban";

const priorityStyles: Record<Priority, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const dueStyles: Record<DueStatus, string> = {
  overdue: "bg-red-50 text-red-700",
  today: "bg-amber-50 text-amber-700",
  upcoming: "bg-slate-100 text-slate-600",
};

const dueLabel = (status: DueStatus, dueDate: string) =>
  status === "overdue"
    ? `Overdue ${formatDueDate(dueDate)}`
    : status === "today"
      ? "Due today"
      : `Due ${formatDueDate(dueDate)}`;

const badge = "rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4";

export const CardMeta = ({ card }: { card: Card }) => {
  if (!card.priority && !card.dueDate && card.labels.length === 0) {
    return null;
  }
  const status = card.dueDate ? dueStatus(card.dueDate, toIsoDate(new Date())) : null;

  return (
    <div className="mt-2 flex flex-wrap gap-1" data-testid="badges">
      {card.priority && (
        <span className={clsx(badge, priorityStyles[card.priority])}>
          {card.priority[0].toUpperCase() + card.priority.slice(1)} priority
        </span>
      )}
      {card.dueDate && status && (
        <span
          className={clsx(badge, dueStyles[status])}
          data-due-status={status}
          title={card.dueDate}
        >
          {dueLabel(status, card.dueDate)}
        </span>
      )}
      {card.labels.map((label) => (
        <span
          key={label}
          className={clsx(badge, "bg-[rgba(32,157,215,0.1)] text-[var(--primary-blue)]")}
        >
          {label}
        </span>
      ))}
    </div>
  );
};

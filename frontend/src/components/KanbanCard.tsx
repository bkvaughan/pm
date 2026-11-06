import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  PRIORITIES,
  parseLabels,
  toggleChecklistItem,
  type Card,
  type ChecklistItem,
  type CardFields,
  type Priority,
} from "@/lib/kanban";
import { CardMeta } from "@/components/CardMeta";
import { ChecklistEditor, ChecklistView } from "@/components/CardChecklist";
import { ArchiveIcon, PencilIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  onArchive: (cardId: string) => void;
  onEdit: (cardId: string, fields: Partial<CardFields>) => void;
};

type FormState = {
  title: string;
  details: string;
  priority: Priority | "";
  dueDate: string;
  labels: string;
  checklist: ChecklistItem[];
};

const emptyForm: FormState = {
  title: "",
  details: "",
  priority: "",
  dueDate: "",
  labels: "",
  checklist: [],
};

const fieldClass =
  "w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const KanbanCard = ({ card, onArchive, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setFormState((prev) => ({ ...prev, [key]: value }));
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });
  // Registering the card as its own activator makes dnd-kit's keyboard sensor
  // ignore Space and Enter pressed on controls inside it (checkboxes, buttons).
  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setFormState({
      title: card.title,
      details: card.details,
      priority: card.priority ?? "",
      dueDate: card.dueDate ?? "",
      labels: card.labels.join(", "),
      checklist: card.checklist,
    });
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = formState.title.trim();
    if (!title) {
      return;
    }
    onEdit(card.id, {
      title,
      details: formState.details.trim(),
      priority: formState.priority || null,
      dueDate: formState.dueDate || null,
      labels: parseLabels(formState.labels),
      checklist: formState.checklist
        .map((item) => ({ ...item, text: item.text.trim() }))
        .filter((item) => item.text),
    });
    setIsEditing(false);
  };

  return (
    <article
      ref={setRefs}
      style={style}
      className={clsx(
        "group relative rounded-xl border border-[var(--stroke)] bg-white p-3 shadow-[0_4px_12px_rgba(3,33,71,0.06)]",
        "transition-[border-color,box-shadow,opacity] duration-150 hover:border-[rgba(32,157,215,0.35)] hover:shadow-[0_8px_20px_rgba(3,33,71,0.1)]",
        !isEditing && "cursor-grab active:cursor-grabbing",
        isDragging &&
          "z-10 opacity-30 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            value={formState.title}
            onChange={(event) => setField("title", event.target.value)}
            aria-label="Card title"
            className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
            autoFocus
          />
          <textarea
            value={formState.details}
            onChange={(event) => setField("details", event.target.value)}
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs leading-5 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={formState.priority}
              onChange={(event) =>
                setField("priority", event.target.value as Priority | "")
              }
              aria-label="Priority"
              className={fieldClass}
            >
              <option value="">No priority</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={formState.dueDate}
              onChange={(event) => setField("dueDate", event.target.value)}
              aria-label="Due date"
              className={fieldClass}
            />
          </div>
          <input
            value={formState.labels}
            onChange={(event) => setField("labels", event.target.value)}
            aria-label="Labels"
            placeholder="Labels, comma separated"
            className={fieldClass}
          />
          <ChecklistEditor
            items={formState.checklist}
            onChange={(checklist) => setField("checklist", checklist)}
            inputClassName={fieldClass}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h4 className="font-display text-sm font-semibold leading-5 text-[var(--navy-dark)] [@media(hover:none)]:pr-16">
            {card.title}
          </h4>
          <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">
            {card.details}
          </p>
          <CardMeta card={card} />
          <ChecklistView
            title={card.title}
            items={card.checklist}
            onToggle={(itemId) =>
              onEdit(card.id, { checklist: toggleChecklistItem(card.checklist, itemId) })
            }
          />
          <div className="absolute right-2 top-2 flex gap-0.5 rounded-lg bg-white/95 p-0.5 shadow-sm transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit"
            >
              <PencilIcon width={14} height={14} />
            </button>
            <button
              type="button"
              onClick={() => onArchive(card.id)}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Archive ${card.title}`}
              title="Archive"
            >
              <ArchiveIcon width={14} height={14} />
            </button>
          </div>
        </>
      )}
    </article>
  );
};

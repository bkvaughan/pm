import { useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import {
  createId,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT_LENGTH,
  toggleChecklistItem,
  type ChecklistItem,
} from "@/lib/kanban";
import { TrashIcon } from "@/components/icons";

type ChecklistViewProps = {
  title: string;
  items: ChecklistItem[];
  onToggle: (itemId: string) => void;
};

export const ChecklistView = ({ title, items, onToggle }: ChecklistViewProps) => {
  if (items.length === 0) {
    return null;
  }
  const done = items.filter((item) => item.done).length;

  return (
    <div className="mt-2">
      <p
        className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-text)]"
        data-testid="checklist-progress"
      >
        Checklist {done}/{items.length}
      </p>
      <ul aria-label={`Checklist for ${title}`} className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--navy-dark)]">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(item.id)}
                className="mt-1 accent-[var(--secondary-purple)]"
              />
              <span className={clsx(item.done && "text-[var(--gray-text)] line-through")}>
                {item.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

type ChecklistEditorProps = {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  inputClassName: string;
};

export const ChecklistEditor = ({
  items,
  onChange,
  inputClassName,
}: ChecklistEditorProps) => {
  const [draft, setDraft] = useState("");
  const isFull = items.length >= MAX_CHECKLIST_ITEMS;

  const addItem = () => {
    const text = draft.trim();
    if (!text || isFull) {
      return;
    }
    onChange([...items, { id: createId("item"), text, done: false }]);
    setDraft("");
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Enter adds the item instead of submitting the card form.
      event.preventDefault();
      addItem();
    }
  };

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
        Checklist
      </legend>
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => onChange(toggleChecklistItem(items, item.id))}
            aria-label={`Done: checklist item ${index + 1}`}
            className="accent-[var(--secondary-purple)]"
          />
          <input
            value={item.text}
            onChange={(event) =>
              onChange(
                items.map((other) =>
                  other.id === item.id ? { ...other, text: event.target.value } : other
                )
              )
            }
            aria-label={`Checklist item ${index + 1}`}
            maxLength={MAX_CHECKLIST_TEXT_LENGTH}
            className={inputClassName}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((other) => other.id !== item.id))}
            aria-label={`Remove checklist item ${index + 1}`}
            className="rounded-md p-1 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon width={12} height={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          aria-label="New checklist item"
          placeholder={isFull ? "Checklist is full" : "Add an item"}
          disabled={isFull}
          maxLength={MAX_CHECKLIST_TEXT_LENGTH}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={addItem}
          disabled={isFull}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)] disabled:opacity-50"
        >
          Add item
        </button>
      </div>
    </fieldset>
  );
};

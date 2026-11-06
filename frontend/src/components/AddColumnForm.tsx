import { useState, type FormEvent } from "react";
import { PlusIcon } from "@/components/icons";

type AddColumnFormProps = {
  onAdd: (title: string) => void;
};

export const AddColumnForm = ({ onAdd }: AddColumnFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const close = () => {
    setIsOpen(false);
    setTitle("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim()) {
      onAdd(title.trim());
      close();
    }
  };

  return (
    <div>
      {isOpen ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Column title"
            aria-label="New column title"
            autoFocus
            className="w-40 rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
          >
            Add column
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(3,33,71,0.2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
        >
          <PlusIcon width={14} height={14} />
          Add column
        </button>
      )}
    </div>
  );
};

import {
  PRIORITIES,
  isFilterActive,
  emptyFilter,
  type CardFilter,
  type DueFilter,
  type Priority,
} from "@/lib/kanban";

type BoardFiltersProps = {
  filter: CardFilter;
  labels: string[];
  matchCount: number;
  totalCount: number;
  onChange: (filter: CardFilter) => void;
};

const controlClass =
  "rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const dueOptions: { value: DueFilter; label: string }[] = [
  { value: "", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due in 7 days" },
  { value: "none", label: "No due date" },
];

export const BoardFilters = ({
  filter,
  labels,
  matchCount,
  totalCount,
  onChange,
}: BoardFiltersProps) => {
  const set = <K extends keyof CardFilter>(key: K, value: CardFilter[K]) =>
    onChange({ ...filter, [key]: value });
  const active = isFilterActive(filter);

  return (
    <div role="search" aria-label="Filter cards" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filter.query}
        onChange={(event) => set("query", event.target.value)}
        placeholder="Search cards"
        aria-label="Search cards"
        className={`${controlClass} w-48`}
      />
      <select
        value={filter.priority}
        onChange={(event) => set("priority", event.target.value as Priority | "")}
        aria-label="Filter by priority"
        className={controlClass}
      >
        <option value="">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority[0].toUpperCase() + priority.slice(1)}
          </option>
        ))}
      </select>
      <select
        value={filter.label}
        onChange={(event) => set("label", event.target.value)}
        aria-label="Filter by label"
        className={controlClass}
        disabled={labels.length === 0}
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={filter.due}
        onChange={(event) => set("due", event.target.value as DueFilter)}
        aria-label="Filter by due date"
        className={controlClass}
      >
        {dueOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {active && (
        <>
          <span
            className="text-xs font-semibold text-[var(--gray-text)]"
            aria-live="polite"
            data-testid="filter-summary"
          >
            Showing {matchCount} of {totalCount} cards
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyFilter)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] hover:underline"
          >
            Clear filters
          </button>
        </>
      )}
    </div>
  );
};

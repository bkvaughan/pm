import type { BoardData } from "@/lib/kanban";

// Mirrors the backend seed in backend/app/initial_data.py.
export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"], wipLimit: null },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"], wipLimit: null },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
      wipLimit: 3,
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"], wipLimit: 2 },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"], wipLimit: null },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "high",
      dueDate: null,
      labels: ["Planning"],
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
      priority: "medium",
      dueDate: null,
      labels: ["Research"],
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
      priority: "medium",
      dueDate: null,
      labels: ["Design", "Analytics"],
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
      priority: "low",
      dueDate: null,
      labels: [],
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
      priority: "high",
      dueDate: null,
      labels: ["Design"],
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
      priority: "medium",
      dueDate: null,
      labels: ["QA"],
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
      priority: null,
      dueDate: null,
      labels: ["Marketing"],
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
      priority: null,
      dueDate: null,
      labels: [],
    },
  },
};

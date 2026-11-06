import type { BoardData } from "@/lib/kanban";

export type User = {
  id: string;
  username: string;
  displayName: string;
};

export type BoardSummary = {
  id: string;
  name: string;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ActivityEntry = {
  id: number;
  source: "user" | "assistant";
  message: string;
  createdAt: string;
};

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantResponse = {
  reply: string;
  board: BoardData | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const errorMessage = (detail: unknown, status: number) => {
  if (typeof detail === "string") {
    return detail;
  }
  // FastAPI validation errors: [{ msg: "..." }]
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg as string;
  }
  return `Request failed (${status}).`;
};

export const request = async <T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> => {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    signal: init.signal,
    headers:
      init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new ApiError(errorMessage(payload?.detail, response.status), response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
};

export const api = {
  me: () => request<User>("/api/auth/me"),
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  register: (username: string, password: string, displayName: string) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: { username, password, displayName },
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  updateAccount: (displayName: string) =>
    request<User>("/api/account", { method: "PATCH", body: { displayName } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/account/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  deleteAccount: (password: string) =>
    request<void>("/api/account/delete", { method: "POST", body: { password } }),
  listBoards: () => request<BoardSummary[]>("/api/boards"),
  createBoard: (name: string) =>
    request<BoardSummary>("/api/boards", { method: "POST", body: { name } }),
  renameBoard: (boardId: string, name: string) =>
    request<BoardSummary>(`/api/boards/${boardId}`, {
      method: "PATCH",
      body: { name },
    }),
  deleteBoard: (boardId: string) =>
    request<void>(`/api/boards/${boardId}`, { method: "DELETE" }),
  getBoard: (boardId: string, signal?: AbortSignal) =>
    request<BoardData>(`/api/boards/${boardId}`, { signal }),
  saveBoard: (boardId: string, board: BoardData) =>
    request<BoardData>(`/api/boards/${boardId}`, { method: "PUT", body: board }),
  boardActivity: (boardId: string) =>
    request<ActivityEntry[]>(`/api/boards/${boardId}/activity`),
  askAssistant: (boardId: string, message: string, history: AssistantMessage[]) =>
    request<AssistantResponse>(`/api/boards/${boardId}/assistant`, {
      method: "POST",
      body: { message, history },
    }),
};

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardData } from "@/lib/kanban";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AIAssistantResponse = {
  reply: string;
  board: BoardData | null;
};

type AIChatSidebarProps = {
  waitForSaves: () => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
  onBoardUpdate: (board: BoardData) => void;
};

export const AIChatSidebar = ({
  waitForSaves,
  onBusyChange,
  onBoardUpdate,
}: AIChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-${messages.length}`,
      role: "user",
      content: message,
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError(null);
    setIsSending(true);
    onBusyChange(true);

    try {
      await waitForSaves();
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: messages.slice(-20).map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        setError(
          errorPayload?.detail ??
            `Assistant request failed (${response.status}).`
        );
        return;
      }

      const payload = (await response.json()) as AIAssistantResponse;

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-${messages.length + 1}`,
          role: "assistant",
          content: payload.reply,
        },
      ]);
      if (payload.board) {
        onBoardUpdate(payload.board);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to contact the assistant."
      );
    } finally {
      setIsSending(false);
      onBusyChange(false);
    }
  };

  return (
    <aside
      aria-label="AI project assistant"
      className="flex min-h-[520px] flex-col overflow-hidden rounded-[28px] border border-[var(--stroke)] bg-white/90 shadow-[var(--shadow)] backdrop-blur 2xl:sticky 2xl:top-6 2xl:h-[calc(100vh-3rem)]"
    >
      <header className="border-b border-[var(--stroke)] px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Project assistant
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
          Ask about your board
        </h2>
        <p className="mt-2 text-sm leading-5 text-[var(--gray-text)]">
          Ask a question or request a card or column update.
        </p>
      </header>

      <div
        ref={messageListRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--gray-text)]">
            Try “Summarize the board” or “Move the analytics prototype to
            Review.”
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-6 self-end rounded-2xl bg-[var(--secondary-purple)] px-4 py-3 text-sm leading-6 text-white"
                  : "mr-6 self-start rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          ))
        )}
        {isSending && (
          <p role="status" className="text-sm text-[var(--gray-text)]">
            Assistant is thinking... Replies can take up to a minute.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--stroke)] p-4"
      >
        {error && (
          <p role="alert" className="mb-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <label htmlFor="assistant-message" className="sr-only">
          Message the assistant
        </label>
        <textarea
          id="assistant-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question or request a change..."
          rows={3}
          maxLength={4000}
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm leading-6 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};

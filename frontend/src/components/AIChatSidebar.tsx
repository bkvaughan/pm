"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardData } from "@/lib/kanban";
import { api } from "@/lib/api";
import { SendIcon } from "@/components/icons";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AIChatSidebarProps = {
  boardId: string;
  waitForSaves: () => Promise<void>;
  onBusyChange: (isBusy: boolean) => void;
  onBoardUpdate: (board: BoardData) => void;
};

export const AIChatSidebar = ({
  boardId,
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
      const payload = await api.askAssistant(
        boardId,
        message,
        messages.slice(-20).map(({ role, content }) => ({ role, content }))
      );

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
    <section
      aria-label="AI project assistant"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex items-center gap-3 border-b border-[var(--stroke)] px-4 py-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--secondary-purple)]" />
        <div>
          <h2 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
            Project assistant
          </h2>
          <p className="text-xs text-[var(--gray-text)]">
            Ask a question or request a card or column update.
          </p>
        </div>
      </header>

      <div
        ref={messageListRef}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
      >
        {messages.length === 0 ? (
          <p className="rounded-xl bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--gray-text)]">
            Try &ldquo;Summarize the board&rdquo; or &ldquo;Move the analytics
            prototype to Review.&rdquo;
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-8 self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-[var(--secondary-purple)] px-3 py-2 text-sm leading-5 text-white"
                  : "mr-8 self-start whitespace-pre-wrap rounded-xl rounded-bl-sm bg-[var(--surface)] px-3 py-2 text-sm leading-5 text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          ))
        )}
        {isSending && (
          <p role="status" className="text-xs text-[var(--gray-text)]">
            Assistant is thinking... Replies can take up to a minute.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--stroke)] p-3"
      >
        {error && (
          <p role="alert" className="mb-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <label htmlFor="assistant-message" className="sr-only">
          Message the assistant
        </label>
        <div className="flex items-end gap-2 rounded-xl border border-[var(--stroke)] bg-white p-1.5 transition focus-within:border-[var(--primary-blue)]">
          <textarea
            id="assistant-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a question or request a change..."
            rows={2}
            maxLength={4000}
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-5 text-[var(--navy-dark)] outline-none"
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            aria-label="Send"
            title="Send"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--secondary-purple)] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </section>
  );
};

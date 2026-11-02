"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

export const KanbanBoard = () => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssistantBusy, setIsAssistantBusy] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(
    null
  );
  const boardRef = useRef<BoardData | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadBoard = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      const response = await fetch("/api/board", { signal });
      if (!response.ok) {
        throw new Error(`Board request failed (${response.status}).`);
      }
      const nextBoard = (await response.json()) as BoardData;
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      setSaveError(null);
    } catch (error) {
      if (!signal?.aborted) {
        setLoadError(
          error instanceof Error ? error.message : "Unable to load the board."
        );
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  const updateBoard = (update: (current: BoardData) => BoardData) => {
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return;
    }

    const nextBoard = update(currentBoard);
    boardRef.current = nextBoard;
    setBoard(nextBoard);
    setSaveError(null);
    pendingSaves.current += 1;
    setIsSaving(true);
    saveQueue.current = saveQueue.current
      .then(async () => {
        const response = await fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextBoard),
        });
        if (!response.ok) {
          throw new Error(`Board save failed (${response.status}).`);
        }
        setSaveError(null);
      })
      .catch((error: unknown) => {
        setSaveError(
          error instanceof Error ? error.message : "Unable to save the board."
        );
      })
      .finally(() => {
        pendingSaves.current -= 1;
        setIsSaving(pendingSaves.current > 0);
      });
  };

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);
  const detectCollision: CollisionDetection = (args) => {
    const currentBoard = boardRef.current;
    if (!currentBoard) {
      return [];
    }

    const pointerCoordinates = args.pointerCoordinates;
    // Keyboard drags have no pointer; match the moved card's rectangle instead.
    if (!pointerCoordinates) {
      return closestCorners(args);
    }
    const columnIds = new Set(currentBoard.columns.map((column) => column.id));
    const pointerCollisions = pointerWithin(args);
    const columnContainers = args.droppableContainers.filter(({ id }) =>
      columnIds.has(String(id))
    );
    const pointerColumnCollision = pointerCollisions.find(({ id }) =>
      columnIds.has(String(id))
    );
    const columnRects = columnContainers
      .map(({ id }) => args.droppableRects.get(id))
      .filter((rect): rect is NonNullable<typeof rect> => rect !== undefined);
    const withinBoardBounds =
      columnRects.length > 0 &&
      pointerCoordinates.x >= Math.min(...columnRects.map(({ left }) => left)) &&
      pointerCoordinates.x <= Math.max(...columnRects.map(({ right }) => right)) &&
      pointerCoordinates.y >= Math.min(...columnRects.map(({ top }) => top)) &&
      pointerCoordinates.y <= Math.max(...columnRects.map(({ bottom }) => bottom));
    const nearestColumnCollision =
      !pointerColumnCollision && withinBoardBounds
        ? closestCenter({
            ...args,
            collisionRect: {
              left: pointerCoordinates.x,
              right: pointerCoordinates.x,
              top: pointerCoordinates.y,
              bottom: pointerCoordinates.y,
              width: 0,
              height: 0,
            },
            droppableContainers: columnContainers,
          })[0]
        : undefined;
    const columnCollision = pointerColumnCollision ?? nearestColumnCollision;

    if (!columnCollision) {
      return [];
    }

    const targetColumn = currentBoard.columns.find(
      (column) => column.id === String(columnCollision.id)
    );
    if (!targetColumn) {
      return [];
    }

    const cardIds = new Set(
      targetColumn.cardIds.filter((cardId) => cardId !== String(args.active.id))
    );
    const cardCollisions = pointerCollisions.filter(({ id }) =>
      cardIds.has(String(id))
    );
    return cardCollisions.length
      ? closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(({ id }) =>
            cardCollisions.some((collision) => collision.id === id)
          ),
        })
      : [columnCollision];
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    setActiveCardWidth(event.active.rect.current.initial?.width ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    const targetColumn = boardRef.current?.columns.find(
      (column) =>
        column.id === overId || column.cardIds.includes(overId ?? "")
    );
    setDropTargetColumnId(targetColumn?.id ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setActiveCardWidth(null);
    setDropTargetColumnId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((current) => ({
      ...current,
      columns: moveCard(current.columns, active.id as string, over.id as string),
    }));
  };

  const handleDragCancel = () => {
    setActiveCardId(null);
    setActiveCardWidth(null);
    setDropTargetColumnId(null);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: current.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleEditCard = (cardId: string, title: string, details: string) => {
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [cardId]: { ...current.cards[cardId], title, details },
      },
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((current) => ({
      ...current,
      cards: Object.fromEntries(
        Object.entries(current.cards).filter(([id]) => id !== cardId)
      ),
      columns: current.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    }));
  };

  // The backend has already saved the assistant's changes.
  const handleAssistantBoardUpdate = (nextBoard: BoardData) => {
    boardRef.current = nextBoard;
    setBoard(nextBoard);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p role="alert" className="text-sm font-semibold text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void loadBoard()}
            className="mt-4 rounded-full bg-[var(--secondary-purple)] px-5 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="status" className="text-sm font-semibold text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[2000px] gap-6 px-6 pb-16 pt-8 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <main
          inert={isAssistantBusy}
          aria-busy={isAssistantBusy}
          className={clsx(
            "flex min-w-0 flex-col gap-10 transition-opacity",
            isAssistantBusy && "opacity-60"
          )}
        >
          <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          {saveError && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm font-semibold text-red-700">
                {saveError}
              </p>
              <button
                type="button"
                onClick={() => void loadBoard()}
                className="rounded-full border border-[var(--stroke)] px-4 py-1 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
              >
                Reload board
              </button>
            </div>
          )}
          <p
            data-testid="board-save-status"
            className="text-sm text-[var(--gray-text)]"
            aria-live="polite"
          >
            {isAssistantBusy
              ? "Board is locked while the assistant works..."
              : isSaving
                ? "Saving changes..."
                : "Saved"}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={detectCollision}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="overflow-x-auto pb-4">
              <section className="grid min-w-[1100px] grid-cols-5 gap-6">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cardIds.map((cardId) => board.cards[cardId])}
                    isDropTarget={dropTargetColumnId === column.id}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onEditCard={handleEditCard}
                  />
                ))}
              </section>
            </div>
            <DragOverlay
              dropAnimation={{
                duration: 180,
                easing: "cubic-bezier(0.2, 0, 0, 1)",
              }}
            >
              {activeCard ? (
                <div
                  style={
                    activeCardWidth ? { width: activeCardWidth } : undefined
                  }
                >
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
        <AIChatSidebar
          waitForSaves={() => saveQueue.current}
          onBusyChange={setIsAssistantBusy}
          onBoardUpdate={handleAssistantBoardUpdate}
        />
      </div>
    </div>
  );
};

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
import { BoardSidebar } from "@/components/BoardSidebar";
import { AddColumnForm } from "@/components/AddColumnForm";
import { BoardFilters } from "@/components/BoardFilters";
import { api } from "@/lib/api";
import {
  boardLabels,
  createId,
  emptyFilter,
  matchesFilter,
  moveCard,
  moveColumn,
  toIsoDate,
  type BoardData,
  type CardFields,
  type CardFilter,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: string;
};

export const KanbanBoard = ({ boardId }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssistantBusy, setIsAssistantBusy] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(
    null,
  );
  const [filter, setFilter] = useState<CardFilter>(emptyFilter);
  const [activityVersion, setActivityVersion] = useState(0);
  const boardRef = useRef<BoardData | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadBoard = useCallback(
    (signal?: AbortSignal) =>
      api.getBoard(boardId, signal).then(
        (nextBoard) => {
          boardRef.current = nextBoard;
          setBoard(nextBoard);
          setSaveError(null);
        },
        (error: unknown) => {
          if (!signal?.aborted) {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Unable to load the board.",
            );
          }
        },
      ),
    [boardId],
  );

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
        await api.saveBoard(boardId, nextBoard);
        setSaveError(null);
        setActivityVersion((version) => version + 1);
      })
      .catch((error: unknown) => {
        setSaveError(
          error instanceof Error
            ? `Unable to save changes: ${error.message}`
            : "Unable to save changes.",
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
      columnIds.has(String(id)),
    );
    const pointerColumnCollision = pointerCollisions.find(({ id }) =>
      columnIds.has(String(id)),
    );
    const columnRects = columnContainers
      .map(({ id }) => args.droppableRects.get(id))
      .filter((rect): rect is NonNullable<typeof rect> => rect !== undefined);
    const withinBoardBounds =
      columnRects.length > 0 &&
      pointerCoordinates.x >=
        Math.min(...columnRects.map(({ left }) => left)) &&
      pointerCoordinates.x <=
        Math.max(...columnRects.map(({ right }) => right)) &&
      pointerCoordinates.y >= Math.min(...columnRects.map(({ top }) => top)) &&
      pointerCoordinates.y <=
        Math.max(...columnRects.map(({ bottom }) => bottom));
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
      (column) => column.id === String(columnCollision.id),
    );
    if (!targetColumn) {
      return [];
    }

    const cardIds = new Set(
      targetColumn.cardIds.filter(
        (cardId) => cardId !== String(args.active.id),
      ),
    );
    const cardCollisions = pointerCollisions.filter(({ id }) =>
      cardIds.has(String(id)),
    );
    return cardCollisions.length
      ? closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(({ id }) =>
            cardCollisions.some((collision) => collision.id === id),
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
      (column) => column.id === overId || column.cardIds.includes(overId ?? ""),
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
      columns: moveCard(
        current.columns,
        active.id as string,
        over.id as string,
      ),
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
        column.id === columnId ? { ...column, title } : column,
      ),
    }));
  };

  const handleAddColumn = (title: string) => {
    updateBoard((current) => ({
      ...current,
      columns: [
        ...current.columns,
        { id: createId("col"), title, cardIds: [], wipLimit: null },
      ],
    }));
  };

  const handleMoveColumn = (columnId: string, offset: -1 | 1) => {
    updateBoard((current) => ({
      ...current,
      columns: moveColumn(current.columns, columnId, offset),
    }));
  };

  const handleSetWipLimit = (columnId: string, wipLimit: number | null) => {
    updateBoard((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, wipLimit } : column,
      ),
    }));
  };

  const handleDeleteColumn = (columnId: string) => {
    updateBoard((current) => {
      const removed = new Set(
        current.columns.find((column) => column.id === columnId)?.cardIds,
      );
      return {
        columns: current.columns.filter((column) => column.id !== columnId),
        cards: Object.fromEntries(
          Object.entries(current.cards).filter(([id]) => !removed.has(id)),
        ),
      };
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [id]: {
          id,
          title,
          details: details || "No details yet.",
          priority: null,
          dueDate: null,
          labels: [],
        },
      },
      columns: current.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column,
      ),
    }));
  };

  const handleEditCard = (cardId: string, fields: CardFields) => {
    updateBoard((current) => ({
      ...current,
      cards: {
        ...current.cards,
        [cardId]: { ...current.cards[cardId], ...fields },
      },
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((current) => ({
      ...current,
      cards: Object.fromEntries(
        Object.entries(current.cards).filter(([id]) => id !== cardId),
      ),
      columns: current.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column,
      ),
    }));
  };

  // The backend has already saved the assistant's changes.
  const handleAssistantBoardUpdate = (nextBoard: BoardData) => {
    setActivityVersion((version) => version + 1);
    boardRef.current = nextBoard;
    setBoard(nextBoard);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (loadError) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p role="alert" className="text-sm font-semibold text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              void loadBoard();
            }}
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
      <main className="flex flex-1 items-center justify-center py-16">
        <p
          role="status"
          className="text-sm font-semibold text-[var(--gray-text)]"
        >
          Loading board...
        </p>
      </main>
    );
  }

  const cardCount = Object.keys(board.cards).length;
  const today = toIsoDate(new Date());
  const visibleCardIds = new Set(
    Object.values(board.cards)
      .filter((card) => matchesFilter(card, filter, today))
      .map((card) => card.id),
  );

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <main
        inert={isAssistantBusy}
        aria-busy={isAssistantBusy}
        className={clsx(
          "flex min-h-0 min-w-0 flex-col gap-3 transition-opacity",
          isAssistantBusy && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--gray-text)]">
              {board.columns.length} columns, {cardCount} cards
            </p>
            <BoardFilters
              filter={filter}
              labels={boardLabels(board)}
              matchCount={visibleCardIds.size}
              totalCount={cardCount}
              onChange={setFilter}
            />
            <AddColumnForm onAdd={handleAddColumn} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {saveError && (
              <>
                <p role="alert" className="text-sm font-semibold text-red-700">
                  {saveError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadBoard()}
                  className="rounded-lg border border-[var(--stroke)] bg-white px-3 py-1 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
                >
                  Reload board
                </button>
              </>
            )}
            <p
              data-testid="board-save-status"
              className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--gray-text)] shadow-sm"
              aria-live="polite"
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  isAssistantBusy || isSaving
                    ? "bg-[var(--accent-yellow)]"
                    : "bg-emerald-500",
                )}
              />
              {isAssistantBusy
                ? "Board is locked while the assistant works..."
                : isSaving
                  ? "Saving changes..."
                  : "Saved"}
            </p>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={detectCollision}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="-m-1 min-h-0 flex-1 overflow-auto p-1">
            <section className="flex min-h-full gap-4">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds
                    .filter((cardId) => visibleCardIds.has(cardId))
                    .map((cardId) => board.cards[cardId])}
                  isDropTarget={dropTargetColumnId === column.id}
                  canDelete={board.columns.length > 1}
                  isFirst={index === 0}
                  isLast={index === board.columns.length - 1}
                  onMove={handleMoveColumn}
                  onSetWipLimit={handleSetWipLimit}
                  onRename={handleRenameColumn}
                  onDelete={handleDeleteColumn}
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
                style={activeCardWidth ? { width: activeCardWidth } : undefined}
              >
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      <BoardSidebar
        boardId={boardId}
        activityVersion={activityVersion}
        assistant={
          <AIChatSidebar
            boardId={boardId}
            waitForSaves={() => saveQueue.current}
            onBusyChange={setIsAssistantBusy}
            onBoardUpdate={handleAssistantBoardUpdate}
          />
        }
      />
    </div>
  );
};

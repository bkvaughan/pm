import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginGate } from "@/components/LoginGate";

export default function Home() {
  return (
    <LoginGate>
      <KanbanBoard />
    </LoginGate>
  );
}

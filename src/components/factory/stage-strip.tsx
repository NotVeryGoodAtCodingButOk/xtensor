import { Badge } from "@/components/ui/badge";
import type { StageView } from "@/types/domain";

export function StageStrip({ stages }: { stages: StageView[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {stages.map((stage) => (
        <Badge key={stage.id} variant={stage.completion === 100 ? "success" : stage.completion > 0 ? "warning" : "muted"}>
          {stage.completion === 100 ? "OK" : stage.completion > 0 ? `${stage.completion}%` : stage.name}
        </Badge>
      ))}
    </div>
  );
}

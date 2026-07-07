import { useTips } from "../contexts/TipsContext";
import { TipCard } from "./TipCard";

export function TipStack() {
  const { activeTips } = useTips();
  if (activeTips.length === 0) return null;
  return (
    <div className="tip-stack" aria-live="polite">
      {activeTips.map((tip) => (
        <TipCard key={tip.id} tip={tip} />
      ))}
    </div>
  );
}

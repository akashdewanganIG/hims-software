import { Star } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Read-only star rating; red at 2★ and below, amber otherwise. */
export function Stars({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          weight={i <= value ? "fill" : "regular"}
          className={cn(
            size === "sm" ? "size-3.5" : "size-5",
            i <= value
              ? value <= 2
                ? "text-error"
                : "text-warning"
              : "text-border-strong"
          )}
        />
      ))}
    </span>
  );
}

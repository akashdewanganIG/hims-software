import { ImageSquare } from "@/components/icons";
import { cn } from "@/lib/utils";

const SIZES = {
  /** Sidebar header and other tight bars. */
  sm: {
    box: "h-8 gap-2 rounded-lg pl-1.5 pr-2.5 text-[11px]",
    mark: "size-5 rounded-[5px]",
    icon: "size-3",
  },
  /** Sign-in screen and page-level placements. */
  md: {
    box: "h-9 gap-2.5 rounded-lg pl-1.5 pr-3 text-xs",
    mark: "size-6 rounded-md",
    icon: "size-3.5",
  },
} as const;

const TONES = {
  app: {
    box: "border-border-strong bg-surface-subtle text-text-tertiary",
    mark: "border-border bg-surface text-text-tertiary shadow-xs",
  },
  /** Plain greys that survive printing and PDF export. */
  print: {
    box: "border-neutral-400 bg-white text-neutral-500",
    mark: "border-neutral-300 bg-neutral-50 text-neutral-400",
  },
} as const;

/**
 * Stand-in for the hospital's logo on the sidebar, the sign-in screen and the
 * printed letterhead: a mark slot and a wordmark slot, like the lockup that
 * will replace it. Swap the contents for the real logo (an `<img>` or inline
 * SVG) to brand every one of those places at once.
 */
export function LogoPlaceholder({
  size = "md",
  tone = "app",
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const s = SIZES[size];
  const t = TONES[tone];
  return (
    <div
      role="img"
      aria-label="Your logo here"
      className={cn(
        "inline-flex min-w-0 shrink-0 select-none items-center border border-dashed",
        s.box,
        t.box,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center border",
          s.mark,
          t.mark
        )}
      >
        <ImageSquare className={s.icon} />
      </span>
      <span aria-hidden className="truncate font-medium tracking-[0.01em]">
        Your logo here
      </span>
    </div>
  );
}

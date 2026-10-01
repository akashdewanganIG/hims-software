import * as React from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "checked"
> {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
}

function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = checked === "indeterminate";
    }
  }, [checked]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked === "indeterminate" ? false : checked}
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      className={cn(
        "size-4 shrink-0 rounded border border-input accent-primary outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onChange={e => {
        onCheckedChange?.(e.target.checked);
      }}
      {...props}
    />
  );
}

export { Checkbox };

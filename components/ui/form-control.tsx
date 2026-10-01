import { cva, type VariantProps } from "class-variance-authority";

export const CONTROL_HEIGHT = {
  sm: "h-8",
  md: "h-9",
  lg: "h-10",
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;

export const CONTROL_SQUARE = {
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
} as const;

const controlSurfaceClass =
  "w-full min-w-0 rounded-lg border border-input bg-surface text-foreground outline-none transition-[background-color,border-color,box-shadow,color] duration-150 placeholder:text-muted-foreground/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

const controlFocusClass =
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

const controlBaseClass = `${controlSurfaceClass} ${controlFocusClass}`;

export const controlVariants = cva(controlBaseClass, {
  variants: {
    size: {
      sm: `${CONTROL_HEIGHT.sm} px-2.5 text-[0.8125rem]`,
      md: `${CONTROL_HEIGHT.md} px-3 text-[0.8125rem]`,
      lg: `${CONTROL_HEIGHT.lg} px-3 text-sm`,
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const controlAreaVariants = cva(
  `${controlBaseClass} resize-y leading-5`,
  {
    variants: {
      size: {
        sm: "px-2.5 py-2 text-sm",
        md: "px-3 py-2.5 text-sm",
        lg: "px-3.5 py-3 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export type ControlVariantProps = VariantProps<typeof controlVariants>;

export const MENU_ITEM = [
  "relative flex min-h-9 w-full cursor-pointer select-none items-center gap-2.5",
  "rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium leading-5",
  "outline-none transition-[background-color,color] duration-150",
  "hover:bg-secondary hover:text-foreground",
  "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
  "focus-visible:ring-2 focus-visible:ring-ring/25",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&>svg]:size-4 [&>svg]:shrink-0",
].join(" ");

export const MENU_ITEM_ACTIVE =
  "data-[state=checked]:bg-accent data-[state=checked]:font-semibold data-[state=checked]:text-foreground";

export const MENU_ITEM_DESTRUCTIVE =
  "text-error-foreground hover:bg-error-surface hover:text-error-foreground data-[highlighted]:bg-error-surface data-[highlighted]:text-error-foreground";

"use client";

import * as React from "react";
import { Search } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "./input";

export type SearchInputProps = React.ComponentProps<typeof Input> & {
  wrapperClassName?: string;
};

function SearchInput({
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search className="pointer-events-none absolute left-3 inset-y-0 my-auto h-fit size-4 text-muted-foreground" />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}
SearchInput.displayName = "SearchInput";

export { SearchInput };

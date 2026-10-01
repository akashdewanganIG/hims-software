"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const EMPTY_VALUE = "__select_field_empty__";

type SelectFieldChangeEvent = {
  target: { value: string };
  currentTarget: { value: string };
};

export interface SelectFieldProps {
  /** `<option>` elements (optionally in fragments or `<optgroup>`s). */
  children: React.ReactNode;
  value?: string | number;
  onChange?: (event: SelectFieldChangeEvent) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled: boolean;
};

function readOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      const props = child.props as { children?: React.ReactNode };
      options.push(...readOptions(props.children));
      return;
    }
    if (child.type === "option") {
      const props =
        child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      options.push({
        value: String(props.value ?? ""),
        label: props.children,
        disabled: Boolean(props.disabled),
      });
      return;
    }
    if (child.type === "optgroup") {
      const props =
        child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
      options.push(...readOptions(props.children));
    }
  });
  return options;
}

/** A styled select written like a native one: `<option>` children, `onChange`. */
export function SelectField({
  children,
  className,
  value,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const emptyOption = options.find(option => option.value === "");

  return (
    <Select
      value={value === undefined ? undefined : String(value) || EMPTY_VALUE}
      disabled={disabled}
      onValueChange={nextValue => {
        const next = nextValue === EMPTY_VALUE ? "" : nextValue;
        onChange?.({ target: { value: next }, currentTarget: { value: next } });
      }}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={emptyOption?.label ?? "Select an option"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem
            key={`${option.value}-${index}`}
            value={option.value || EMPTY_VALUE}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

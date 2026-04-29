import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "../../lib/utils";

const EMPTY_VALUE = "__empty__";

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm font-medium ring-offset-background shadow-none placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-ink/10 bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm border border-transparent py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:border-primary focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

const Select = React.forwardRef(
  ({ className, children, value, defaultValue, onChange, placeholder, name, disabled, required, id }, ref) => {
    const options = React.Children.toArray(children).filter(
      (child) => React.isValidElement(child) && child.type === "option",
    );

    const normalizeToInternal = React.useCallback((val) => {
      if (val === undefined || val === null) return undefined;
      const str = String(val);
      return str === "" ? EMPTY_VALUE : str;
    }, []);

    const denormalizeFromInternal = React.useCallback((val) => (val === EMPTY_VALUE ? "" : val), []);

    const currentValue = normalizeToInternal(value);
    const currentDefaultValue = normalizeToInternal(defaultValue);

    return (
      <div
        className={cn(
          "w-full min-w-0 !border-0 !bg-transparent !shadow-none !ring-0 !outline-none !p-0",
          className,
        )}
      >
        <SelectPrimitive.Root
          value={currentValue}
          defaultValue={currentDefaultValue}
          disabled={disabled}
          onValueChange={(nextValue) => {
            if (!onChange) return;
            const mapped = denormalizeFromInternal(nextValue);
            onChange({
              target: { value: mapped, name },
              currentTarget: { value: mapped, name },
            });
          }}
        >
          <SelectTrigger id={id} ref={ref} aria-required={required}>
            <SelectValue placeholder={placeholder || "Select option"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((child, index) => {
              const raw = child.props?.value ?? "";
              const label = child.props?.children;
              const itemValue = normalizeToInternal(raw);
              return (
                <SelectItem key={`${itemValue}-${index}`} value={itemValue} disabled={child.props?.disabled}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </SelectPrimitive.Root>
        {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      </div>
    );
  },
);
Select.displayName = "Select";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};

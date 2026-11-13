"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SoftSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  label: string;
  value: string;
  options: SoftSelectOption[];
  onChange: (value: string) => void;
  /** When value differs from this, trigger shows an “active filter” accent. */
  defaultValue?: string;
  className?: string;
  align?: "start" | "center" | "end";
};

/** Base UI rejects empty-string item values; map them through a sentinel. */
const EMPTY = "__soft_empty__";

function toInternal(v: string) {
  return v === "" ? EMPTY : v;
}

function fromInternal(v: string) {
  return v === EMPTY ? "" : v;
}

/**
 * Coastal filter select — quiet trigger, premium popup.
 * Built on Base UI Select for keyboard / a11y.
 */
export function SoftSelect({
  label,
  value,
  options,
  onChange,
  defaultValue = "",
  className,
  align = "start",
}: Props) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const active = value !== defaultValue;
  const internalValue = toInternal(value);
  const items = Object.fromEntries(
    options.map((o) => [toInternal(o.value), o.label]),
  );

  return (
    <Select.Root
      value={internalValue}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(fromInternal(next));
      }}
      items={items}
      modal={false}
    >
      <Select.Trigger
        aria-label={label}
        className={cn(
          "group soft-select-trigger inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left outline-none transition",
          "hover:bg-mark-soft/60",
          "focus-visible:ring-2 focus-visible:ring-mark/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          "data-[popup-open]:bg-mark-soft/70",
          active && "bg-mark-soft/45",
          className,
        )}
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
          {label}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em]",
            active ? "text-mark-deep" : "text-ink",
          )}
        >
          <Select.Value>{selected?.label ?? "—"}</Select.Value>
        </span>
        <Select.Icon
          className={cn(
            "soft-select-chevron flex size-3.5 shrink-0 items-center justify-center text-mute transition duration-200",
            "group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-mark-deep",
          )}
        >
          <ChevronDown className="size-3.5" strokeWidth={2.25} aria-hidden />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          className="z-50 outline-none"
          side="bottom"
          sideOffset={6}
          align={align}
          alignItemWithTrigger={false}
        >
          <Select.Popup
            className={cn(
              "soft-select-popup origin-[var(--transform-origin)] outline-none",
              "min-w-[max(12rem,var(--anchor-width))] max-w-[min(18rem,calc(100vw-2rem))]",
              "overflow-hidden rounded-[1.05rem] border border-line/90 bg-white/95",
              "shadow-[0_22px_50px_-28px_color-mix(in_srgb,var(--ink)_48%,transparent),0_1px_0_color-mix(in_srgb,var(--mark)_22%,transparent)_inset]",
              "backdrop-blur-xl",
              "data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.97]",
              "data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.97]",
            )}
          >
            <Select.ScrollUpArrow className="flex h-6 w-full items-center justify-center bg-gradient-to-b from-white via-white to-transparent text-mute data-[ending-style]:opacity-0">
              <ChevronDown className="size-3.5 rotate-180" strokeWidth={2.25} />
            </Select.ScrollUpArrow>
            <Select.List className="soft-select-list max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain p-1.5">
              {options.map((opt) => (
                <Select.Item
                  key={toInternal(opt.value)}
                  value={toInternal(opt.value)}
                  label={opt.label}
                  className={cn(
                    "group/item relative flex cursor-default items-start gap-2.5 rounded-[0.7rem] px-2.5 py-2 outline-none select-none",
                    "data-[highlighted]:bg-mark-soft/70",
                    "data-[selected]:bg-mark-soft/40",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                  )}
                >
                  <div className="min-w-0 flex-1 pr-1">
                    <Select.ItemText className="block text-[13px] font-semibold tracking-[-0.01em] text-ink group-data-[selected]/item:text-mark-deep">
                      {opt.label}
                    </Select.ItemText>
                    {opt.hint ? (
                      <span className="mt-0.5 block text-[11px] leading-snug text-mute">
                        {opt.hint}
                      </span>
                    ) : null}
                  </div>
                  <Select.ItemIndicator
                    keepMounted={false}
                    className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-mark-deep data-[ending-style]:opacity-0"
                  >
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
            <Select.ScrollDownArrow className="flex h-6 w-full items-center justify-center bg-gradient-to-t from-white via-white to-transparent text-mute data-[ending-style]:opacity-0">
              <ChevronDown className="size-3.5" strokeWidth={2.25} />
            </Select.ScrollDownArrow>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

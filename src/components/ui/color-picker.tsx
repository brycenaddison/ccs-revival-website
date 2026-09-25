/**
 * The community shadcn color-picker pattern, using our Button and Popover with react-colorful.
 * Radix owns dismissal and focus; react-colorful owns the touch and keyboard color controls.
 * https://github.com/nightspite/shadcn-color-picker
 *
 * Only opaque, six-digit hex values leave this control because team colors are integer columns.
 * Shorthand is expanded on blur, not while typing the first three digits of a full hex value.
 */

import { useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function ColorPicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-10 gap-2.5 bg-bg2 px-2.5"
          aria-label={`${label}: ${value}. Choose color`}
        >
          <span
            aria-hidden="true"
            className="h-6 w-8 shrink-0 rounded-sm border border-border"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-xs text-text-secondary">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-64 max-w-[calc(100vw-2rem)] space-y-3"
        aria-labelledby={`${id}-picker-label`}
      >
        <p id={`${id}-picker-label`} className="font-heading text-sm text-text-bright">
          {label}
        </p>
        {/* The library's CSS is unlayered; important utilities override its fixed dimensions. */}
        <HexColorPicker
          color={value}
          onChange={onChange}
          role="group"
          aria-label={`${label} selection`}
          className="h-44! w-full!"
        />
        <div>
          <label htmlFor={`${id}-hex`} className={LABEL_CLASS}>
            Hex
          </label>
          <HexColorInput
            id={`${id}-hex`}
            color={value}
            prefixed
            aria-label={`${label} hex value`}
            autoComplete="off"
            className={`${CONTROL_CLASS} font-mono`}
            onChange={hex => {
              if (hex.length === 7) onChange(hex.toLowerCase());
            }}
            onBlur={event => {
              const hex = event.currentTarget.value;
              if (/^#[\da-f]{3}$/i.test(hex)) {
                onChange("#" + [...hex.slice(1)].map(digit => digit + digit).join("").toLowerCase());
              }
            }}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

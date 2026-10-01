/**
 * shadcn's Combobox for Radix: the Popover and Command primitives composed into a searchable
 * single-choice picker.
 *
 * For a stable, local option list (time zones, leagues) that is too long to scan in a native select.
 * cmdk filters as the user types, and the list is keyboard-navigable with the selection announced.
 * Server-driven searches (players, people) keep their own adapters and result rows instead, because
 * their results arrive per term and must not be filtered again locally.
 *
 * `createOption` offers the typed text itself as a value when nothing matches, for the case where
 * the option list is unavailable and the server validates the value.
 */

import { useState } from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { cn } from "@/lib/cn"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  /** Extra terms the search should match, such as a full name behind a short label. */
  keywords?: string[]
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Choose…",
  searchPlaceholder = "Search",
  emptyText = "No matches.",
  createOption,
  disabled,
  className,
  contentClassName,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  id?: string
  options: readonly ComboboxOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  createOption?: (search: string) => ComboboxOption | null
  disabled?: boolean
  className?: string
  contentClassName?: string
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selected = options.find(o => o.value === value)
  const created = search.trim() && createOption ? createOption(search.trim()) : null

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            "h-9 w-full min-w-0 justify-between bg-bg2 px-3 font-body font-normal text-text",
            value === null && "text-text-muted",
            className
          )}
        >
          <span className="truncate">{selected?.label ?? value ?? placeholder}</span>
          <ChevronsUpDownIcon size={14} aria-hidden="true" className="text-text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-(--radix-popover-trigger-width) min-w-64 p-0", contentClassName)}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {created && (
              <CommandItem value={created.value} onSelect={() => pick(created.value)}>
                {created.label}
              </CommandItem>
            )}
            {options.map(option => (
              <CommandItem
                key={option.value}
                value={option.value}
                keywords={[option.label, ...(option.keywords ?? [])]}
                onSelect={() => pick(option.value)}
              >
                <CheckIcon
                  aria-hidden="true"
                  className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")}
                />
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

import { useId, type ReactNode } from "react";
import { Search } from "lucide-react";
import { LABEL_CLASS } from "../stats/FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PlayerSearchPanel({ label, term, onTerm, onCancel, busy = false, children }: {
  label: string;
  term: string;
  onTerm: (term: string) => void;
  onCancel: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg3 p-3" aria-busy={busy}
      onKeyDown={event => {
        if (event.key === "Escape" && !busy) { event.stopPropagation(); onCancel(); }
      }}>
      <Label htmlFor={id} className="mb-1">{label}</Label>
      <div className="relative">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
        <Input id={id} value={term} onChange={event => onTerm(event.target.value)} autoComplete="off"
          autoFocus disabled={busy} className="pl-8" />
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="outline" size="sm" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
      {children}
    </div>
  );
}

export function SearchStatus({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-2 text-xs text-text-dim">{children}</p>;
}

export function PlayerResultGroup({ label, children }: { label?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="mt-2 min-w-0">
      {label && <p id={id} className={LABEL_CLASS}>{label}</p>}
      <ul aria-labelledby={label ? id : undefined} className="max-h-56 overflow-y-auto rounded-md border border-border">{children}</ul>
    </div>
  );
}

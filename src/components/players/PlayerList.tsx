import { UserPlus, X } from "lucide-react";
import { LABEL_CLASS } from "../stats/FilterBar";
import { PlayerPicker } from "./PlayerPicker";
import { PlayerIdentity, playerLabel, type PickedPlayer } from "./PlayerIdentity";
import type { PlayerPickerMode, PlayerPickerOptions } from "./pickerTypes";
import { usePickerDisclosure } from "./usePickerDisclosure";
import { Button } from "@/components/ui/button";
import { TooltipHint } from "../TooltipHint";

type Props = PlayerPickerMode & PlayerPickerOptions & {
  label: string;
  values: readonly PickedPlayer[];
  onChange: (players: PickedPlayer[]) => void;
  editable: boolean;
  max?: number;
  hint?: string;
};

export function PlayerList(props: Props) {
  const { label, values, onChange, editable, max, hint } = props;
  const { open, setOpen, trigger, container } = usePickerDisclosure();
  const full = max !== undefined && values.length >= max;
  return (
    <div className="min-w-0" ref={container} tabIndex={-1}>
      <span className={LABEL_CLASS}>{label}</span>
      {values.length ? <ul className="mb-2 flex flex-wrap gap-1.5">
        {values.map(player => <li key={player.profileId} className="max-w-full">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-bright">
            <PlayerIdentity player={player} small />
            {editable && !open && (
              <TooltipHint content={`Remove ${playerLabel(player)}`}>
                <Button type="button" variant="quiet" size="inline" onClick={() => onChange(values.filter(p => p.profileId !== player.profileId))}
                  aria-label={`Remove ${playerLabel(player)}`} className="shrink-0 hover:text-ccs-red">
                  <X size={12} aria-hidden="true" />
                </Button>
              </TooltipHint>
            )}
          </span>
        </li>)}
      </ul> : <p className="mb-2 text-sm text-text-dim">Nobody.</p>}
      {editable && (open ? <PlayerPicker {...props} onCancel={() => setOpen(false)} onPick={player => {
        setOpen(false);
        if (!full && !values.some(p => p.profileId === player.profileId)) onChange([...values, player]);
      }} /> : <Button variant="outline" size="sm" ref={trigger} type="button" disabled={full} onClick={() => setOpen(true)} aria-label={`Add ${label}`}>
        <UserPlus size={13} aria-hidden="true" />Add
      </Button>)}
      {(hint || full) && <p className="mt-1.5 text-xs text-text-dim">{full ? `That's the maximum of ${max}. Remove somebody to add another.` : hint}</p>}
    </div>
  );
}

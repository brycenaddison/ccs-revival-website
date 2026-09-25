import { X } from "lucide-react";
import { ACTION_SM, ACTION_SM_DANGER } from "../admin/adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { PlayerPicker } from "./PlayerPicker";
import { PlayerIdentity, type PickedPlayer } from "./PlayerIdentity";
import type { PlayerPickerMode, PlayerPickerOptions } from "./pickerTypes";
import { usePickerDisclosure } from "./usePickerDisclosure";

type Props = PlayerPickerMode & PlayerPickerOptions & {
  label: string;
  value: PickedPlayer | null;
  onChange: (player: PickedPlayer | null) => void;
  editable: boolean;
  hint?: string;
};

export function PlayerSlot(props: Props) {
  const { label, value, onChange, editable, hint } = props;
  const { open, setOpen, trigger, container } = usePickerDisclosure();
  return (
    <div className="min-w-0" ref={container} tabIndex={-1}>
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-bg2 px-3 py-2">
        <span className="min-w-0 flex-1 text-sm text-text-bright">
          {value ? <PlayerIdentity player={value} small /> : <span className="text-text-dim">Empty</span>}
        </span>
        {editable && !open && <>
          <button ref={trigger} type="button" className={ACTION_SM} aria-label={`${value ? "Change" : "Set"} ${label}`} onClick={() => setOpen(true)}>{value ? "Change" : "Set"}</button>
          {value && <button type="button" className={ACTION_SM_DANGER} aria-label={`Clear ${label}`} title={`Clear ${label}`} onClick={() => onChange(null)}><X size={13} aria-hidden="true" /></button>}
        </>}
      </div>
      {editable && open && <div className="mt-2"><PlayerPicker {...props}
        onPick={player => { onChange(player); setOpen(false); }} onCancel={() => setOpen(false)} /></div>}
      {hint && <p className="mt-1.5 text-xs text-text-dim">{hint}</p>}
    </div>
  );
}

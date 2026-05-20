import type { ArchiveTournament } from "../../lib/archiveApi";

interface Props {
  tournaments: ArchiveTournament[];
  selected: string;
  onChange: (conf: string) => void;
}

export function TournamentPicker({ tournaments, selected, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <label className="font-heading text-xs text-text-secondary tracking-wider uppercase">
        Tournament
      </label>
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        className="bg-bg2 border border-border rounded-md text-text font-body text-sm py-2 px-3 min-w-[280px] focus:outline-none focus:border-accent"
      >
        {tournaments.map(t => (
          <option key={t.conf} value={t.conf}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

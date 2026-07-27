interface Props {
  active: string;
  setActive: (tab: string) => void;
}

const TABS = ["Teams", "Players", "Rosters", "Schedule", "Draft Board", "Applications", "Articles", "Twitter", "Twitch", "Divisions", "Seasons"];

export function AdminTabs({ active, setActive }: Props) {
  return (
    <div className="flex gap-0 border-b-2 border-accent mb-5 overflow-x-auto scrollbar-none">
      {TABS.map(t => (
        <button
          key={t}
          onClick={() => setActive(t)}
          className={`border-none cursor-pointer py-3 px-5 font-heading text-sm tracking-wider uppercase whitespace-nowrap -mb-0.5 transition-colors duration-150 ${
            active === t
              ? "bg-bg-input text-white font-semibold border-b-2 border-b-accent"
              : "bg-transparent text-text-muted font-normal border-b-2 border-b-transparent hover:text-text-secondary"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

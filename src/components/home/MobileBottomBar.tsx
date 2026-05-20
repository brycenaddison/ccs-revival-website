interface Props {
  active: string;
  setActive: (tab: string) => void;
}

const ITEMS = [
  { k: "Home", i: "🏠" },
  { k: "Scores", i: "📋" },
  { k: "Standings", i: "🏆" },
  { k: "Stats", i: "📊" },
  { k: "Draft Board", i: "📝" },
  { k: "Merch", i: "🛒", href: "https://classicchampionshipseries.itemorder.com/shop/sale/" },
];

export function MobileBottomBar({ active, setActive }: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[rgba(10,10,10,0.95)] backdrop-blur-xl border-t border-border flex justify-around items-center z-[200]" style={{ padding: "6px 0 env(safe-area-inset-bottom, 8px)" }}>
      {ITEMS.map(t =>
        "href" in t ? (
          <a
            key={t.k}
            href={t.href}
            target={t.href !== "#" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="bg-transparent border-none cursor-pointer flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[56px] no-underline"
          >
            <span className="text-lg" style={{ filter: "grayscale(1) opacity(0.5)" }}>{t.i}</span>
            <span className="font-heading text-[9px] tracking-wide uppercase text-text-muted font-normal">{t.k}</span>
          </a>
        ) : (
          <button
            key={t.k}
            onClick={() => setActive(t.k)}
            className="bg-transparent border-none cursor-pointer flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[56px]"
          >
            <span className="text-lg" style={{ filter: active === t.k ? "none" : "grayscale(1) opacity(0.5)" }}>{t.i}</span>
            <span className={`font-heading text-[9px] tracking-wide uppercase ${active === t.k ? "text-accent font-bold" : "text-text-muted font-normal"}`}>
              {t.k}
            </span>
          </button>
        )
      )}
    </div>
  );
}

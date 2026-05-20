import { Link } from "react-router-dom";

interface Props {
  isMobile: boolean;
}

const LINKS = [
  { label: "Power Rankings", icon: "📊" },
  { label: "Scouting", icon: "🔍" },
  { label: "Meta", icon: "🎮" },
  { label: "Fantasy", icon: "🏆" },
  { label: "Discord", icon: "💬" },
  { label: "Admin", icon: "⚙️", to: "/admin" },
];

export function QuickLinks({ isMobile }: Props) {
  if (isMobile) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {LINKS.map(l => {
          const content = (
            <div className="bg-bg2 rounded-md border border-border py-3.5 px-2 text-center cursor-pointer flex flex-col items-center gap-1.5">
              <span className="text-xl">{l.icon}</span>
              <span className="font-heading text-[10px] text-text tracking-wide">{l.label}</span>
            </div>
          );
          return l.to ? <Link key={l.label} to={l.to} className="no-underline">{content}</Link> : <div key={l.label}>{content}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="bg-bg2 rounded-md border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <span className="font-display text-[15px] text-text-bright tracking-widest">QUICK LINKS</span>
      </div>
      {LINKS.map((l, i) => {
        const content = (
          <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < LINKS.length - 1 ? "border-b border-bg3" : ""}`}>
            <span className="text-base">{l.icon}</span>
            <span className="font-heading text-[13px] text-text">{l.label}</span>
          </div>
        );
        return l.to
          ? <Link key={l.label} to={l.to} className="no-underline text-inherit">{content}</Link>
          : <div key={l.label}>{content}</div>;
      })}
    </div>
  );
}

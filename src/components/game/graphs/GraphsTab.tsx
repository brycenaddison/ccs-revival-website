/**
 * The client's Graphs tab: any participant stat, every player, as horizontal bars.
 *
 * One axis, bars colored by side and never by rank, so a reader compares two lineups rather than ten
 * strangers. When more than one stat is selected the later ones step down in opacity and a legend row
 * above the chart names each; the tooltip names the stat under the cursor. chart.js paints with color
 * strings, so the hues come off the theme through `useThemeColors` and follow a theme flip.
 *
 * The dataset picker is a sidebar from `md` up and a sheet below it, which is the one place on the
 * page a drawer earns its keep: a phone cannot show twenty checkboxes beside a chart.
 */

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { useThemeColors, withAlpha } from "../../../hooks/useThemeColors";
import { Button } from "../../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../../ui/sheet";
import { useGameView } from "../GameView";
import { DataSelector, DEFAULT_STAT_KEY, statByKey } from "./DataSelector";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/** Opacity per dataset position, so a second and third stat recede behind the first. */
const STEPS = [1, 0.65, 0.4, 0.25];

export default function GraphsTab() {
  const { match, participants } = useGameView();
  const colors = useThemeColors();
  const [selected, setSelected] = useState<string[]>([DEFAULT_STAT_KEY]);

  const players = useMemo(() => Object.values(participants), [participants]);
  const stats = useMemo(() => selected.map(statByKey).filter(s => s !== undefined), [selected]);

  const data: ChartData<"bar"> = useMemo(
    () => ({
      labels: players.map(p => p.displayName),
      datasets: stats.map((stat, i) => {
        const alpha = STEPS[Math.min(i, STEPS.length - 1)];
        const color = (ctx: { dataIndex: number }) =>
          withAlpha(players[ctx.dataIndex]?.teamId === 100 ? colors.sideBlue : colors.sideRed, alpha);
        return {
          label: stat.label,
          data: players.map(p => stat.read(match.info.participants.find(r => r.participantId === p.participantId)!)),
          backgroundColor: color,
          borderColor: color,
          borderWidth: 0,
          borderRadius: 3,
          borderSkipped: "start" as const,
          maxBarThickness: 22,
        };
      }),
    }),
    [players, stats, match, colors],
  );

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      indexAxis: "y",
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${Number(ctx.parsed.x).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: colors.border },
          border: { display: false },
          ticks: { color: colors.textSecondary, callback: v => Number(v).toLocaleString() },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: colors.text, font: { family: colors.fontBody, size: 12 } },
        },
      },
    }),
    [colors],
  );

  const picker = <DataSelector selected={selected} onChange={setSelected} />;

  return (
    // The chart has a fixed height and the picker scrolls inside the same height, so twenty checkboxes
    // never stretch the card and the chart never floats above empty space.
    <div className="flex items-start gap-4">
      <aside className="hidden w-64 shrink-0 overflow-y-auto rounded-lg border border-border bg-bg2 p-4 md:block">{picker}</aside>

      <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-bg2 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Legend stats={stats.map(s => s.label)} />
          <div className="ml-auto md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <SlidersHorizontal className="size-3.5" /> Stats
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle className="">Stats</SheetTitle>
                  <SheetDescription>Pick what the bars measure.</SheetDescription>
                </SheetHeader>
                {picker}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {stats.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-muted">Pick at least one stat.</p>
        ) : (
          <div className="relative h-[360px]">
            <Bar data={data} options={options} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Which stat each opacity step is. Only rendered with two or more, since a single series is named
 * by the picker and needs no legend; the swatch is neutral because the bar's hue means "side", not
 * "stat".
 */
function Legend({ stats }: { stats: string[] }) {
  if (stats.length < 2) {
    return <span className="font-heading text-sm text-text-bright">{stats[0] ?? ""}</span>;
  }
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {stats.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span
            className="inline-block h-2.5 w-4 rounded-sm bg-text-bright"
            style={{ opacity: STEPS[Math.min(i, STEPS.length - 1)] }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

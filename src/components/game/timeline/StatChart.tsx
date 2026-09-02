/**
 * The stat-over-time chart: one team's lead over the other, both teams' totals, or every champion.
 *
 * Colors are the side tokens read off the theme; the two-team views carry a legend, and the single
 * advantage series is named by the selector above and fills blue above zero, red below. The x axis is
 * game time and a click on it focuses that minute for the map, the rail and the event list.
 */

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { useThemeColors, withAlpha } from "../../../hooks/useThemeColors";
import { fmtTimestamp, getStatSeries, type EnhancedParticipantFrame, type StatPoint } from "../../../lib/game/timelineStats";
import { useTimelineView } from "./TimelineTab";
import type { ViewOption } from "./ViewSelector";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const STAT_READERS: Record<ViewOption["stat"], (f: EnhancedParticipantFrame) => number> = {
  Gold: f => f.totalGold,
  Experience: f => f.xp,
  CS: f => f.jungleMinionsKilled + f.minionsKilled,
  Damage: f => f.damageStats.totalDamageDoneToChampions,
  Kills: f => f.kills,
};

const toPoint = ({ timestamp, value }: StatPoint) => ({ x: timestamp, y: value });

/** Two-minute ticks; a forty-minute game gets twenty labels, which is what fits. */
const X_STEP = 120_000;

export function StatChart() {
  const { timeline, participants, view, selectedPlayers, hoveredPlayer, minute, setMinute } = useTimelineView();
  const colors = useThemeColors();

  const series = useMemo(
    () =>
      getStatSeries(
        participants,
        timeline,
        view.graph === "Champion total" && view.stat === "Kills" ? f => f.kills + f.assists : STAT_READERS[view.stat],
      ),
    [participants, timeline, view],
  );

  const data: ChartData<"line"> = useMemo(() => {
    const line = (label: string, points: StatPoint[], color: string, hidden = false) => ({
      label,
      data: points.map(toPoint),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 8,
      hidden,
    });

    switch (view.graph) {
      case "Team total":
        return { datasets: [line("Blue side", series.blue, colors.sideBlue), line("Red side", series.red, colors.sideRed)] };
      case "Team advantage":
        return {
          datasets: [
            {
              label: `${view.stat} lead`,
              data: series.difference.map(toPoint),
              borderColor: colors.textSecondary,
              borderWidth: 1,
              pointRadius: 0,
              pointHitRadius: 8,
              fill: { target: { value: 0 }, above: withAlpha(colors.sideBlue, 0.55), below: withAlpha(colors.sideRed, 0.55) },
            },
          ],
        };
      case "Champion total":
        return {
          datasets: Object.values(series.participants).map(({ participantId, teamId, points }) => {
            const base = teamId === 100 ? colors.sideBlue : colors.sideRed;
            const dimmed = hoveredPlayer !== undefined && hoveredPlayer !== participantId;
            return line(
              participants[participantId]?.displayName ?? `Player ${participantId}`,
              points,
              withAlpha(base, dimmed ? 0.15 : 1),
              selectedPlayers.length > 0 && hoveredPlayer !== participantId && !selectedPlayers.includes(participantId),
            );
          }),
        };
    }
  }, [view, series, colors, participants, hoveredPlayer, selectedPlayers]);

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: { duration: 200 },
      interaction: { mode: "index", intersect: false },
      onClick: (event, _elements, chart) => {
        if (event.x === null || event.x === undefined) return;
        const ms = chart.scales.x.getValueForPixel(event.x);
        if (ms === undefined) return;
        const next = Math.round(ms / 60_000);
        setMinute(minute === next ? undefined : next);
      },
      plugins: {
        legend: {
          display: view.graph !== "Team advantage",
          position: "top",
          align: "end",
          labels: { color: colors.textSecondary, boxWidth: 12, boxHeight: 2, font: { family: colors.fontBody, size: 11 } },
        },
        tooltip: {
          displayColors: view.graph !== "Team advantage",
          callbacks: {
            title: items => (items[0] ? fmtTimestamp(Number(items[0].parsed.x)) : ""),
            label: ctx => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: series.difference[series.difference.length - 1]?.timestamp ?? undefined,
          grid: { display: false },
          border: { color: colors.border },
          ticks: { color: colors.textSecondary, stepSize: X_STEP, callback: v => fmtTimestamp(Number(v)) },
        },
        y: {
          type: "linear",
          grid: { color: colors.border, lineWidth: ctx => (ctx.tick.value === 0 ? 2 : 1) },
          border: { display: false },
          ticks: {
            color: colors.textSecondary,
            callback: v => {
              const n = Number(v);
              return Math.abs(n) >= 1000 ? `${n / 1000}k` : String(n);
            },
          },
        },
      },
    }),
    [colors, view.graph, series, minute, setMinute],
  );

  return (
    <div className="relative h-[360px] min-h-0 lg:h-auto lg:flex-1">
      <Line data={data} options={options} />
    </div>
  );
}

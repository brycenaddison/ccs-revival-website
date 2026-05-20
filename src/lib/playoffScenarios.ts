export interface PlayoffScenario {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const SCENARIOS: Record<string, PlayoffScenario> = {
  upperBye: {
    label: "Upper Bracket Bye",
    shortLabel: "UB Bye",
    color: "#d7a52a",
    bgColor: "rgba(215, 165, 42, 0.12)",
    borderColor: "#d7a52a",
  },
  upperBracket: {
    label: "Upper Bracket",
    shortLabel: "Upper",
    color: "#d7a52a",
    bgColor: "rgba(215, 165, 42, 0.08)",
    borderColor: "#d7a52a",
  },
  lowerBye: {
    label: "Lower Bracket Bye",
    shortLabel: "LB Bye",
    color: "#d20708",
    bgColor: "rgba(210, 7, 8, 0.12)",
    borderColor: "#d20708",
  },
  lowerBracket: {
    label: "Lower Bracket",
    shortLabel: "Lower",
    color: "#d20708",
    bgColor: "rgba(210, 7, 8, 0.08)",
    borderColor: "#d20708",
  },
  gauntletQualifier: {
    label: "Gauntlet Qualifier",
    shortLabel: "Gauntlet Q",
    color: "#d1d2d4",
    bgColor: "rgba(209, 210, 212, 0.08)",
    borderColor: "#d1d2d4",
  },
  gauntletPrelim: {
    label: "Gauntlet Prelim",
    shortLabel: "Gauntlet",
    color: "#d1d2d4",
    bgColor: "rgba(209, 210, 212, 0.05)",
    borderColor: "#999",
  },
};

/**
 * Group standings (8 teams per group):
 *   1st  → Upper Bracket Bye (gold)
 *   2-3  → Upper Bracket (gold)
 *   4th  → Lower Bracket Bye (red)
 *   5th  → Lower Bracket (red)
 *   6th  → Gauntlet Qualifier (grey)
 *   7-8  → Gauntlet Preliminaries (grey)
 */
export function getPlayoffScenario(position: number): PlayoffScenario | null {
  switch (position) {
    case 1: return SCENARIOS.upperBye;
    case 2:
    case 3: return SCENARIOS.upperBracket;
    case 4: return SCENARIOS.lowerBye;
    case 5: return SCENARIOS.lowerBracket;
    case 6: return SCENARIOS.gauntletQualifier;
    case 7:
    case 8: return SCENARIOS.gauntletPrelim;
    default: return null;
  }
}

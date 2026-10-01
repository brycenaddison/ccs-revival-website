import type { ReactNode } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerLink } from "../profile/PlayerLink";
import { cn } from "../../lib/cn";
import type { PlayerSummary } from "../../lib/api";

export type PickedPlayer = PlayerSummary;

export function playerLabel(player: Pick<PlayerSummary, "name">): string {
  return player.name ?? "Unnamed player";
}

const AVATAR_SIZE = {
  small: "size-[22px]",
  normal: "size-7",
  medium: "size-8",
  large: "size-12",
  xl: "size-16",
} as const;

/**
 * Every face on the site: a Discord avatar or Riot profile icon over the shared fallback glyph.
 *
 * The Avatar primitive keeps the glyph until the image loads and when it fails, and gives a new URL
 * another chance. The image is decorative (the name beside it is the label), so only a known-absent
 * avatar is announced. `square` is for Riot artwork, which is a tile rather than a portrait.
 * `fallback` replaces the glyph where something more specific is known, such as an initial.
 */
export function PlayerAvatar({ src, size = "normal", square = false, className, fallback }: {
  src: string | null;
  size?: keyof typeof AVATAR_SIZE;
  square?: boolean;
  className?: string;
  fallback?: ReactNode;
}) {
  const glyph = size === "xl" ? 26 : size === "large" ? 24 : 14;
  return (
    <Avatar className={cn(AVATAR_SIZE[size], square && "rounded-md", size === "xl" && square && "rounded-lg", className)}>
      {src && <AvatarImage src={src} alt="" loading="lazy" decoding="async" />}
      <AvatarFallback
        {...(src ? { "aria-hidden": true } : { role: "img", "aria-label": "Avatar unavailable" })}
      >
        {fallback ?? <UserRound size={glyph} aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}

type DisplayPlayer = Omit<PlayerSummary, "profileId" | "avatarSource"> & { profileId: number | null };
const VERIFIED_LABEL = "Discord linked · Riot account verified";

/** Selection buttons opt out of navigation; selected values and preview headings use PlayerLink. */
export function PlayerIdentity({ player, linked = true, small = false }: {
  player: DisplayPlayer;
  linked?: boolean;
  small?: boolean;
}) {
  const name = playerLabel(player);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle">
      <PlayerAvatar src={player.avatar} size={small ? "small" : "normal"} />
      {linked ? (
        <PlayerLink profileId={player.profileId} className="min-w-0 truncate hover:underline" title={name}>{name}</PlayerLink>
      ) : <span className="min-w-0 truncate" title={name}>{name}</span>}
      {player.verified && (
        <span className="inline-flex shrink-0 text-brand" role="img" aria-label={VERIFIED_LABEL} title={VERIFIED_LABEL}>
          <ShieldCheck size={14} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** One keyboard-operable result row for roster and import searches, without nested links. */
export function PlayerResultRow({ player, detail, annotation, disabled, onSelect }: {
  player: DisplayPlayer;
  detail?: string | null;
  annotation?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onSelect}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm text-text hover:bg-bg-input focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <PlayerIdentity player={player} linked={false} small />
        {detail && <span className="mt-0.5 block truncate text-xs text-text-dim" title={detail}>{detail}</span>}
      </span>
      {annotation && <span className="shrink-0 text-[10px] text-text-dim">{annotation}</span>}
    </button>
  );
}

/**
 * The only way an item, summoner spell, rune, lane or ability icon reaches the screen.
 *
 * The champion counterpart is `components/ChampionIcon.tsx`, and these follow its rules: an `<img>`
 * over a lookup the page loaded once, `null` lookups degrade to a placeholder rather than an error, and
 * nothing here fetches. Each icon carries a tooltip with the name and Riot's description, rendered by
 * `RiotText` rather than injected.
 *
 * Sizes are pixels, the repo's convention (`ChampionIcon size={22}`), not the `sm/md/lg` strings the
 * original viewer used; the scoreboard maps its density to a pixel size once, at the row.
 *
 * Every tile is borderless with the `shadow-tile` lift, the treatment the champion icons in the
 * viewer get too (`tile` on `ChampionIcon`), so a row of mixed icons reads as one set.
 *
 * `EMPTY_SLOT` (item `0`) is a genuinely empty inventory slot, which is not the same as an item the
 * manifest does not know: the first is a blank well with no tooltip, the second a blank well that says
 * which id could not be resolved.
 */

import type { ReactNode } from "react";
import { EMPTY_SLOT, type GameAssetLookup } from "../../lib/gameAssets";
import type { RuneLookup } from "../../lib/runeData";
import type { AbilityInfo } from "../../lib/championAbilities";
import type { Role } from "../../lib/api";
import { roleLabel } from "../../lib/api";
import { CDRAGON_STATIC_BASE } from "../../lib/riot/cdragon";
import { cn } from "../../lib/cn";
import { tileClass } from "../../lib/tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { RiotText } from "./RiotText";


export function PlaceholderIcon({
  size,
  className,
  title,
  round = false,
}: {
  size: number;
  className?: string;
  title?: string;
  round?: boolean;
}) {
  return (
    <span
      className={cn("inline-block shrink-0 bg-bg3", tileClass(size, round), className)}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}


/**
 * The tooltip every icon here wears. The trigger is a focusable span around the image so a keyboard
 * user can reach the description; Radix opens it on focus as well as hover.
 */
function IconTooltip({
  name,
  nameClass,
  description,
  footer,
  children,
}: {
  name: string;
  nameClass: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex shrink-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className={cn("mb-1 font-heading text-sm tracking-wide", nameClass)}>{name}</div>
        {description ? <RiotText text={description} /> : null}
        {footer ? <div className="mt-1.5 text-[11px] text-text-secondary">{footer}</div> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function ItemIcon({
  itemId,
  size,
  lookup,
  className,
}: {
  itemId: number | null | undefined;
  size: number;
  lookup: GameAssetLookup | null;
  className?: string;
}) {
  if (itemId === null || itemId === undefined || itemId === EMPTY_SLOT) {
    return <PlaceholderIcon size={size} className={className} />;
  }
  const item = lookup?.get(itemId);
  if (!item) return <PlaceholderIcon size={size} className={className} title={`Item ${itemId}`} />;

  return (
    <IconTooltip
      name={item.name}
      nameClass="text-ccs-gold"
      description={item.description}
      footer={item.price !== undefined ? <>Cost <span className="text-ccs-gold">{item.price.toLocaleString()}</span></> : undefined}
    >
      <img
        src={item.icon}
        alt={item.name}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={cn("shrink-0 bg-bg3", tileClass(size), className)}
        style={{ width: size, height: size }}
      />
    </IconTooltip>
  );
}

export function SpellIcon({
  spellId,
  size,
  lookup,
  className,
}: {
  spellId: number | null | undefined;
  size: number;
  lookup: GameAssetLookup | null;
  className?: string;
}) {
  const spell = lookup?.get(spellId);
  if (!spell) {
    return <PlaceholderIcon size={size} className={className} title={spellId ? `Spell ${spellId}` : undefined} />;
  }

  return (
    <IconTooltip name={spell.name} nameClass="text-ccs-gold" description={spell.description}>
      <img
        src={spell.icon}
        alt={spell.name}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={cn("shrink-0 bg-bg3", tileClass(size), className)}
        style={{ width: size, height: size }}
      />
    </IconTooltip>
  );
}

/**
 * One rune or one tree. `kind` says which manifest the id lives in; the keystone and the minor runes
 * are both `perk`, and a tree symbol is `style`. Minor runes are drawn round, as the client draws them.
 */
export function RuneIcon({
  id,
  kind,
  size,
  lookup,
  round = false,
  className,
}: {
  id: number | null | undefined;
  kind: "perk" | "style";
  size: number;
  lookup: RuneLookup | null;
  round?: boolean;
  className?: string;
}) {
  const rune = kind === "perk" ? lookup?.perk(id) : lookup?.style(id);
  if (!rune) return <PlaceholderIcon size={size} round={round} className={className} />;

  return (
    <IconTooltip name={rune.name} nameClass="text-ccs-green" description={rune.description}>
      <img
        src={rune.icon}
        alt={rune.name}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={cn("shrink-0 bg-bg3", tileClass(size, round), className)}
        style={{ width: size, height: size }}
      />
    </IconTooltip>
  );
}

/**
 * The lane icon Riot's client shows beside a position. Static client UI from Community Dragon's
 * static-assets plugin, which is a different root from the game-data manifests (`cdragon.ts`).
 */
export function RoleIcon({ role, size, className }: { role: Role | null; size: number; className?: string }) {
  if (role === null) return <PlaceholderIcon size={size} className={className} />;
  return (
    <img
      src={`${CDRAGON_STATIC_BASE}/svg/position-${role.toLowerCase()}.svg`}
      alt={roleLabel(role)}
      title={roleLabel(role)}
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      // The SVGs are light gray on transparent, drawn for the client's dark chrome. `opacity` rather
      // than a filter so they still read on the light theme's `bg2`.
      className={cn("shrink-0 opacity-80", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** One ability, with its key letter in the corner. `ability` is null while the champion file loads. */
export function AbilityIcon({
  ability,
  fallbackKey,
  size,
  className,
}: {
  ability: AbilityInfo | null;
  fallbackKey: string;
  size: number;
  className?: string;
}) {
  const badge = (
    <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-bg/80 px-1 font-heading text-[10px] font-bold text-text-bright">
      {ability?.key ?? fallbackKey}
    </span>
  );

  if (!ability || !ability.icon) {
    return (
      <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
        <PlaceholderIcon size={size} />
        {badge}
      </span>
    );
  }

  return (
    <IconTooltip name={ability.name} nameClass="text-ccs-gold" description={ability.description}>
      <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
        <img
          src={ability.icon}
          alt={ability.name}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          className={cn("shrink-0 bg-bg3", tileClass(size))}
          style={{ width: size, height: size }}
        />
        {badge}
      </span>
    </IconTooltip>
  );
}

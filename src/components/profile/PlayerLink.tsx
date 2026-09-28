/** The canonical public player link. Names are presentation; `profileId` is identity. */

import { Link } from "react-router-dom";
import type { ComponentProps, ReactNode } from "react";

export function playerPath(profileId: number): string {
  return `/players/${encodeURIComponent(profileId)}`;
}

interface Props extends Omit<ComponentProps<typeof Link>, "to" | "children"> {
  profileId: number | null | undefined;
  children: ReactNode;
  className?: string;
  title?: string;
  stopPropagation?: boolean;
}

/** Renders plain inline content when the source has no durable profile key. */
export function PlayerLink({ profileId, children, className, title, stopPropagation, onClick, ...props }: Props) {
  if (profileId === null || profileId === undefined || !Number.isFinite(profileId) || profileId <= 0) {
    return <span className={className} title={title}>{children}</span>;
  }
  return (
    <Link
      {...props}
      to={playerPath(profileId)}
      className={className}
      title={title}
      onClick={event => {
        if (stopPropagation) event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}

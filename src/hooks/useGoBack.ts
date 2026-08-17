/**
 * A back button that goes back, and lands somewhere sensible when there is no back.
 *
 * `navigate(-1)` alone is wrong on a page that can be arrived at cold — a pasted link, a new tab from
 * a `target="_blank"` box-score link, a bookmark. There is no previous entry in that session's history,
 * so the browser either does nothing or leaves the site entirely, which is not what a button labelled
 * "back" should do.
 *
 * React Router marks the first entry of a session with `key === "default"`, which is the one reliable
 * signal for "nothing to go back to" — `history.length` counts entries from before this app was loaded
 * and cannot be read to mean anything. So this steps back when there is somewhere to step, and navigates
 * to the caller's fallback when there isn't.
 */

import { useCallback } from "react";
import { useLocation, useNavigate, type To } from "react-router-dom";

export interface BackNavigation {
  goBack: () => void;
  isFallback: boolean;
}

/**
 * `fallback` is where to go when this page *is* the first entry — the place the reader would have come
 * from, had they come from anywhere.
 */
export function useBackNavigation(fallback: To): BackNavigation {
  const navigate = useNavigate();
  const { key } = useLocation();
  const isFallback = key === "default";

  const goBack = useCallback(() => {
    if (isFallback) navigate(fallback);
    else navigate(-1);
  }, [isFallback, navigate, fallback]);

  return { goBack, isFallback };
}

/** Use when the caller only needs the action and always labels it as Back. */
export function useGoBack(fallback: To): () => void {
  return useBackNavigation(fallback).goBack;
}

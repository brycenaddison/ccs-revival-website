/**
 * The error boundary around a route's content column.
 *
 * React has no hook for this, so it is the one class component in the tree. It exists for one
 * failure above all: a lazy route whose chunk could not be loaded, which is what a stale tab hits
 * after a deploy (see `lib/staleChunk.ts`, which reloads once before it ever gets here). Anything
 * else a page throws during render lands here too, and the alternative is React unmounting the whole
 * application, chrome included, with a blank page and a console error nobody sees.
 *
 * The fallback keeps the nav in place, because it sits inside `SiteLayout`, and offers a reload: for
 * a stale chunk that is the fix, and for anything else it is the most a visitor can do. The layout
 * keys this on the pathname so navigating away clears the error instead of trapping every route
 * behind the first one that broke.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { ACTION } from "../admin/adminUi";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only place this goes: there is no error reporting service, and the
    // message a chunk failure carries (the URL of the missing file) is what a developer needs.
    console.error("Route failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-display text-[22px] text-text-bright">
          THIS PAGE DIDN'T LOAD
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          The site may have just been updated under you. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`${ACTION} mt-5`}
        >
          <RotateCw size={15} aria-hidden="true" />
          Reload
        </button>
      </div>
    );
  }
}

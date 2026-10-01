/**
 * shadcn's Pagination, on the CCS palette, for numbered pages that each have a URL.
 *
 * One departure from shadcn: links are React Router `Link`s rather than bare anchors, so moving
 * between pages is client-side while every page stays a real, crawlable `href`. Callers pass `to`
 * and any `rel`. Cursor lists page with `CursorPager`/`ShowMore` instead; they have no page numbers.
 */

import * as React from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/cn"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { buttonVariants, type Button } from "@/components/ui/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("m-0 flex list-none flex-row items-center gap-1 p-0", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<typeof Link>

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        "no-underline",
        isActive && "border-brand",
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  children = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon size={16} aria-hidden="true" />
      <span>{children}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  children = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span>{children}</span>
      <ChevronRightIcon size={16} aria-hidden="true" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center text-text-dim", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}

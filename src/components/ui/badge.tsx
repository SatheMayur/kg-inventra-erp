import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-red-200 bg-red-500/10 text-red-700 font-semibold dark:border-red-900/50 dark:bg-red-500/20 dark:text-red-400",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success:
          "border-emerald-200 bg-emerald-500/10 text-emerald-700 font-semibold dark:border-emerald-900/50 dark:bg-emerald-500/20 dark:text-emerald-400",
        warning:
          "border-amber-200 bg-amber-500/10 text-amber-800 font-semibold dark:border-amber-900/50 dark:bg-amber-500/20 dark:text-amber-400",
        info:
          "border-blue-200 bg-blue-500/10 text-blue-700 font-semibold dark:border-blue-900/50 dark:bg-blue-500/20 dark:text-blue-400",
        purple:
          "border-purple-200 bg-purple-500/10 text-purple-700 font-semibold dark:border-purple-900/50 dark:bg-purple-500/20 dark:text-purple-400",
        pending:
          "border-amber-300 bg-amber-500/15 text-amber-900 font-semibold dark:border-amber-800 dark:bg-amber-500/25 dark:text-amber-300 animate-pulse",
        draft:
          "border-slate-200 bg-slate-500/10 text-slate-700 font-medium dark:border-slate-800 dark:bg-slate-500/20 dark:text-slate-300",
        locked:
          "border-indigo-200 bg-indigo-500/10 text-indigo-800 font-semibold dark:border-indigo-900/50 dark:bg-indigo-500/20 dark:text-indigo-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

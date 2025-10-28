/**
 * ToggleGroup Component
 *
 * Neobrutalism-styled toggle group component
 * Styled to match the tabs component design system
 */
"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function ToggleGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-base border-2 border-border bg-background p-1 text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Root>
  )
}

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-base border-2 border-transparent px-3 py-1 gap-1.5 text-sm font-heading ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-main data-[state=on]:text-main-foreground data-[state=on]:border-border",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
})
ToggleGroupItem.displayName = "ToggleGroupItem"

// Component that adds tooltip support to ToggleGroupItem
// Must be used as direct child of ToggleGroup to preserve toggle functionality
const TooltippedToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & {
    tooltip: string
    tooltipSide?: "top" | "right" | "bottom" | "left"
  }
>(({ tooltip, tooltipSide = "bottom", className, children, ...props }, ref) => {
  const [open, setOpen] = React.useState(false)

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <ToggleGroupPrimitive.Item
          ref={ref}
          data-slot="toggle-group-item"
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-base border-2 border-transparent px-3 py-1 gap-1.5 text-sm font-heading ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-main data-[state=on]:text-main-foreground data-[state=on]:border-border",
            className
          )}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          {...props}
        >
          {children}
        </ToggleGroupPrimitive.Item>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={tooltipSide}
            className="z-50 overflow-hidden rounded-base border-2 border-border bg-main px-3 py-1.5 text-sm font-base text-main-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            sideOffset={5}
          >
            {tooltip}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
})
TooltippedToggleGroupItem.displayName = "TooltippedToggleGroupItem"

export { ToggleGroup, ToggleGroupItem, TooltippedToggleGroupItem }

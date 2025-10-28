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
    <TooltipPrimitive.Provider delayDuration={300}>
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
    </TooltipPrimitive.Provider>
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
// Manually controls tooltip to avoid prop forwarding issues
const TooltippedToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & {
    tooltip: string
    tooltipSide?: "top" | "right" | "bottom" | "left"
  }
>(({ tooltip, tooltipSide = "bottom", className, children, ...props }, ref) => {
  const [open, setOpen] = React.useState(false)

  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>
        <div style={{ display: 'inline-flex' }}>
          <ToggleGroupPrimitive.Item
            ref={ref}
            data-slot="toggle-group-item"
            className={cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-base border-2 border-transparent px-3 py-1 gap-1.5 text-sm font-heading ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-main data-[state=on]:text-main-foreground data-[state=on]:border-border",
              className
            )}
            onPointerEnter={() => setOpen(true)}
            onPointerLeave={() => setOpen(false)}
            {...props}
          >
            {children}
          </ToggleGroupPrimitive.Item>
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={tooltipSide}
          sideOffset={8}
          className="z-50 overflow-hidden rounded-base border-2 border-border bg-main px-3 py-1.5 text-sm text-main-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in-0 zoom-in-95"
        >
          {tooltip}
          <TooltipPrimitive.Arrow className="fill-border" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
})
TooltippedToggleGroupItem.displayName = "TooltippedToggleGroupItem"

export { ToggleGroup, ToggleGroupItem, TooltippedToggleGroupItem }

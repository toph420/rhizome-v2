/**
 * Sonner Toast Component
 *
 * Source: Neobrutalism UI Library
 * Original: components/libraries/neobrutalism/sonner.tsx
 *
 * Copied to components/rhizome for centralized Rhizome design system usage.
 */

"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      style={{ fontFamily: "inherit", overflowWrap: "anywhere" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-background text-foreground border-border border-2 font-heading shadow-shadow rounded-base text-[13px] flex items-center gap-2.5 p-4 w-[356px] [&:has(button)]:justify-between",
          description: "font-base text-foreground",
          actionButton:
            "font-base border-2 text-[12px] h-6 px-2 bg-main text-main-foreground border-border rounded-base shrink-0",
          cancelButton:
            "font-base border-2 text-[12px] h-6 px-2 bg-secondary-background text-foreground border-border rounded-base shrink-0",
          error: "bg-black text-white",
          loading:
            "[&[data-sonner-toast] [data-icon]]:flex [&[data-sonner-toast] [data-icon]]:size-4 [&[data-sonner-toast] [data-icon]]:relative [&[data-sonner-toast] [data-icon]]:justify-start [&[data-sonner-toast] [data-icon]]:items-center [&[data-sonner-toast] [data-icon]]:flex-shrink-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

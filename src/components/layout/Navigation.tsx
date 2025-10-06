'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home,
  Library,
  Settings,
  BookOpen,
  Brain,
  Palette
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface NavigationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const navigation = [
  {
    name: 'Library',
    href: '/',
    icon: Library,
  },
  {
    name: 'Study',
    href: '/study',
    icon: Brain,
    disabled: true, // Coming soon
  },
  {
    name: 'Design Guide',
    href: '/design',
    icon: Palette,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

export function Navigation({ open, onOpenChange }: NavigationProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop Navigation */}
      <aside className="hidden lg:block w-64 border-r bg-background min-h-screen">
        <div className="flex flex-col h-full py-6 px-3">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.name}
                  href={item.disabled ? '#' : item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground',
                    item.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={(e) => item.disabled && e.preventDefault()}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                  {item.disabled && (
                    <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile Navigation (Sheet) */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="py-4 px-3">
            <nav className="space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    href={item.disabled ? '#' : item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground',
                      item.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={(e) => {
                      if (item.disabled) {
                        e.preventDefault()
                      } else {
                        onOpenChange(false)
                      }
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                    {item.disabled && (
                      <span className="ml-auto text-xs text-muted-foreground">Soon</span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

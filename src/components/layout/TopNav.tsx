'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Settings, Library, Brain, Palette, Database, FlaskConical } from 'lucide-react'
import { Button } from '@/components/rhizome/button'
import { cn } from '@/lib/utils'

interface TopNavProps {
  onMenuClick: () => void
  onAdminClick: () => void
  onSettingsClick: () => void
}

const navigation: Array<{
  name: string
  href: string
  icon: typeof Library
  disabled?: boolean
}> = [
  {
    name: 'Library',
    href: '/',
    icon: Library,
  },
  {
    name: 'Study',
    href: '/study',
    icon: Brain,
  },
  {
    name: 'Experiments',
    href: '/experiments/prompts',
    icon: FlaskConical,
  },
  {
    name: 'Design Guide',
    href: '/design',
    icon: Palette,
  },
]

export function TopNav({ onMenuClick, onAdminClick, onSettingsClick }: TopNavProps) {
  const pathname = usePathname()

  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex h-14 items-center px-6">
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>

        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <span className="font-bold text-xl">Rhizome</span>
          </Link>
        </div>

        {/* Centered Navigation - Desktop only */}
        <nav className="hidden lg:flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Button
                  key={item.name}
                  variant={isActive ? 'default' : 'ghost'}
                  size="default"
                  asChild
                  disabled={item.disabled}
                >
                  <Link
                    href={item.disabled ? '#' : item.href}
                    onClick={(e) => item.disabled && e.preventDefault()}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                    {item.disabled && (
                      <span className="ml-1 text-xs">Soon</span>
                    )}
                  </Link>
                </Button>
              )
            })}
          </div>
        </nav>

        {/* Spacer for mobile to push content right */}
        <div className="flex-1 lg:hidden" />

        {/* Settings and Admin Panel Buttons - Always visible */}
        <div className="flex items-center gap-2">
          <Button
            variant="neutral"
            size="icon"
            onClick={onSettingsClick}
            title="Open Settings (Cmd+,)"
          >
            <Settings className="h-5 w-5" />
            <span className="sr-only">Open Settings</span>
          </Button>

          <Button
            variant="neutral"
            size="icon"
            onClick={onAdminClick}
            title="Open Admin Panel (Cmd+Shift+A)"
          >
            <Database className="h-5 w-5" />
            <span className="sr-only">Open Admin Panel</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

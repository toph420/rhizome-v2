'use client'

import { useState } from 'react'
import { NeobrutalismTheme, RetroUITheme } from './ThemeWrappers'

// Neobrutalism Components
import { Accordion as NeoAccordion, AccordionContent as NeoAccordionContent, AccordionItem as NeoAccordionItem, AccordionTrigger as NeoAccordionTrigger } from '@/components/libraries/neobrutalism/accordion'
import { Alert as NeoAlert, AlertDescription as NeoAlertDescription, AlertTitle as NeoAlertTitle } from '@/components/libraries/neobrutalism/alert'
import { Avatar as NeoAvatar, AvatarFallback as NeoAvatarFallback, AvatarImage as NeoAvatarImage } from '@/components/libraries/neobrutalism/avatar'
import { Badge as NeoBadge } from '@/components/libraries/neobrutalism/badge'
import { Button as NeoButton } from '@/components/libraries/neobrutalism/button'
import { Card as NeoCard, CardContent as NeoCardContent, CardDescription as NeoCardDescription, CardFooter as NeoCardFooter, CardHeader as NeoCardHeader, CardTitle as NeoCardTitle } from '@/components/libraries/neobrutalism/card'
import { Checkbox as NeoCheckbox } from '@/components/libraries/neobrutalism/checkbox'
import { Input as NeoInput } from '@/components/libraries/neobrutalism/input'
import { Label as NeoLabel } from '@/components/libraries/neobrutalism/label'
import { Popover as NeoPopover, PopoverContent as NeoPopoverContent, PopoverTrigger as NeoPopoverTrigger } from '@/components/libraries/neobrutalism/popover'
import { Progress as NeoProgress } from '@/components/libraries/neobrutalism/progress'
import { RadioGroup as NeoRadioGroup, RadioGroupItem as NeoRadioGroupItem } from '@/components/libraries/neobrutalism/radio-group'
import { Select as NeoSelect, SelectContent as NeoSelectContent, SelectItem as NeoSelectItem, SelectTrigger as NeoSelectTrigger, SelectValue as NeoSelectValue } from '@/components/libraries/neobrutalism/select'
import { Slider as NeoSlider } from '@/components/libraries/neobrutalism/slider'
import { Switch as NeoSwitch } from '@/components/libraries/neobrutalism/switch'
import { Table as NeoTable, TableBody as NeoTableBody, TableCell as NeoTableCell, TableHead as NeoTableHead, TableHeader as NeoTableHeader, TableRow as NeoTableRow } from '@/components/libraries/neobrutalism/table'
import { Tabs as NeoTabs, TabsContent as NeoTabsContent, TabsList as NeoTabsList, TabsTrigger as NeoTabsTrigger } from '@/components/libraries/neobrutalism/tabs'
import { Textarea as NeoTextarea } from '@/components/libraries/neobrutalism/textarea'
import { Tooltip as NeoTooltip, TooltipContent as NeoTooltipContent, TooltipProvider as NeoTooltipProvider, TooltipTrigger as NeoTooltipTrigger } from '@/components/libraries/neobrutalism/tooltip'

// RetroUI Components
import { Accordion as RetroAccordion } from '@/components/libraries/retroui/Accordion'
import { Alert as RetroAlert } from '@/components/libraries/retroui/Alert'
import { Avatar as RetroAvatar } from '@/components/libraries/retroui/Avatar'
import { Badge as RetroBadge } from '@/components/libraries/retroui/Badge'
import { Button as RetroButton } from '@/components/libraries/retroui/Button'
import { Card as RetroCard } from '@/components/libraries/retroui/Card'
import { Checkbox as RetroCheckbox } from '@/components/libraries/retroui/Checkbox'
import { Input as RetroInput } from '@/components/libraries/retroui/Input'
import { Label as RetroLabel } from '@/components/libraries/retroui/Label'
import { Popover as RetroPopover } from '@/components/libraries/retroui/Popover'
import { Progress as RetroProgress } from '@/components/libraries/retroui/Progress'
import { RadioGroup as RetroRadioGroup } from '@/components/libraries/retroui/Radio'
import { Select as RetroSelect } from '@/components/libraries/retroui/Select'
import { Slider as RetroSlider } from '@/components/libraries/retroui/Slider'
import { Switch as RetroSwitch } from '@/components/libraries/retroui/Switch'
import { Table as RetroTable } from '@/components/libraries/retroui/Table'
import { Tabs as RetroTabs, TabsContent as RetroTabsContent, TabsTrigger as RetroTabsTrigger, TabsTriggerList as RetroTabsTriggerList, TabsPanels as RetroTabsPanels } from '@/components/libraries/retroui/Tab'
import { Textarea as RetroTextarea } from '@/components/libraries/retroui/Textarea'
import { Tooltip as RetroTooltip } from '@/components/libraries/retroui/Tooltip'

/**
 * Component Comparison - ALL 19 shared components between libraries
 * Neobrutalism (47 total) vs RetroUI (32 total)
 */
export function ComponentComparison() {
  const [clickCount, setClickCount] = useState({ neo: 0, retro: 0 })
  const [checked, setChecked] = useState({ neo: false, retro: false })
  const [inputValue, setInputValue] = useState({ neo: '', retro: '' })
  const [textareaValue, setTextareaValue] = useState({ neo: '', retro: '' })
  const [switchState, setSwitchState] = useState({ neo: false, retro: false })
  const [radioValue, setRadioValue] = useState({ neo: 'option1', retro: 'option1' })
  const [selectValue, setSelectValue] = useState({ neo: '', retro: '' })
  const [sliderValue, setSliderValue] = useState({ neo: [50], retro: [50] })
  const [progressValue] = useState(65)

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="neo-card">
        <h3 className="text-2xl font-bold mb-2">Complete Component Library Comparison</h3>
        <p className="text-muted-foreground mb-4">
          Side-by-side comparison of all shared components from Neobrutalism (47 total) and RetroUI (32 total)
        </p>
        <div className="flex gap-6 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary border-2 border-black"></div>
            <span><strong>Neobrutalism:</strong> Bold 3-4px borders, hard shadows</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-secondary border-2 border-black"></div>
            <span><strong>RetroUI:</strong> Playful 2-3px borders, retro aesthetic</span>
          </div>
        </div>
      </div>

      {/* Section 1: Forms & Input Components */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold border-b-4 border-black pb-2">Forms & Input</h2>

        {/* Button */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Button</h5>
              <p className="text-xs text-muted-foreground mb-4">Interactive button with variants</p>
              <div className="flex flex-wrap gap-3">
                <NeoButton onClick={() => setClickCount({ ...clickCount, neo: clickCount.neo + 1 })}>
                  Click ({clickCount.neo})
                </NeoButton>
                <NeoButton variant="neutral">Neutral</NeoButton>
                <NeoButton variant="reverse">Reverse</NeoButton>
                <NeoButton size="sm">Small</NeoButton>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Button</h5>
              <p className="text-xs text-muted-foreground mb-4">Interactive button with variants</p>
              <div className="flex flex-wrap gap-3">
                <RetroButton onClick={() => setClickCount({ ...clickCount, retro: clickCount.retro + 1 })}>
                  Click ({clickCount.retro})
                </RetroButton>
                <RetroButton variant="secondary">Secondary</RetroButton>
                <RetroButton variant="outline">Outline</RetroButton>
                <RetroButton size="sm">Small</RetroButton>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Input */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Input</h5>
              <p className="text-xs text-muted-foreground mb-4">Text input field</p>
              <div className="space-y-2">
                <NeoInput
                  placeholder="Enter text..."
                  value={inputValue.neo}
                  onChange={(e) => setInputValue({ ...inputValue, neo: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {inputValue.neo || 'Type something...'}
                </p>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Input</h5>
              <p className="text-xs text-muted-foreground mb-4">Text input field</p>
              <div className="space-y-2">
                <RetroInput
                  placeholder="Enter text..."
                  value={inputValue.retro}
                  onChange={(e) => setInputValue({ ...inputValue, retro: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {inputValue.retro || 'Type something...'}
                </p>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Textarea */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Textarea</h5>
              <p className="text-xs text-muted-foreground mb-4">Multi-line text input</p>
              <NeoTextarea
                placeholder="Enter longer text..."
                value={textareaValue.neo}
                onChange={(e) => setTextareaValue({ ...textareaValue, neo: e.target.value })}
                rows={4}
              />
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Textarea</h5>
              <p className="text-xs text-muted-foreground mb-4">Multi-line text input</p>
              <RetroTextarea
                placeholder="Enter longer text..."
                value={textareaValue.retro}
                onChange={(e) => setTextareaValue({ ...textareaValue, retro: e.target.value })}
                rows={4}
              />
            </div>
          </RetroUITheme>
        </div>

        {/* Checkbox */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Checkbox</h5>
              <p className="text-xs text-muted-foreground mb-4">Toggle selection</p>
              <div className="flex items-center space-x-2">
                <NeoCheckbox
                  id="neo-check"
                  checked={checked.neo}
                  onCheckedChange={(val) => setChecked({ ...checked, neo: !!val })}
                />
                <NeoLabel htmlFor="neo-check" className="cursor-pointer">
                  {checked.neo ? 'Checked!' : 'Check me'}
                </NeoLabel>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Checkbox</h5>
              <p className="text-xs text-muted-foreground mb-4">Toggle selection</p>
              <div className="flex items-center space-x-2">
                <RetroCheckbox
                  id="retro-check"
                  checked={checked.retro}
                  onCheckedChange={(val) => setChecked({ ...checked, retro: !!val })}
                />
                <RetroLabel htmlFor="retro-check" className="cursor-pointer">
                  {checked.retro ? 'Checked!' : 'Check me'}
                </RetroLabel>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Switch */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Switch</h5>
              <p className="text-xs text-muted-foreground mb-4">Toggle on/off state</p>
              <div className="flex items-center space-x-2">
                <NeoSwitch
                  id="neo-switch"
                  checked={switchState.neo}
                  onCheckedChange={(val) => setSwitchState({ ...switchState, neo: val })}
                />
                <NeoLabel htmlFor="neo-switch" className="cursor-pointer">
                  {switchState.neo ? 'ON' : 'OFF'}
                </NeoLabel>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Switch</h5>
              <p className="text-xs text-muted-foreground mb-4">Toggle on/off state</p>
              <div className="flex items-center space-x-2">
                <RetroSwitch
                  id="retro-switch"
                  checked={switchState.retro}
                  onCheckedChange={(val) => setSwitchState({ ...switchState, retro: val })}
                />
                <RetroLabel htmlFor="retro-switch" className="cursor-pointer">
                  {switchState.retro ? 'ON' : 'OFF'}
                </RetroLabel>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Radio Group */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Radio Group</h5>
              <p className="text-xs text-muted-foreground mb-4">Select one option</p>
              <NeoRadioGroup value={radioValue.neo} onValueChange={(val) => setRadioValue({ ...radioValue, neo: val })}>
                <div className="flex items-center space-x-2">
                  <NeoRadioGroupItem value="option1" id="neo-r1" />
                  <NeoLabel htmlFor="neo-r1" className="cursor-pointer">Option 1</NeoLabel>
                </div>
                <div className="flex items-center space-x-2">
                  <NeoRadioGroupItem value="option2" id="neo-r2" />
                  <NeoLabel htmlFor="neo-r2" className="cursor-pointer">Option 2</NeoLabel>
                </div>
                <div className="flex items-center space-x-2">
                  <NeoRadioGroupItem value="option3" id="neo-r3" />
                  <NeoLabel htmlFor="neo-r3" className="cursor-pointer">Option 3</NeoLabel>
                </div>
              </NeoRadioGroup>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Radio Group</h5>
              <p className="text-xs text-muted-foreground mb-4">Select one option</p>
              <RetroRadioGroup value={radioValue.retro} onValueChange={(val) => setRadioValue({ ...radioValue, retro: val })}>
                <div className="flex items-center space-x-2">
                  <RetroRadioGroup.Item value="option1" id="retro-r1" />
                  <RetroLabel htmlFor="retro-r1" className="cursor-pointer">Option 1</RetroLabel>
                </div>
                <div className="flex items-center space-x-2">
                  <RetroRadioGroup.Item value="option2" id="retro-r2" />
                  <RetroLabel htmlFor="retro-r2" className="cursor-pointer">Option 2</RetroLabel>
                </div>
                <div className="flex items-center space-x-2">
                  <RetroRadioGroup.Item value="option3" id="retro-r3" />
                  <RetroLabel htmlFor="retro-r3" className="cursor-pointer">Option 3</RetroLabel>
                </div>
              </RetroRadioGroup>
            </div>
          </RetroUITheme>
        </div>

        {/* Select */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Select</h5>
              <p className="text-xs text-muted-foreground mb-4">Dropdown selection</p>
              <NeoSelect value={selectValue.neo} onValueChange={(val) => setSelectValue({ ...selectValue, neo: val })}>
                <NeoSelectTrigger>
                  <NeoSelectValue placeholder="Select an option" />
                </NeoSelectTrigger>
                <NeoSelectContent>
                  <NeoSelectItem value="apple">Apple</NeoSelectItem>
                  <NeoSelectItem value="banana">Banana</NeoSelectItem>
                  <NeoSelectItem value="orange">Orange</NeoSelectItem>
                </NeoSelectContent>
              </NeoSelect>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Select</h5>
              <p className="text-xs text-muted-foreground mb-4">Dropdown selection</p>
              <RetroSelect value={selectValue.retro} onValueChange={(val) => setSelectValue({ ...selectValue, retro: val })}>
                <RetroSelect.Trigger>
                  <RetroSelect.Value placeholder="Select an option" />
                </RetroSelect.Trigger>
                <RetroSelect.Content>
                  <RetroSelect.Item value="apple">Apple</RetroSelect.Item>
                  <RetroSelect.Item value="banana">Banana</RetroSelect.Item>
                  <RetroSelect.Item value="orange">Orange</RetroSelect.Item>
                </RetroSelect.Content>
              </RetroSelect>
            </div>
          </RetroUITheme>
        </div>

        {/* Slider */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Slider</h5>
              <p className="text-xs text-muted-foreground mb-4">Range input</p>
              <div className="space-y-2">
                <NeoSlider
                  value={sliderValue.neo}
                  onValueChange={(val) => setSliderValue({ ...sliderValue, neo: val })}
                  max={100}
                  step={1}
                />
                <p className="text-sm text-center">Value: {sliderValue.neo[0]}</p>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Slider</h5>
              <p className="text-xs text-muted-foreground mb-4">Range input</p>
              <div className="space-y-2">
                <RetroSlider
                  value={sliderValue.retro}
                  onValueChange={(val) => setSliderValue({ ...sliderValue, retro: val })}
                  max={100}
                  step={1}
                />
                <p className="text-sm text-center">Value: {sliderValue.retro[0]}</p>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Label */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Label</h5>
              <p className="text-xs text-muted-foreground mb-4">Form field labels</p>
              <div className="space-y-2">
                <NeoLabel htmlFor="neo-example">Email Address</NeoLabel>
                <NeoInput id="neo-example" type="email" placeholder="you@example.com" />
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Label</h5>
              <p className="text-xs text-muted-foreground mb-4">Form field labels</p>
              <div className="space-y-2">
                <RetroLabel htmlFor="retro-example">Email Address</RetroLabel>
                <RetroInput id="retro-example" type="email" placeholder="you@example.com" />
              </div>
            </div>
          </RetroUITheme>
        </div>
      </section>

      {/* Section 2: Data Display Components */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold border-b-4 border-black pb-2">Data Display</h2>

        {/* Badge */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Badge</h5>
              <p className="text-xs text-muted-foreground mb-4">Status indicators</p>
              <div className="flex flex-wrap gap-2">
                <NeoBadge>Default</NeoBadge>
                <NeoBadge variant="secondary">Secondary</NeoBadge>
                <NeoBadge variant="destructive">Destructive</NeoBadge>
                <NeoBadge variant="outline">Outline</NeoBadge>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Badge</h5>
              <p className="text-xs text-muted-foreground mb-4">Status indicators</p>
              <div className="flex flex-wrap gap-2">
                <RetroBadge>Default</RetroBadge>
                <RetroBadge variant="secondary">Secondary</RetroBadge>
                <RetroBadge variant="outline">Outline</RetroBadge>
                <RetroBadge variant="solid">Solid</RetroBadge>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Avatar */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Avatar</h5>
              <p className="text-xs text-muted-foreground mb-4">User profile images</p>
              <div className="flex gap-4 items-center">
                <NeoAvatar>
                  <NeoAvatarImage src="https://github.com/shadcn.png" alt="User" />
                  <NeoAvatarFallback>CN</NeoAvatarFallback>
                </NeoAvatar>
                <NeoAvatar>
                  <NeoAvatarFallback>AB</NeoAvatarFallback>
                </NeoAvatar>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Avatar</h5>
              <p className="text-xs text-muted-foreground mb-4">User profile images</p>
              <div className="flex gap-4 items-center">
                <RetroAvatar>
                  <RetroAvatar.Image src="https://github.com/shadcn.png" alt="User" />
                  <RetroAvatar.Fallback>CN</RetroAvatar.Fallback>
                </RetroAvatar>
                <RetroAvatar>
                  <RetroAvatar.Fallback>AB</RetroAvatar.Fallback>
                </RetroAvatar>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Card */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="space-y-4">
              <h5 className="font-bold">Card</h5>
              <p className="text-xs text-muted-foreground">Content containers</p>
              <NeoCard>
                <NeoCardHeader>
                  <NeoCardTitle>Card Title</NeoCardTitle>
                  <NeoCardDescription>Card description goes here</NeoCardDescription>
                </NeoCardHeader>
                <NeoCardContent>
                  <p className="text-sm">This is the card content area with some example text.</p>
                </NeoCardContent>
                <NeoCardFooter>
                  <NeoButton size="sm">Action</NeoButton>
                </NeoCardFooter>
              </NeoCard>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="space-y-4">
              <h5 className="font-bold">Card</h5>
              <p className="text-xs text-muted-foreground">Content containers</p>
              <RetroCard>
                <RetroCard.Header>
                  <RetroCard.Title>Card Title</RetroCard.Title>
                  <RetroCard.Description>Card description goes here</RetroCard.Description>
                </RetroCard.Header>
                <RetroCard.Content>
                  <p className="text-sm">This is the card content area with some example text.</p>
                </RetroCard.Content>
              </RetroCard>
            </div>
          </RetroUITheme>
        </div>

        {/* Progress */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Progress</h5>
              <p className="text-xs text-muted-foreground mb-4">Progress indicators</p>
              <div className="space-y-2">
                <NeoProgress value={progressValue} />
                <p className="text-sm text-center">{progressValue}% complete</p>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Progress</h5>
              <p className="text-xs text-muted-foreground mb-4">Progress indicators</p>
              <div className="space-y-2">
                <RetroProgress value={progressValue} />
                <p className="text-sm text-center">{progressValue}% complete</p>
              </div>
            </div>
          </RetroUITheme>
        </div>

        {/* Table */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Table</h5>
              <p className="text-xs text-muted-foreground mb-4">Data tables</p>
              <NeoTable>
                <NeoTableHeader>
                  <NeoTableRow>
                    <NeoTableHead>Name</NeoTableHead>
                    <NeoTableHead>Status</NeoTableHead>
                  </NeoTableRow>
                </NeoTableHeader>
                <NeoTableBody>
                  <NeoTableRow>
                    <NeoTableCell>Item 1</NeoTableCell>
                    <NeoTableCell><NeoBadge>Active</NeoBadge></NeoTableCell>
                  </NeoTableRow>
                  <NeoTableRow>
                    <NeoTableCell>Item 2</NeoTableCell>
                    <NeoTableCell><NeoBadge variant="secondary">Pending</NeoBadge></NeoTableCell>
                  </NeoTableRow>
                </NeoTableBody>
              </NeoTable>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Table</h5>
              <p className="text-xs text-muted-foreground mb-4">Data tables</p>
              <RetroTable>
                <RetroTable.Header>
                  <RetroTable.Row>
                    <RetroTable.Head>Name</RetroTable.Head>
                    <RetroTable.Head>Status</RetroTable.Head>
                  </RetroTable.Row>
                </RetroTable.Header>
                <RetroTable.Body>
                  <RetroTable.Row>
                    <RetroTable.Cell>Item 1</RetroTable.Cell>
                    <RetroTable.Cell><RetroBadge>Active</RetroBadge></RetroTable.Cell>
                  </RetroTable.Row>
                  <RetroTable.Row>
                    <RetroTable.Cell>Item 2</RetroTable.Cell>
                    <RetroTable.Cell><RetroBadge variant="secondary">Pending</RetroBadge></RetroTable.Cell>
                  </RetroTable.Row>
                </RetroTable.Body>
              </RetroTable>
            </div>
          </RetroUITheme>
        </div>

        {/* Tooltip */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Tooltip</h5>
              <p className="text-xs text-muted-foreground mb-4">Contextual help</p>
              <NeoTooltipProvider>
                <NeoTooltip>
                  <NeoTooltipTrigger asChild>
                    <NeoButton variant="outline">Hover me</NeoButton>
                  </NeoTooltipTrigger>
                  <NeoTooltipContent>
                    <p>Helpful tooltip content</p>
                  </NeoTooltipContent>
                </NeoTooltip>
              </NeoTooltipProvider>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Tooltip</h5>
              <p className="text-xs text-muted-foreground mb-4">Contextual help</p>
              <RetroTooltip.Provider>
                <RetroTooltip>
                  <RetroTooltip.Trigger asChild>
                    <RetroButton variant="outline">Hover me</RetroButton>
                  </RetroTooltip.Trigger>
                  <RetroTooltip.Content>
                    <p>Helpful tooltip content</p>
                  </RetroTooltip.Content>
                </RetroTooltip>
              </RetroTooltip.Provider>
            </div>
          </RetroUITheme>
        </div>
      </section>

      {/* Section 3: Navigation Components */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold border-b-4 border-black pb-2">Navigation</h2>

        {/* Accordion */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Accordion</h5>
              <p className="text-xs text-muted-foreground mb-4">Collapsible content</p>
              <NeoAccordion type="single" collapsible>
                <NeoAccordionItem value="item-1">
                  <NeoAccordionTrigger>Is it accessible?</NeoAccordionTrigger>
                  <NeoAccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </NeoAccordionContent>
                </NeoAccordionItem>
                <NeoAccordionItem value="item-2">
                  <NeoAccordionTrigger>Is it styled?</NeoAccordionTrigger>
                  <NeoAccordionContent>
                    Yes. Comes with brutalist styling out of the box.
                  </NeoAccordionContent>
                </NeoAccordionItem>
              </NeoAccordion>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Accordion</h5>
              <p className="text-xs text-muted-foreground mb-4">Collapsible content</p>
              <RetroAccordion type="single" collapsible>
                <RetroAccordion.Item value="item-1">
                  <RetroAccordion.Header>Is it accessible?</RetroAccordion.Header>
                  <RetroAccordion.Content>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </RetroAccordion.Content>
                </RetroAccordion.Item>
                <RetroAccordion.Item value="item-2">
                  <RetroAccordion.Header>Is it styled?</RetroAccordion.Header>
                  <RetroAccordion.Content>
                    Yes. Comes with retro styling out of the box.
                  </RetroAccordion.Content>
                </RetroAccordion.Item>
              </RetroAccordion>
            </div>
          </RetroUITheme>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Tabs</h5>
              <p className="text-xs text-muted-foreground mb-4">Tabbed navigation</p>
              <NeoTabs defaultValue="tab1">
                <NeoTabsList>
                  <NeoTabsTrigger value="tab1">Tab 1</NeoTabsTrigger>
                  <NeoTabsTrigger value="tab2">Tab 2</NeoTabsTrigger>
                  <NeoTabsTrigger value="tab3">Tab 3</NeoTabsTrigger>
                </NeoTabsList>
                <NeoTabsContent value="tab1" className="p-4">
                  Content for tab 1
                </NeoTabsContent>
                <NeoTabsContent value="tab2" className="p-4">
                  Content for tab 2
                </NeoTabsContent>
                <NeoTabsContent value="tab3" className="p-4">
                  Content for tab 3
                </NeoTabsContent>
              </NeoTabs>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Tabs</h5>
              <p className="text-xs text-muted-foreground mb-4">Tabbed navigation</p>
              <RetroTabs defaultValue="tab1">
                <RetroTabsTriggerList>
                  <RetroTabsTrigger value="tab1">Tab 1</RetroTabsTrigger>
                  <RetroTabsTrigger value="tab2">Tab 2</RetroTabsTrigger>
                  <RetroTabsTrigger value="tab3">Tab 3</RetroTabsTrigger>
                </RetroTabsTriggerList>
                <RetroTabsPanels>
                  <RetroTabsContent value="tab1">Content for tab 1</RetroTabsContent>
                  <RetroTabsContent value="tab2">Content for tab 2</RetroTabsContent>
                  <RetroTabsContent value="tab3">Content for tab 3</RetroTabsContent>
                </RetroTabsPanels>
              </RetroTabs>
            </div>
          </RetroUITheme>
        </div>
      </section>

      {/* Section 4: Overlay Components */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold border-b-4 border-black pb-2">Overlays</h2>

        {/* Popover */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Popover</h5>
              <p className="text-xs text-muted-foreground mb-4">Contextual overlay</p>
              <NeoPopover>
                <NeoPopoverTrigger asChild>
                  <NeoButton>Open Popover</NeoButton>
                </NeoPopoverTrigger>
                <NeoPopoverContent>
                  <div className="space-y-2">
                    <h4 className="font-bold">Popover Title</h4>
                    <p className="text-sm">This is popover content.</p>
                  </div>
                </NeoPopoverContent>
              </NeoPopover>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Popover</h5>
              <p className="text-xs text-muted-foreground mb-4">Contextual overlay</p>
              <RetroPopover>
                <RetroPopover.Trigger asChild>
                  <RetroButton>Open Popover</RetroButton>
                </RetroPopover.Trigger>
                <RetroPopover.Content>
                  <div className="space-y-2">
                    <h4 className="font-bold">Popover Title</h4>
                    <p className="text-sm">This is popover content.</p>
                  </div>
                </RetroPopover.Content>
              </RetroPopover>
            </div>
          </RetroUITheme>
        </div>
      </section>

      {/* Section 5: Notification Components */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold border-b-4 border-black pb-2">Notifications</h2>

        {/* Alert */}
        <div className="grid grid-cols-2 gap-6">
          <NeobrutalismTheme>
            <div className="neo-card bg-primary/5">
              <h5 className="font-bold mb-2">Alert</h5>
              <p className="text-xs text-muted-foreground mb-4">Important messages</p>
              <div className="space-y-3">
                <NeoAlert>
                  <NeoAlertTitle>Success!</NeoAlertTitle>
                  <NeoAlertDescription>
                    Your changes have been saved successfully.
                  </NeoAlertDescription>
                </NeoAlert>
                <NeoAlert variant="destructive">
                  <NeoAlertTitle>Error</NeoAlertTitle>
                  <NeoAlertDescription>
                    Something went wrong.
                  </NeoAlertDescription>
                </NeoAlert>
              </div>
            </div>
          </NeobrutalismTheme>

          <RetroUITheme>
            <div className="neo-card bg-secondary/5">
              <h5 className="font-bold mb-2">Alert</h5>
              <p className="text-xs text-muted-foreground mb-4">Important messages</p>
              <div className="space-y-3">
                <RetroAlert variant="default">
                  <div className="font-bold">Success!</div>
                  <div className="text-sm">Your changes have been saved successfully.</div>
                </RetroAlert>
                <RetroAlert status="error">
                  <div className="font-bold">Error</div>
                  <div className="text-sm">Something went wrong.</div>
                </RetroAlert>
              </div>
            </div>
          </RetroUITheme>
        </div>
      </section>

      {/* Summary */}
      <div className="neo-card bg-gradient-to-br from-primary/10 to-secondary/10">
        <h4 className="text-2xl font-bold mb-4">Component Library Summary</h4>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h5 className="font-bold text-lg mb-3 flex items-center gap-2">
              <div className="w-4 h-4 bg-primary border-2 border-black"></div>
              Neobrutalism (47 total)
            </h5>
            <ul className="space-y-2 text-sm list-disc list-inside text-muted-foreground">
              <li>Comprehensive library with 47 components</li>
              <li>Bold 3-4px borders with hard drop shadows</li>
              <li>Flat design with high contrast aesthetics</li>
              <li>Wide spacing and prominent visual hierarchy</li>
              <li>Advanced: Chart, Carousel, Data Table, Sidebar, etc.</li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-lg mb-3 flex items-center gap-2">
              <div className="w-4 h-4 bg-secondary border-2 border-black"></div>
              RetroUI (32 total)
            </h5>
            <ul className="space-y-2 text-sm list-disc list-inside text-muted-foreground">
              <li>Focused library with 32 essential components</li>
              <li>Playful 2-3px borders with retro aesthetic</li>
              <li>Vibrant colors with softer shadow styling</li>
              <li>Compact sizing with friendly, approachable feel</li>
              <li>Specialized: Area/Bar/Line/Pie Charts, Toggle variants</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Import Reference */}
      <div className="neo-card">
        <h4 className="text-xl font-bold mb-4">Import Reference</h4>
        <div className="grid grid-cols-2 gap-6">
          <div className="border-2 border-black p-4 rounded bg-muted/50 font-mono text-xs space-y-2">
            <div className="font-bold text-sm mb-3">Neobrutalism</div>
            <div>import {`{ Button }`} from '@/components/libraries/neobrutalism/button'</div>
            <div>import {`{ Card }`} from '@/components/libraries/neobrutalism/card'</div>
            <div>import {`{ Badge }`} from '@/components/libraries/neobrutalism/badge'</div>
            <div className="text-muted-foreground pt-2">// Named exports, standard Radix UI patterns</div>
          </div>
          <div className="border-2 border-black p-4 rounded bg-muted/50 font-mono text-xs space-y-2">
            <div className="font-bold text-sm mb-3">RetroUI</div>
            <div>import {`{ Button }`} from '@/components/libraries/retroui/Button'</div>
            <div>import {`{ Card }`} from '@/components/libraries/retroui/Card'</div>
            <div>import {`{ Badge }`} from '@/components/libraries/retroui/Badge'</div>
            <div className="text-muted-foreground pt-2">// Compound components with dot notation</div>
          </div>
        </div>
      </div>
    </div>
  )
}

# Neobrutalism Components

**Total Components**: 47

## Source

- **Website**: https://www.neobrutalism.dev
- **GitHub**: https://github.com/ekmas/neobrutalism-components
- **Registry**: https://neobrutalism.dev/r/{component}.json
- **License**: MIT
- **Installed**: 2025-10-22

## Description

Neobrutalism Components is a collection of brutalist-styled React components built on Radix UI primitives and Tailwind CSS. Features bold borders, hard shadows, and flat design aesthetics.

## Components (47)

### Layout & Navigation
- accordion
- breadcrumb
- navigation-menu
- sidebar
- tabs

### Forms & Input
- button
- checkbox
- combobox
- command
- date-picker
- form
- input
- input-otp
- label
- radio-group
- select
- slider
- switch
- textarea

### Data Display
- avatar
- badge
- calendar
- card
- carousel
- chart
- data-table
- image-card
- marquee
- progress
- table
- tooltip

### Feedback & Overlays
- alert
- alert-dialog
- dialog
- drawer
- hover-card
- popover
- sheet
- skeleton
- sonner

### Utilities
- collapsible
- context-menu
- dropdown-menu
- menubar
- pagination
- resizable
- scroll-area

## Installation Method

Components were downloaded using:

```bash
curl -sL "https://neobrutalism.dev/r/{component}.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for file in data['files']:
    filename = file['path'].split('/')[-1]
    with open(f'src/components/libraries/neobrutalism/{filename}', 'w') as f:
        f.write(file['content'].replace('\\r\\n', '\\n'))
"
```

## Modifications

None - components are used as-is from registry for accurate comparison and testing.

## Usage

See `/design` page → Libraries tab → Neobrutalism Showcase for examples and interactive demos.

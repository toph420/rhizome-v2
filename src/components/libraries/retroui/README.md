# RetroUI Components

**Total Components**: 32

## Source

- **Website**: https://www.retroui.dev
- **Registry**: https://www.retroui.dev/r/{component}.json
- **Installed**: 2025-10-22

## Description

RetroUI is a NeoBrutalism styled React + TailwindCSS UI library that emphasizes playful, retro aesthetics with bold colors and strong borders.

## Components (32)

### Forms & Input
- button
- checkbox
- input
- label
- radio
- select
- slider
- switch
- textarea
- toggle
- toggle-group

### Data Display
- avatar
- badge
- card
- progress
- table
- text
- loader

### Charts
- area-chart
- bar-chart
- line-chart
- pie-chart

### Overlays & Navigation
- accordion
- alert
- command
- context-menu
- dialog
- menu
- popover
- sonner
- tab
- tooltip

## Installation Method

Components were downloaded using:

```bash
curl -sL "https://www.retroui.dev/r/{component}.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for file in data['files']:
    filename = file['path'].split('/')[-1]
    with open(f'src/components/libraries/retroui/{filename}', 'w') as f:
        f.write(file['content'].replace('\\r\\n', '\\n'))
"
```

## Modifications

None - components are used as-is from registry for accurate comparison and testing.

## Usage

See `/design` page → Libraries tab → RetroUI Showcase for examples and interactive demos.

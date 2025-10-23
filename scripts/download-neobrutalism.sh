#!/bin/bash

# Download all Neobrutalism components to src/components/libraries/neobrutalism/

# Don't exit on first error - collect all errors
set +e

COMPONENTS=(
  "accordion"
  "alert-dialog"
  "alert"
  "avatar"
  "badge"
  "breadcrumb"
  "button"
  "calendar"
  "card"
  "carousel"
  "chart"
  "checkbox"
  "collapsible"
  "combobox"
  "command"
  "context-menu"
  "date-picker"
  "data-table"
  "dialog"
  "drawer"
  "dropdown-menu"
  "form"
  "hover-card"
  "image-card"
  "input-otp"
  "input"
  "label"
  "marquee"
  "menubar"
  "navigation-menu"
  "pagination"
  "popover"
  "progress"
  "radio-group"
  "resizable"
  "scroll-area"
  "select"
  "sheet"
  "sidebar"
  "skeleton"
  "slider"
  "sonner"
  "switch"
  "table"
  "tabs"
  "textarea"
  "tooltip"
)

OUTPUT_DIR="src/components/libraries/neobrutalism"
REGISTRY_URL="https://neobrutalism.dev/r"

echo "Downloading ${#COMPONENTS[@]} Neobrutalism components..."

FAILED_COMPONENTS=()

for component in "${COMPONENTS[@]}"; do
  echo "  Downloading $component..."

  curl -sL "${REGISTRY_URL}/${component}.json" | python3 -c "
import json, sys, os

try:
    data = json.load(sys.stdin)
    files = data.get('files', [])

    if not files:
        print(f'  Warning: No files found for ${component}')
        sys.exit(0)

    for file in files:
        content = file.get('content', '')
        path = file.get('path', '')

        # Extract filename from path
        if path:
            filename = path.split('/')[-1]
        else:
            # Fallback: use component name
            filename = '${component}.tsx'

        # Write to output directory
        output_path = os.path.join('${OUTPUT_DIR}', filename)
        with open(output_path, 'w') as f:
            # Normalize line endings
            f.write(content.replace('\r\n', '\n'))

        print(f'    ✓ Saved {filename}')

except json.JSONDecodeError as e:
    print(f'  Error: Invalid JSON for ${component}')
    sys.exit(1)
except Exception as e:
    print(f'  Error: {str(e)}')
    sys.exit(1)
"

  if [ $? -ne 0 ]; then
    echo "  ✗ Failed to download $component"
    FAILED_COMPONENTS+=("$component")
  fi
done

# Report failures
if [ ${#FAILED_COMPONENTS[@]} -gt 0 ]; then
  echo ""
  echo "⚠️  Failed components (${#FAILED_COMPONENTS[@]}):"
  for comp in "${FAILED_COMPONENTS[@]}"; do
    echo "  - $comp"
  done
fi

echo ""
echo "✓ Download complete!"
echo "  Location: ${OUTPUT_DIR}/"
echo "  Total files: $(ls -1 ${OUTPUT_DIR}/*.tsx 2>/dev/null | wc -l | tr -d ' ')"

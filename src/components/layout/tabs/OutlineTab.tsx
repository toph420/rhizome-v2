'use client'

interface OutlineTabProps {
  outline?: any[]
  onPageNavigate?: (page: number) => void
}

export function OutlineTab({ outline, onPageNavigate }: OutlineTabProps) {
  if (!outline || outline.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No outline available for this PDF.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <ul className="space-y-1">
        {outline.map((item, idx) => (
          <li key={idx}>
            <button
              onClick={() => item.dest && onPageNavigate?.(item.dest.page)}
              className="text-left w-full px-2 py-1 text-sm hover:bg-muted rounded transition-colors"
              style={{ paddingLeft: `${(item.level || 0) * 12 + 8}px` }}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

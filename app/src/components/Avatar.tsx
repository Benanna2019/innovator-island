/**
 * A guest's face: a colour from `hue` and their initials, drawn as an SVG. Nothing is fetched. It is decorative
 * (the name is always written next to it), so it is hidden from screen readers.
 */
export function Avatar({ hue, initials, size = 32 }: { hue: number; initials: string; size?: number }) {
  return (
    <svg className="avatar" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="19" fill={`hsl(${hue} 55% 82%)`} stroke={`hsl(${hue} 55% 28%)`} strokeWidth="2" />
      <text x="20" y="25.5" textAnchor="middle" fontSize={initials.length > 1 ? 15 : 18} fontWeight="700" fill={`hsl(${hue} 60% 20%)`}>
        {initials}
      </text>
    </svg>
  )
}

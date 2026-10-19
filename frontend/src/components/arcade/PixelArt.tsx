/** Original small-grid artwork. Integer coordinates retain crisp pixel silhouettes. */
export function PixelFlame({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 20" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#ED7946" d="M9 0h2v3h2v3h2v4h1v6h-2v2H3v-2H1v-3H0v-3h2V7h2v2h2V5h2V2h1z" />
    <path fill="#F3B75A" d="M8 8h2v3h2v5h-2v2H5v-2H4v-3h2v-3h2z" />
    <path fill="#FFE7A3" d="M8 13h2v4H7v-2h1z" />
  </svg>
}
export function PixelCampfire() {
  return <svg className="arcade-campfire" viewBox="0 0 32 36" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#658F68" opacity=".3" d="M0 33h32v2H0zM4 30h24v2H4z" />
    <path fill="#9A7955" d="M5 28h6v2h14v3h-6v-2H5zM21 27h6v3H15v2H6v-3h15z" />
    <g transform="translate(8 4)"><path fill="#ED7946" d="M9 0h2v3h2v3h2v4h1v6h-2v2H3v-2H1v-3H0v-3h2V7h2v2h2V5h2V2h1z" /><path fill="#F3B75A" d="M8 8h2v3h2v5h-2v2H5v-2H4v-3h2v-3h2z" /><path fill="#FFE7A3" d="M8 13h2v4H7v-2h1z" /></g>
    <path fill="#F3B75A" d="M7 1h1v2H7zM24 6h1v1h-1z" />
  </svg>
}
export function PixelVisitor() {
  return <svg className="arcade-visitor" viewBox="0 0 16 12" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" d="M5 0h6v1h2v2h2v5h-2v1h-2v2H9V9H7v2H5V9H3V8H1V3h2V1h2z" /><path fill="var(--bg-card)" d="M4 4h2v2H4zM10 4h2v2h-2zM6 7h4v1H6z" /></svg>
}
const icons: Record<string, string> = {
  '/dashboard': 'M1 1h5v5H1zM8 1h5v3H8zM1 8h5v5H1zM8 6h5v7H8z',
  '/transactions': 'M1 3h9V1l4 4-4 4V7H1zM13 11H4v2l-4-4 4-4v2h9z',
  '/wealth': 'M1 3h12v10H1zM3 1h8v2H3zM3 5v6h8V5zM8 7h3v2H8z',
  '/budgets': 'M4 2h6v1h2v2h2v4h-2v3h-2v-2H5v2H3V9H1V5h2V3h1zM5 4h5v1H5z',
  '/projections': 'M1 10h2V8h3V5h3V2h5v5h-2V5h-1v2H8v3H5v2H1z',
  '/financial-helper': 'M4 0h2v3h3v2H6v3H4V5H1V3h3zM10 7h2v2h2v2h-2v2h-2v-2H8V9h2z',
  '/settings': 'M5 0h4v2h3v3h2v4h-2v3H9v2H5v-2H2V9H0V5h2V2h3zM5 4v1H4v4h1v1h4V9h1V5H9V4z',
}
export function PixelNavIcon({ path }: { path: string }) {
  return <svg className="arcade-nav-icon" viewBox="0 0 14 14" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" fillRule="evenodd" d={icons[path] ?? icons['/dashboard']} /></svg>
}

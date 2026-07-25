// Monthly cash-flow Sankey: income sources → "monthly income" hub → spending
// categories, savings and leftover. Direct port of the Meridian prototype's
// SVG geometry (viewBox 900×360, 14px nodes, cubic-bezier ribbons at 34%
// opacity), with the fixed €-scale replaced by a dynamic one so any month fits.

export interface SankeyNode {
  name: string
  val: number
  color: string
}

interface Props {
  sources: SankeyNode[]
  targets: SankeyNode[]
  hubAmount: string
}

const VB_H = 360
const PAD_Y = 14
const NODE_W = 14
const COL0_X = 150
const HUB_X = 443
const COL2_X = 736
const SRC_GAP = 16
const TGT_GAP = 6

interface Placed extends SankeyNode {
  y: number
  h: number
}

function stack(items: SankeyNode[], gap: number, scale: number): Placed[] {
  const h = items.reduce((s, a) => s + a.val * scale, 0) + gap * (items.length - 1)
  let y = PAD_Y + (VB_H - 2 * PAD_Y - h) / 2
  return items.map(it => {
    const height = it.val * scale
    const node = { ...it, y, h: height }
    y += height + gap
    return node
  })
}

function ribbon(x0: number, y0t: number, y0b: number, x1: number, y1t: number, y1b: number): string {
  const mx = (x0 + x1) / 2
  return `M${x0},${y0t.toFixed(1)} C${mx},${y0t.toFixed(1)} ${mx},${y1t.toFixed(1)} ${x1},${y1t.toFixed(1)}` +
         ` L${x1},${y1b.toFixed(1)} C${mx},${y1b.toFixed(1)} ${mx},${y0b.toFixed(1)} ${x0},${y0b.toFixed(1)} Z`
}

// Nodes under 3% of the column's total collapse into a single "Other" node so
// small categories don't stack into an unreadable overlap at the node's edge.
function groupSmall(nodes: SankeyNode[]): SankeyNode[] {
  const total = nodes.reduce((s, n) => s + n.val, 0)
  if (total <= 0) return nodes
  const kept: SankeyNode[] = []
  let otherVal = 0
  for (const n of nodes) {
    if (n.val / total < 0.03) otherVal += n.val
    else kept.push(n)
  }
  if (otherVal > 0) kept.push({ name: 'Other', val: otherVal, color: 'var(--ink-ghost)' })
  return kept
}

export default function CashFlowSankey({ sources: rawSources, targets: rawTargets, hubAmount }: Props) {
  const sources = groupSmall(rawSources)
  const targets = groupSmall(rawTargets)
  const total = sources.reduce((s, a) => s + a.val, 0)
  if (total <= 0 || targets.length === 0) return null

  // Fit whichever column is taller (values + its gaps) into the drawable height
  const usable = VB_H - 2 * PAD_Y
  const scale = Math.min(
    (usable - SRC_GAP * (sources.length - 1)) / total,
    (usable - TGT_GAP * (targets.length - 1)) / total,
  )

  const srcNodes = stack(sources, SRC_GAP, scale)
  const tgtNodes = stack(targets, TGT_GAP, scale)
  const hubH = total * scale
  const hubY = PAD_Y + (VB_H - 2 * PAD_Y - hubH) / 2

  const links: { d: string; color: string }[] = []
  let hubCurL = hubY
  for (const s of srcNodes) {
    const t = s.val * scale
    links.push({ d: ribbon(COL0_X + NODE_W, s.y, s.y + s.h, HUB_X, hubCurL, hubCurL + t), color: s.color })
    hubCurL += t
  }
  let hubCurR = hubY
  for (const t of tgtNodes) {
    const th = t.val * scale
    links.push({ d: ribbon(HUB_X + NODE_W, hubCurR, hubCurR + th, COL2_X, t.y, t.y + t.h), color: t.color })
    hubCurR += th
  }

  return (
    <svg viewBox={`0 0 900 ${VB_H}`} width="100%" height="340" style={{ display: 'block', marginTop: 6 }}>
      {links.map((l, i) => (
        <path key={i} d={l.d} fill={l.color} fillOpacity={0.34} />
      ))}
      {srcNodes.map((n, i) => (
        <rect key={`s${i}`} x={COL0_X} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color} />
      ))}
      <rect x={HUB_X} y={hubY} width={NODE_W} height={hubH} rx={3} fill="var(--ink)" />
      {tgtNodes.map((n, i) => (
        <rect key={`t${i}`} x={COL2_X} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color} />
      ))}
      {srcNodes.map((n, i) => (
        <g key={`sl${i}`}>
          <text x={COL0_X - 10} y={n.y + n.h / 2 - 2} textAnchor="end" fontFamily="'Hanken Grotesk', sans-serif" fontSize="12.5" fontWeight="600" fill="var(--ink)">{n.name}</text>
          <text x={COL0_X - 10} y={n.y + n.h / 2 - 2} dy="14" textAnchor="end" fontFamily="'Hanken Grotesk', sans-serif" fontSize="11.5" fill="var(--ink-faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            €{Math.round(n.val).toLocaleString('en-US')}
          </text>
        </g>
      ))}
      {tgtNodes.map((n, i) => (
        <g key={`tl${i}`}>
          <text x={COL2_X + NODE_W + 10} y={n.y + n.h / 2 - 2} textAnchor="start" fontFamily="'Hanken Grotesk', sans-serif" fontSize="12.5" fontWeight="600" fill="var(--ink)">{n.name}</text>
          <text x={COL2_X + NODE_W + 10} y={n.y + n.h / 2 - 2} dy="14" textAnchor="start" fontFamily="'Hanken Grotesk', sans-serif" fontSize="11.5" fill="var(--ink-faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            €{Math.round(n.val).toLocaleString('en-US')}
          </text>
        </g>
      ))}
      <text x={HUB_X + NODE_W / 2} y={hubY - 16} textAnchor="middle" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10.5" letterSpacing="1.4" fill="var(--ink-ghost)" fontWeight="600">MONTHLY INCOME</text>
      <text x={HUB_X + NODE_W / 2} y={hubY - 3} textAnchor="middle" fontFamily="'Hanken Grotesk', sans-serif" fontSize="15" fontWeight="700" fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>{hubAmount}</text>
    </svg>
  )
}

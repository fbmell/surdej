import { useRef, useState } from 'react'
import { sci } from './format.js'

const W = 320
const PAD_L = 34
const PAD_R = 8
const TOP_H = 120
const GAP = 34
const BOT_H = 64
const AX = 18
const H = TOP_H + GAP + BOT_H + AX + 6

const LOG_MIN = 4
const LOG_MAX = 10

export default function Chart({ history, now }) {
  const ref = useRef(null)
  const [hover, setHover] = useState(null)
  const span = 48
  const t0 = now - span
  const pts = history.filter((p) => p.t >= t0)
  const x = (t) => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R)
  const yLog = (v) => {
    const l = Math.log10(Math.max(v, 10 ** LOG_MIN))
    return 8 + (1 - (l - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (TOP_H - 12)
  }
  const riseMax = Math.max(1.5, ...pts.map((p) => p.rise))
  const botY0 = TOP_H + GAP
  const yRise = (r) => botY0 + BOT_H - (r / riseMax) * (BOT_H - 4)

  const line = (key, fy) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${fy(p[key]).toFixed(1)}`).join('')
  const riseLine = line('rise', yRise)
  const riseArea =
    pts.length > 1
      ? `${riseLine}L${x(pts[pts.length - 1].t).toFixed(1)},${botY0 + BOT_H}L${x(pts[0].t).toFixed(1)},${botY0 + BOT_H}Z`
      : ''

  const onMove = (e) => {
    const svg = ref.current
    if (!svg || pts.length < 2) return
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const t = t0 + ((px - PAD_L) / (W - PAD_L - PAD_R)) * span
    let best = pts[0]
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
    setHover(best)
  }

  const last = pts[pts.length - 1]
  const hx = hover ? x(hover.t) : 0
  const ago = hover ? now - hover.t : 0

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="label">De sidste 48 timer</span>
        <span className="flex gap-3 text-[0.8rem] text-muted">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-3.5 rounded bg-yeast" /> Gær
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-3.5 rounded bg-lab" /> Mælkesyrebakterier
          </span>
        </span>
      </figcaption>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Graf over antal gærceller og bakterier pr. gram og dejens hævning de sidste 48 timer"
        >
          {/* Øverste panel: celler pr. gram, logaritmisk */}
          {[4, 6, 8, 10].map((e) => (
            <g key={e}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yLog(10 ** e)} y2={yLog(10 ** e)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD_L - 5} y={yLog(10 ** e)} dy="0.32em" textAnchor="end" fontSize="9" fill="var(--muted)" className="num">
                10
                <tspan dy="-4" fontSize="7">{e}</tspan>
              </text>
            </g>
          ))}
          {pts.length > 1 && (
            <>
              <path d={line('lab', yLog)} fill="none" stroke="var(--lab)" strokeWidth="2" strokeLinejoin="round" />
              <path d={line('yeast', yLog)} fill="none" stroke="var(--yeast)" strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(last.t)} cy={yLog(last.lab)} r="3.5" fill="var(--lab)" stroke="var(--wall)" strokeWidth="2" />
              <circle cx={x(last.t)} cy={yLog(last.yeast)} r="3.5" fill="var(--yeast)" stroke="var(--wall)" strokeWidth="2" />
            </>
          )}
          <text x={W - PAD_R} y={TOP_H + 6} fontSize="9" fill="var(--muted)" textAnchor="end">
            Celler pr. gram, logaritmisk skala
          </text>

          {/* Nederste panel: hævning */}
          <line x1={PAD_L} x2={W - PAD_R} y1={botY0 + BOT_H} y2={botY0 + BOT_H} stroke="var(--line)" />
          <line x1={PAD_L} x2={W - PAD_R} y1={yRise(1)} y2={yRise(1)} stroke="var(--line)" strokeDasharray="2 3" />
          <text x={PAD_L - 5} y={yRise(1)} dy="0.32em" textAnchor="end" fontSize="9" fill="var(--muted)" className="num">
            2×
          </text>
          <text x={PAD_L - 5} y={botY0 + BOT_H} dy="0.32em" textAnchor="end" fontSize="9" fill="var(--muted)" className="num">
            1×
          </text>
          {pts.length > 1 && (
            <>
              <path d={riseArea} fill="var(--band)" opacity="0.12" />
              <path d={riseLine} fill="none" stroke="var(--band)" strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(last.t)} cy={yRise(last.rise)} r="3.5" fill="var(--band)" stroke="var(--wall)" strokeWidth="2" />
            </>
          )}
          <text x={PAD_L} y={botY0 - 2} fontSize="9" fill="var(--muted)">
            Højde i forhold til udgangspunktet
          </text>

          {/* Tidsakse */}
          {[48, 36, 24, 12, 0].map((h) => (
            <text
              key={h}
              x={x(now - h)}
              y={H - 4}
              fontSize="9"
              fill="var(--muted)"
              textAnchor={h === 48 ? 'start' : h === 0 ? 'end' : 'middle'}
              className="num"
            >
              {h === 0 ? 'nu' : `−${h} t`}
            </text>
          ))}

          {hover && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={0} y2={botY0 + BOT_H} stroke="var(--ink)" strokeWidth="1" opacity="0.4" />
              <circle cx={hx} cy={yLog(hover.yeast)} r="3.5" fill="var(--yeast)" stroke="var(--wall)" strokeWidth="2" />
              <circle cx={hx} cy={yLog(hover.lab)} r="3.5" fill="var(--lab)" stroke="var(--wall)" strokeWidth="2" />
              <circle cx={hx} cy={yRise(hover.rise)} r="3.5" fill="var(--band)" stroke="var(--wall)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-shelf px-2.5 py-2 text-[0.78rem] leading-snug shadow-sm"
            style={{
              left: `${(hx / W) * 100}%`,
              transform: hx > W / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            }}
          >
            <div className="mb-1 text-muted">{ago < 0.1 ? 'Nu' : `${fmtAgo(ago)} siden`}</div>
            <Row color="var(--yeast)" label="Gær" value={sci(hover.yeast)} />
            <Row color="var(--lab)" label="Bakterier" value={sci(hover.lab)} />
            <Row color="var(--band)" label="Højde" value={`${(1 + hover.rise).toFixed(1).replace('.', ',')}×`} />
            <Row label="pH" value={hover.ph.toFixed(1).replace('.', ',')} />
          </div>
        )}
      </div>
    </figure>
  )
}

function Row({ color, label, value }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <i className="inline-block h-2 w-2 rounded-full" style={{ background: color || 'transparent' }} />
      <span className="text-muted">{label}</span>
      <span className="num ml-auto pl-3">{value}</span>
    </div>
  )
}

function fmtAgo(h) {
  if (h < 1) return `${Math.round(h * 60)} min`
  const t = Math.floor(h)
  const m = Math.round((h - t) * 60)
  return m ? `${t} t ${m} min` : `${t} t`
}

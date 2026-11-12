import { useEffect, useRef } from 'react'
import { JAR_ML, activity, volumeMl, pH } from './sim.js'

// Faste "tilfældige" tal, så hullerne i dejen ligger samme sted hver gang.
function seeded(n, seed) {
  let x = seed
  const r = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646
  return Array.from({ length: n }, () => [r(), r(), r(), r()])
}
const HOLES = seeded(160, 7)
const MOLD = seeded(40, 99)
const GRAINS = seeded(60, 31)

function readTokens(el) {
  const cs = getComputedStyle(el)
  const g = (n) => cs.getPropertyValue(n).trim()
  return {
    ink: g('--ink'),
    muted: g('--muted'),
    glass: g('--glass'),
    band: g('--band'),
    dough: g('--dough'),
    wall: g('--wall'),
    dark: cs.colorScheme.includes('dark'),
  }
}

function mix(hexA, hexB, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = p(hexA)
  const b = p(hexB)
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
}

export default function Jar({ simRef, fxRef, speed }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    let W = 0
    let H = 0
    let tokens = readTokens(wrap)
    let frame = 0
    let raf
    const shown = { dough: 0, hooch: 0, water: 0, flour: 0, band: 0, peak: 0 }
    let first = true
    const bubbles = []
    const pops = []
    let lastT = performance.now()
    let wobble = 0

    const resize = () => {
      const w = wrap.clientWidth
      const h = Math.round(w * 1.18)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.height = h + 'px'
      W = w
      H = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      const dt = Math.min(0.1, (now - lastT) / 1000)
      lastT = now
      frame++
      if (frame % 30 === 0) tokens = readTokens(wrap)
      const s = simRef.current
      if (!s || W === 0) return
      const T = tokens

      // Glassets geometri
      const jx0 = W * 0.17
      const jx1 = W * 0.83
      const jw = jx1 - jx0
      const top = H * 0.1
      const bottom = H * 0.95
      const rimH = H * 0.035
      const innerTop = top + rimH
      const radius = jw * 0.09
      const pad = 5
      const ix0 = jx0 + pad
      const ix1 = jx1 - pad
      const iBottom = bottom - pad
      const iH = iBottom - innerTop
      const mlToY = (ml) => iBottom - (ml / JAR_ML) * iH

      // Mål, der glider blødt mod de rigtige værdier
      const doughMl = (s.flour + s.water) * 0.85 * (1 + s.gas)
      const target = {
        dough: doughMl,
        hooch: s.hooch,
        water: s.looseWater,
        flour: s.looseFlour * 1.6,
        band: s.bandMl,
        peak: s.peakGas > s.gas + 0.03 ? (s.flour + s.water) * 0.85 * (1 + s.peakGas) : 0,
      }
      const k = first || reduced ? 1 : 1 - Math.pow(0.002, dt)
      for (const key in shown) shown[key] += (target[key] - shown[key]) * k
      first = false

      ctx.clearRect(0, 0, W, H)

      // Skygge på hylden
      ctx.fillStyle = T.dark ? 'rgba(0,0,0,0.35)' : 'rgba(29,37,40,0.08)'
      ctx.beginPath()
      ctx.ellipse(W / 2, bottom + 4, jw * 0.56, 7, 0, 0, Math.PI * 2)
      ctx.fill()

      // Indersiden som klip-sti
      const innerPath = new Path2D()
      innerPath.moveTo(ix0, innerTop)
      innerPath.lineTo(ix0, iBottom - radius)
      innerPath.quadraticCurveTo(ix0, iBottom, ix0 + radius, iBottom)
      innerPath.lineTo(ix1 - radius, iBottom)
      innerPath.quadraticCurveTo(ix1, iBottom, ix1, iBottom - radius)
      innerPath.lineTo(ix1, innerTop)
      innerPath.closePath()

      // Glas-tone
      ctx.fillStyle = T.dark ? 'rgba(160,190,200,0.05)' : 'rgba(255,255,255,0.35)'
      ctx.fill(innerPath)

      ctx.save()
      ctx.clip(innerPath)

      const sour = Math.max(0, Math.min(1, (5.5 - pH(s)) / 2))
      let doughColor = mix(T.dough.length === 7 ? T.dough : '#e7d7b7', '#c9b48e', sour * 0.5)
      if (s.dead) doughColor = mix(T.dough.length === 7 ? T.dough : '#e7d7b7', '#8b8577', 0.6)

      // Spor på glasset, hvor dejen nåede op til
      if (shown.peak > shown.dough + 4) {
        const yTop = mlToY(shown.peak)
        const yBot = mlToY(shown.dough)
        ctx.globalAlpha = 0.35
        ctx.fillStyle = doughColor
        for (const [x0, w] of [
          [ix0, 7],
          [ix1 - 7, 7],
        ]) {
          ctx.beginPath()
          ctx.moveTo(x0, yBot)
          ctx.lineTo(x0, yTop)
          for (let i = 0; i <= 6; i++) {
            const yy = yTop + ((yBot - yTop) * i) / 6
            ctx.lineTo(x0 + w * (0.5 + 0.5 * Math.sin(i * 1.7)), yy)
          }
          ctx.closePath()
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // Dejen
      const act = activity(s)
      const rising = act > 0.04 && s.gas >= s.peakGas * 0.97
      const doughTop = mlToY(shown.dough)
      wobble *= Math.pow(0.05, dt)
      const fx = fxRef.current
      const domeH = (rising ? Math.min(14, 4 + s.gas * 8) : s.gas > 0.1 ? -3 : 0) +
        Math.sin(now / 90) * wobble * 6
      const doughPath = new Path2D()
      doughPath.moveTo(ix0 - 2, iBottom + 2)
      doughPath.lineTo(ix0 - 2, doughTop + Math.max(0, domeH) * 0.25)
      doughPath.bezierCurveTo(
        ix0 + jw * 0.25,
        doughTop - domeH,
        ix1 - jw * 0.25,
        doughTop - domeH,
        ix1 + 2,
        doughTop + Math.max(0, domeH) * 0.25,
      )
      doughPath.lineTo(ix1 + 2, iBottom + 2)
      doughPath.closePath()
      ctx.fillStyle = doughColor
      ctx.fill(doughPath)

      // Huller i dejen
      ctx.save()
      ctx.clip(doughPath)
      const holeCount = Math.floor(HOLES.length * Math.min(1, 0.12 + s.gas * 0.45))
      const doughH = iBottom - doughTop
      for (let i = 0; i < holeCount; i++) {
        const [u, v, r1, r2] = HOLES[i]
        const x = ix0 + 4 + u * (ix1 - ix0 - 8)
        const y = iBottom - 3 - v * Math.max(0, doughH - 6)
        const r = (1 + r1 * 3.5) * (0.6 + Math.min(1.6, s.gas) * 0.8) * (W / 360)
        ctx.fillStyle = T.dark ? 'rgba(60,45,25,0.28)' : 'rgba(90,70,40,0.2)'
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * (0.75 + r2 * 0.3), 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // Bobler, der stiger op
      if (!reduced) {
        const sp = Math.min(60, Math.max(1, speedRef.current / 30))
        const rate = act * 40 * sp
        if (Math.random() < rate * dt && bubbles.length < 60) {
          bubbles.push({
            x: ix0 + 8 + Math.random() * (ix1 - ix0 - 16),
            y: iBottom - Math.random() * doughH * 0.8,
            r: (1.5 + Math.random() * 2.5) * (W / 360),
            v: 6 + Math.random() * 10,
          })
        }
        ctx.strokeStyle = T.dark ? 'rgba(255,255,255,0.4)' : 'rgba(90,70,40,0.35)'
        ctx.lineWidth = 1
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i]
          b.y -= b.v * dt * (1 + sp * 0.05)
          b.r += dt * 0.6
          if (b.y < doughTop + 2) {
            pops.push({ x: b.x, y: doughTop - domeH * 0.6, r: b.r, t: 0 })
            bubbles.splice(i, 1)
            continue
          }
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Hooch (væske på toppen)
      let y = doughTop - Math.max(0, domeH) * 0.4
      if (shown.hooch > 0.3) {
        const h = (shown.hooch / JAR_ML) * iH
        ctx.fillStyle = T.dark ? 'rgba(150,135,105,0.55)' : 'rgba(120,105,80,0.45)'
        ctx.fillRect(ix0, y - h, ix1 - ix0, h + 2)
        y -= h
      }
      // Løst vand
      if (shown.water > 0.3) {
        const h = (shown.water / JAR_ML) * iH
        ctx.fillStyle = T.dark ? 'rgba(120,180,210,0.35)' : 'rgba(120,175,205,0.4)'
        ctx.fillRect(ix0, y - h, ix1 - ix0, h + 2)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(ix0, y - h, ix1 - ix0, 1.5)
        y -= h
      }
      // Løst mel som en lille bunke
      if (shown.flour > 0.3) {
        const h = (shown.flour / JAR_ML) * iH
        ctx.fillStyle = T.dark ? '#eeeae2' : '#fbf9f4'
        ctx.beginPath()
        ctx.moveTo(ix0, y + 2)
        ctx.lineTo(ix0, y - h * 0.5)
        ctx.quadraticCurveTo(W / 2, y - h * 1.6, ix1, y - h * 0.5)
        ctx.lineTo(ix1, y + 2)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgba(150,140,120,0.35)'
        for (const [u, v] of GRAINS) {
          const gx = ix0 + u * (ix1 - ix0)
          const peak = y - h * 0.5 - h * 0.55 * Math.sin(Math.PI * u)
          const gy = peak + v * (y - peak)
          ctx.fillRect(gx, gy, 1.2, 1.2)
        }
        y -= h
      }

      // Mug på overfladen
      if (s.mold > 0.02) {
        const n = Math.ceil(MOLD.length * s.mold)
        for (let i = 0; i < n; i++) {
          const [u, v, r1] = MOLD[i]
          const mx = ix0 + 6 + u * (ix1 - ix0 - 12)
          const my = doughTop - domeH * (1 - Math.pow(2 * u - 1, 2)) * 0.9 + v * 6
          const r = (3 + r1 * 7) * (W / 360) * (0.6 + s.mold)
          ctx.fillStyle = i % 3 === 0 ? 'rgba(120,150,90,0.85)' : 'rgba(225,232,215,0.9)'
          ctx.beginPath()
          ctx.arc(mx, my, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(70,95,60,0.6)'
          ctx.beginPath()
          ctx.arc(mx, my, r * 0.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Bobler der springer
      ctx.strokeStyle = T.dark ? 'rgba(255,255,255,0.5)' : 'rgba(90,70,40,0.45)'
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]
        p.t += dt
        if (p.t > 0.35) {
          pops.splice(i, 1)
          continue
        }
        ctx.globalAlpha = 1 - p.t / 0.35
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * (1 + p.t * 4), Math.PI, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Ske når der røres
      if (fx.stir > 0) {
        fx.stir -= dt
        wobble = 1
        const a = now / 140
        const sx = W / 2 + Math.cos(a) * jw * 0.22
        const sy = doughTop + Math.sin(a) * 6 + 18
        ctx.strokeStyle = T.dark ? '#c9d2d4' : '#7d8a8e'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(W / 2 + Math.cos(a) * jw * 0.08, top - H * 0.08)
        ctx.stroke()
        ctx.fillStyle = ctx.strokeStyle
        ctx.beginPath()
        ctx.ellipse(sx, sy, 9, 14, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore() // slut på klip

      // Glasset
      ctx.strokeStyle = T.glass
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(jx0, top + rimH)
      ctx.lineTo(jx0, bottom - radius)
      ctx.quadraticCurveTo(jx0, bottom, jx0 + radius, bottom)
      ctx.lineTo(jx1 - radius, bottom)
      ctx.quadraticCurveTo(jx1, bottom, jx1, bottom - radius)
      ctx.lineTo(jx1, top + rimH)
      ctx.stroke()
      // Kant
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.roundRect(jx0 - 5, top, jw + 10, rimH, 4)
      ctx.stroke()
      // Lysrefleks
      ctx.strokeStyle = T.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(jx0 + 16, innerTop + 24)
      ctx.lineTo(jx0 + 16, iBottom - 40)
      ctx.stroke()

      // Skala i ml
      ctx.font = `500 ${Math.max(10, W / 38)}px ${getComputedStyle(wrap).getPropertyValue('--font-mono')}`
      ctx.fillStyle = T.muted
      ctx.strokeStyle = T.muted
      ctx.lineWidth = 1.2
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let ml = 50; ml <= JAR_ML; ml += 50) {
        const yy = mlToY(ml)
        const major = ml % 100 === 0
        ctx.globalAlpha = major ? 0.9 : 0.5
        ctx.beginPath()
        ctx.moveTo(jx1 - (major ? 18 : 10), yy)
        ctx.lineTo(jx1 - 3, yy)
        ctx.stroke()
        if (major) ctx.fillText(ml === JAR_ML ? `${ml} ml` : String(ml), jx1 - 22, yy)
      }
      ctx.globalAlpha = 1

      // Elastikken
      if (shown.band > 1) {
        const by = mlToY(shown.band)
        ctx.strokeStyle = T.band
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(jx0 - 3, by)
        ctx.quadraticCurveTo(W / 2, by + 7, jx1 + 3, by)
        ctx.stroke()
      }

      // Overløb
      if (volumeMl(s) > JAR_ML * 0.985 && !s.dead) {
        ctx.fillStyle = doughColor
        ctx.beginPath()
        ctx.ellipse(W / 2, top + 2, jw * 0.42, 14, 0, Math.PI, Math.PI * 2)
        ctx.fill()
        const dripLen = 30 + Math.sin(now / 600) * 8
        ctx.beginPath()
        ctx.moveTo(jx1 - 6, top + 2)
        ctx.quadraticCurveTo(jx1 + 14, top + 4, jx1 + 9, top + dripLen)
        ctx.arc(jx1 + 5, top + dripLen, 5, 0, Math.PI)
        ctx.lineTo(jx1 - 2, top + 8)
        ctx.closePath()
        ctx.fill()
      }

      // Mel der drysses, vand der hældes
      if (fx.flour > 0) {
        fx.flour -= dt
        ctx.fillStyle = T.dark ? '#f1ede5' : '#d6d0c2'
        for (let i = 0; i < 70; i++) {
          const px = W / 2 + (Math.random() - 0.5) * jw * 0.35
          const py = Math.random() * (y - 4)
          ctx.fillRect(px, py, 2, 2)
        }
      }
      if (fx.water > 0) {
        fx.water -= dt
        ctx.strokeStyle = 'rgba(110,170,205,0.75)'
        ctx.lineWidth = 6 + Math.sin(now / 40) * 1.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(W / 2 + 10, 0)
        ctx.quadraticCurveTo(W / 2 + 4, y * 0.5, W / 2, y - 2)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [simRef, fxRef])

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="block w-full"
        role="img"
        aria-label="Et glas med surdej. Højden, boblerne og væsken på toppen viser, hvordan det går."
      />
    </div>
  )
}

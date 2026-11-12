const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

// 210000000 -> "2,1 × 10⁸"
export function sci(n) {
  if (!(n > 0)) return '0'
  const e = Math.floor(Math.log10(n))
  const m = n / 10 ** e
  const exp = String(e)
    .split('')
    .map((c) => SUP[c])
    .join('')
  return `${m.toFixed(1).replace('.', ',')} × 10${exp}`
}

export function dur(h) {
  if (h < 1 / 60) return 'under et minut'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) {
    const t = Math.floor(h)
    const m = Math.round((h - t) * 60)
    return m && t < 10 ? `${t} t ${m} min` : `${t} t`
  }
  const d = Math.floor(h / 24)
  const t = Math.round(h - d * 24)
  return t ? `${d} d ${t} t` : `${d} d`
}

export const dec = (x, n = 1) => x.toFixed(n).replace('.', ',')

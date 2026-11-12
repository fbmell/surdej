// Simulering af en surdej. Tid måles i timer, masse i gram.
// Gær (y) og mælkesyrebakterier (l) er angivet som andel af hvad dejen
// maksimalt kan bære (0–1). Omregning til celler pr. gram sker i cellsPerGram().

export const JAR_ML = 400
export const Y_MAX = 2e8 // gærceller pr. gram ved fuld bestand
export const L_MAX = 3e9 // bakterier pr. gram ved fuld bestand

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// Vækstrate (pr. time) som funktion af temperatur. Nul uden for [tmin, tmax].
function tempRate(T, tmin, topt, tmax, rmax) {
  if (T <= tmin || T >= tmax) return 0
  // Kardinal-temperaturmodel (Rosso), giver en realistisk skæv kurve.
  const num = (T - tmax) * (T - tmin) ** 2
  const den =
    (topt - tmin) *
    ((topt - tmin) * (T - topt) - (topt - tmax) * (topt + tmin - 2 * T))
  return rmax * clamp(num / den, 0, 1)
}

export const yeastRate = (T) => tempRate(T, 2, 27, 40, 0.55)
export const labRate = (T) => tempRate(T, 6, 32, 45, 0.75)

export function newStarter(now = Date.now()) {
  return {
    name: 'Bobbel',
    born: now,
    simTime: 0, // timer siden start
    lastReal: now,
    speed: 60,
    temp: 23,
    flour: 50, // gram mel i den blandede dej
    water: 50,
    food: 14, // gram omsættelige kulhydrater
    y: 0.12,
    l: 0.15,
    acid: 0.8, // syremængde pr. 100 g (vilkårlig enhed)
    gas: 0.15, // ekstra volumen fra fanget CO2 (andel)
    hooch: 0, // gram væske på toppen
    looseFlour: 0, // ikke-indrørt mel
    looseWater: 0,
    mold: 0, // 0–1 hvor meget af overfladen der er mug på
    moldRisk: 0,
    starve: 0, // timer uden mad
    sinceStir: 0,
    lastFed: 0, // simTime for sidste omrøring med nyt mel
    pending: { base: 0, flour: 0, water: 0 }, // til at beregne fodringsforhold
    lastRatio: null,
    peakGas: 0,
    hoursToPeak: null,
    bandMl: 0,
    history: [],
    feeds: 0,
    overflows: 0,
    dead: false,
    events: [],
  }
}

export const mixedMass = (s) => s.flour + s.water + s.hooch
export const hydration = (s) => (s.flour > 0 ? s.water / s.flour : 1)
export const pH = (s) => clamp(6.2 - 1.15 * Math.log(1 + s.acid), 3.3, 6.2)

export function volumeMl(s) {
  const base = (s.flour + s.water) * 0.85
  return base * (1 + s.gas) + s.hooch + s.looseWater + s.looseFlour * 1.6
}

export function cellsPerGram(s) {
  return { yeast: s.y * Y_MAX, lab: s.l * L_MAX }
}

function log(s, text) {
  s.events = [{ t: s.simTime, text }, ...s.events].slice(0, 30)
}

// Ét tidsskridt på dt timer.
export function step(s, dt) {
  if (s.dead) {
    s.simTime += dt
    return
  }
  const T = s.temp
  const m = s.flour + s.water
  if (m < 0.5) {
    s.simTime += dt
    return
  }
  const h = hydration(s)
  const p = pH(s)
  const f = s.food / m // mad pr. gram dej
  const sat = f / (f + 0.03) // hvor mæt kulturen er (Monod)

  // Vandig dej gærer hurtigere, stiv dej langsommere.
  const wet = clamp(0.75 + 0.35 * h, 0.8, 1.25)
  // Syre bremser gæren lidt og bakterierne først ved meget lav pH.
  const acidY = clamp((p - 3.1) / 1.1, 0.3, 1)
  const acidL = clamp((p - 3.35) / 0.5, 0, 1)

  const rY = yeastRate(T) * wet * acidY
  const rL = labRate(T) * wet * acidL

  const actY = rY * s.y * sat // aktivitet: hvor meget der omsættes
  const actL = rL * s.l * sat

  const dieY = 0.012 * (1 - sat) + (T > 40 ? 0.4 : 0)
  const dieL = 0.006 * (1 - sat) + (T > 46 ? 0.4 : 0)

  s.y += (actY * (1 - s.y) - dieY * s.y) * dt
  s.l += (actL * (1 - s.l) - dieL * s.l) * dt
  s.y = clamp(s.y, 1e-6, 1)
  s.l = clamp(s.l, 1e-6, 1)

  // Mad forbruges proportionalt med aktivitet og dejens masse.
  const use = (0.06 * actY + 0.04 * actL + 0.002 * (s.y + s.l) * (T / 25)) * m
  s.food = Math.max(0, s.food - use * dt)
  // Mel nedbrydes langsomt til ny mad af enzymer (giver lidt næring igen).
  s.food += 0.0006 * s.flour * dt * clamp(T / 25, 0, 1.4) * (s.food / m < 0.05 ? 1 : 0)

  // Syre fra bakterierne.
  s.acid += 5 * actL * dt

  // Gas: produceres af gæren, holdes af glutenet. Våd eller meget sur dej
  // holder dårligere på gassen.
  const hold = clamp(1.25 - 0.55 * h, 0.35, 1) * clamp((p - 3.2) / 1.2, 0.3, 1)
  const maxGas = 2.4 * hold
  s.gas += (4.5 * actY * hold * (1 - s.gas / maxGas) - (0.05 + 0.25 * (1 - hold)) * s.gas) * dt
  s.gas = clamp(s.gas, 0, 3)

  if (s.gas > s.peakGas) {
    s.peakGas = s.gas
    s.hoursToPeak = s.simTime - s.lastFed
  }

  // Sult: væske (hooch) skiller ud på toppen.
  if (sat < 0.25) {
    s.starve += dt
    if (s.starve > 6 && h > 0.6) {
      const target = 0.12 * m * clamp((s.starve - 6) / 30, 0, 1)
      const drip = Math.min(target - s.hooch, 0.4 * dt)
      if (drip > 0) {
        s.hooch += drip
        s.water -= drip
      }
    }
  } else {
    s.starve = 0
  }

  // Mug: trives når dejen ikke er sur nok, og især på tørt mel der ligger øverst.
  const risk =
    (p > 4.6 ? (p - 4.6) * 0.05 : 0) * clamp(T / 22, 0.2, 1.5) +
    (s.looseFlour > 0 ? 0.03 : 0) +
    (s.starve > 120 ? 0.004 : 0)
  s.moldRisk = clamp(s.moldRisk + (risk - 0.01) * dt, 0, 3)
  if (s.moldRisk > 1) s.mold = clamp(s.mold + 0.01 * dt * s.moldRisk, 0, 1)

  if (s.y < 0.002 && s.l < 0.002) {
    s.dead = true
    log(s, 'Kulturen er død. Der er ikke mere liv i glasset.')
  }
  if (s.mold >= 1 && !s.dead) {
    s.dead = true
    log(s, 'Muggen har overtaget hele glasset.')
  }

  // Løber over?
  const vol = volumeMl(s)
  if (vol > JAR_ML) {
    const excess = vol - JAR_ML
    const frac = excess / vol
    removeFraction(s, frac)
    if (!s._spilling) {
      s.overflows += 1
      log(s, 'Surdejen løb ud over kanten af glasset!')
    }
    s._spilling = true
  } else if (vol < JAR_ML * 0.97) {
    s._spilling = false
  }

  s.sinceStir += dt
  s.simTime += dt
}

function removeFraction(s, frac) {
  const k = 1 - frac
  s.flour *= k
  s.water *= k
  s.food *= k
  s.hooch *= k
}

export function advance(s, hours) {
  let left = hours
  while (left > 0) {
    const dt = Math.min(left, 1 / 30) // to minutter
    step(s, dt)
    left -= dt
  }
}

// --- Handlinger ---------------------------------------------------------

export function discard(s, grams) {
  if (s.dead) return
  const m = s.flour + s.water + s.hooch
  if (m < 1) return
  const take = Math.min(grams, m - 5)
  if (take <= 0) {
    log(s, 'Der skal være lidt tilbage at fodre videre på.')
    return
  }
  removeFraction(s, take / m)
  // Kasserer man, lægger det løse mel og vand sig ovenpå og ryger med først.
  log(s, `Kasserede ${Math.round(take)} g gammel surdej.`)
}

export function addFlour(s, grams) {
  if (s.dead) return
  s.looseFlour += grams
  s.pending.flour += grams
  if (!s.pending.base) s.pending.base = s.flour + s.water + s.hooch
}

export function addWater(s, grams) {
  if (s.dead) return
  s.looseWater += grams
  s.pending.water += grams
  if (!s.pending.base) s.pending.base = s.flour + s.water + s.hooch
}

export function stir(s) {
  if (s.dead) return
  const before = s.flour + s.water
  const hadNew = s.looseFlour > 0 || s.looseWater > 0
  // Hooch røres tilbage i dejen.
  s.water += s.hooch + s.looseWater
  s.hooch = 0
  s.flour += s.looseFlour
  s.food += s.looseFlour * 0.32
  const after = s.flour + s.water
  // Fortynding af bestandene og syren.
  if (after > 0 && before > 0) {
    const d = before / after
    s.y *= d
    s.l *= d
    s.acid *= d
  }
  s.looseFlour = 0
  s.looseWater = 0
  // Omrøring slår luften ud.
  s.gas *= 0.25
  s.sinceStir = 0
  s.bandMl = volumeMl(s)
  if (s.mold > 0) s.mold = Math.max(0, s.mold - 0.15)

  if (hadNew && s.pending.flour > 0) {
    const b = s.pending.base || 1
    s.lastRatio = {
      base: s.pending.base,
      flour: s.pending.flour,
      water: s.pending.water,
      text: `1:${fmtR(s.pending.flour / b)}:${fmtR(s.pending.water / b)}`,
    }
    s.feeds += 1
    s.lastFed = s.simTime
    s.peakGas = s.gas
    s.hoursToPeak = null
    s.starve = 0
    log(
      s,
      `Fodret ${s.lastRatio.text} (${Math.round(b)} g surdej, ${Math.round(
        s.pending.flour,
      )} g mel, ${Math.round(s.pending.water)} g vand).`,
    )
  } else if (hadNew) {
    log(s, 'Rørte vandet i. Uden mel får kulturen ingen ny mad.')
  } else {
    log(s, 'Rørte rundt. Luften blev slået ud af dejen.')
  }
  s.pending = { base: 0, flour: 0, water: 0 }
}

function fmtR(x) {
  if (x >= 10) return Math.round(x).toString()
  return (Math.round(x * 10) / 10).toString().replace('.', ',')
}

// --- Tilstand som tekst ---------------------------------------------------

export function mood(s) {
  if (s.dead) return { key: 'dead', title: 'Død', text: 'Der er ikke mere liv i glasset. Start en ny surdej.' }
  const m = s.flour + s.water
  const f = m > 0 ? s.food / m : 0
  const p = pH(s)
  if (s.mold > 0.05)
    return { key: 'mold', title: 'Muggen', text: 'Der vokser mug på overfladen. Kassér det meste og fodr med frisk mel, eller rør rundt for at skrabe lidt af.' }
  if (s.looseFlour > 0 && s.sinceStir > 0.2)
    return { key: 'unmixed', title: 'Uomrørt', text: 'Melet ligger tørt ovenpå. Rør rundt, så kulturen kan få fat i det.' }
  if (s.temp < 8) return { key: 'cold', title: 'I dvale', text: 'Det er koldt. Gær og bakterier sover næsten, så den kan klare sig længe uden mad.' }
  if (s.temp > 38) return { key: 'hot', title: 'Alt for varm', text: 'Over 38 °C begynder gæren at tage skade. Skru ned for varmen.' }
  if (s.hooch > 3) return { key: 'hooch', title: 'Sulten', text: 'Der står grå væske på toppen. Det er tegn på, at den har været sulten længe.' }
  if (f < 0.02 && s.gas < s.peakGas * 0.7)
    return { key: 'hungry', title: 'Sulten', text: 'Maden er brugt op, og dejen er faldet sammen. Tid til at kassere og fodre.' }
  if (s.gas >= s.peakGas * 0.97 && s.gas > 0.6)
    return { key: 'peak', title: 'Toppet', text: 'Den er på sit højeste lige nu. Her ville den være klar til at bage med.' }
  if (s.gas > 0.25 && f > 0.03) return { key: 'rising', title: 'Hæver', text: 'Gæren arbejder, og dejen vokser.' }
  if (p < 3.7) return { key: 'sour', title: 'Meget sur', text: 'Syren bremser gæren. Et større foderforhold, fx 1:5:5, fortynder syren.' }
  return { key: 'calm', title: 'Rolig', text: 'Kulturen er i gang med at komme op i fart.' }
}

// Gærens aktivitet lige nu (0–ca. 0,6), bruges til bobler i glasset.
export function activity(s) {
  if (s.dead) return 0
  const m = s.flour + s.water
  if (m < 0.5) return 0
  const f = s.food / m
  const sat = f / (f + 0.03)
  return yeastRate(s.temp) * s.y * sat
}

const SAMPLE = 1 / 6 // ét målepunkt pr. 10 minutter simuleret tid
const KEEP = 48 // timer i grafen

export function sample(s) {
  const c = cellsPerGram(s)
  s.history.push({
    t: s.simTime,
    yeast: c.yeast,
    lab: c.lab,
    rise: s.gas,
    ph: pH(s),
  })
  const cut = s.simTime - KEEP - 1
  while (s.history.length && s.history[0].t < cut) s.history.shift()
}

// Kør tiden frem og gem målepunkter undervejs.
export function run(s, hours) {
  let left = hours
  while (left > 1e-9) {
    const last = s.history.length ? s.history[s.history.length - 1].t : -Infinity
    const toNext = Math.max(1e-6, last + SAMPLE - s.simTime)
    const dt = Math.min(left, toNext)
    advance(s, dt)
    left -= dt
    if (s.simTime >= last + SAMPLE - 1e-9) sample(s)
  }
}

// En ny surdej, der lige er blevet fodret for et par timer siden,
// så der er noget at se fra start.
export function freshStarter(now = Date.now()) {
  const s = newStarter(now)
  s.y = 0.5
  s.l = 0.6
  s.acid = 6
  s.food = 0
  s.gas = 0
  run(s, 6)
  for (const wait of [13, 17]) {
    discard(s, s.flour + s.water + s.hooch - 25)
    addFlour(s, 50)
    addWater(s, 50)
    stir(s)
    run(s, wait)
  }
  discard(s, s.flour + s.water + s.hooch - 25)
  addFlour(s, 50)
  addWater(s, 50)
  stir(s)
  run(s, 2.5)
  s.events = s.events.filter((e) => !e.text.startsWith('Kasserede'))
  return s
}

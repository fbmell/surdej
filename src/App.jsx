import { useEffect, useRef, useState } from 'react'
import Jar from './Jar.jsx'
import Chart from './Chart.jsx'
import { sci, dur, dec } from './format.js'
import {
  freshStarter,
  run,
  discard,
  addFlour,
  addWater,
  stir,
  mood,
  pH,
  hydration,
  cellsPerGram,
  volumeMl,
  JAR_ML,
} from './sim.js'

const KEY = 'surdej-v1'
const MAX_AWAY_H = 24 * 60

const SPEEDS = [
  { v: 1, label: 'Realtid', title: 'Tiden går som i virkeligheden' },
  { v: 60, label: '1 min/s', title: 'Ét minut pr. sekund' },
  { v: 600, label: '10 min/s', title: 'Ti minutter pr. sekund' },
  { v: 3600, label: '1 t/s', title: 'Én time pr. sekund' },
]
const AMOUNTS = [10, 25, 50, 100]
const PLACES = [
  { t: 5, label: 'Køleskab' },
  { t: 14, label: 'Kælder' },
  { t: 21, label: 'Køkken' },
  { t: 27, label: 'Lun krog' },
  { t: 32, label: 'Ovn med lys' },
]

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && typeof s.simTime === 'number') return s
    }
  } catch {
    /* ingen adgang til lager */
  }
  return null
}

function save(s) {
  try {
    s.lastReal = Date.now()
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignorér */
  }
}

const MOOD_TONE = {
  peak: 'good',
  rising: 'good',
  calm: 'neutral',
  cold: 'neutral',
  hungry: 'warn',
  hooch: 'warn',
  unmixed: 'warn',
  sour: 'warn',
  hot: 'bad',
  mold: 'bad',
  dead: 'bad',
}

export default function App() {
  const simRef = useRef(null)
  const fxRef = useRef({ flour: 0, water: 0, stir: 0 })
  const [away, setAway] = useState(null)
  const [, setTick] = useState(0)
  const [amount, setAmount] = useState(25)
  const [confirmNew, setConfirmNew] = useState(false)

  if (!simRef.current) {
    const saved = load()
    if (saved) {
      const gapH = Math.min(MAX_AWAY_H, Math.max(0, (Date.now() - saved.lastReal) / 3.6e6))
      if (gapH > 0.05) {
        const before = saved.events.length ? saved.events[0].t : -1
        run(saved, gapH)
        const news = saved.events.filter((e) => e.t > before)
        simRef.current = saved
        // Gemmes som startværdi; vises i et banner.
        simRef.current._away = { hours: gapH, news, mood: mood(saved) }
      } else simRef.current = saved
    } else {
      simRef.current = freshStarter()
      simRef.current._first = true
    }
    simRef.current.lastReal = Date.now()
  }

  useEffect(() => {
    const s = simRef.current
    if (s._away) {
      setAway(s._away)
      delete s._away
    }
    let raf
    let lastSave = 0
    let lastRender = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const s = simRef.current
      const real = Date.now()
      const gap = (real - s.lastReal) / 1000
      s.lastReal = real
      // Lange pauser (skjult fane) tæller i realtid, ellers i valgt tempo.
      const hours = gap > 2 ? Math.min(MAX_AWAY_H, gap / 3600) : (gap * s.speed) / 3600
      if (hours > 0) run(s, hours)
      if (now - lastRender > 120) {
        lastRender = now
        setTick((t) => t + 1)
      }
      if (now - lastSave > 2000) {
        lastSave = now
        save(s)
      }
    }
    raf = requestAnimationFrame(loop)
    const onHide = () => save(simRef.current)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  const s = simRef.current
  const md = mood(s)
  const tone = MOOD_TONE[md.key] || 'neutral'
  const cells = cellsPerGram(s)
  const mass = s.flour + s.water + s.hooch
  const vol = volumeMl(s)
  const pend = s.pending
  const pendBase = pend.base || mass
  const sinceFed = s.feeds ? s.simTime - s.lastFed : null

  const act = (fn) => () => {
    fn(simRef.current)
    save(simRef.current)
    setTick((t) => t + 1)
  }
  const doFlour = act((s) => {
    addFlour(s, amount)
    fxRef.current.flour = 0.9
  })
  const doWater = act((s) => {
    addWater(s, amount)
    fxRef.current.water = 0.9
  })
  const doStir = act((s) => {
    stir(s)
    fxRef.current.stir = 1.1
  })
  const doDiscard = act((s) => discard(s, amount))
  const setTemp = (t) => {
    simRef.current.temp = t
    setTick((x) => x + 1)
  }
  const setSpeed = (v) => {
    simRef.current.speed = v
    save(simRef.current)
    setTick((x) => x + 1)
  }
  const restart = () => {
    const name = simRef.current.name
    const speed = simRef.current.speed
    const n = freshStarter()
    n.name = name
    n.speed = speed
    simRef.current = n
    save(n)
    setConfirmNew(false)
    setAway(null)
    setTick((x) => x + 1)
  }

  const toneClass = {
    good: 'bg-good text-wall',
    warn: 'bg-warn text-wall',
    bad: 'bg-bad text-wall',
    neutral: 'bg-ink text-wall',
  }[tone]

  return (
    <main
      className="mx-auto flex min-h-full max-w-[1180px] flex-col gap-8 py-6 md:py-10"
      style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
      }}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label">Din surdej hedder</span>
          <input
            id="starter-name"
            aria-label="Surdejens navn"
            value={s.name}
            maxLength={24}
            onChange={(e) => {
              simRef.current.name = e.target.value
              setTick((x) => x + 1)
            }}
            onBlur={() => save(simRef.current)}
            className="w-full min-w-0 max-w-[14ch] rounded-sm bg-transparent font-display text-[clamp(2.4rem,7vw,4.2rem)] leading-none font-extrabold tracking-tight text-ink outline-none hover:bg-shelf"
            style={{ fontVariationSettings: "'opsz' 96" }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.85rem] text-muted">
          <span className="num">{dur(s.simTime)} gammel</span>
          <span className="num">fodret {s.feeds} gange</span>
          {s.overflows > 0 && <span className="num">løbet over {s.overflows} gange</span>}
          {confirmNew ? (
            <span className="flex items-center gap-2">
              <span className="text-ink">Smid {s.name} ud og start forfra?</span>
              <button onClick={restart} className="rounded-full bg-bad px-3 py-1 font-bold text-wall">
                Ja, start forfra
              </button>
              <button onClick={() => setConfirmNew(false)} className="rounded-full px-3 py-1 text-ink underline">
                Fortryd
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmNew(true)}
              className="rounded-full border border-line px-3 py-1 text-ink hover:bg-shelf"
            >
              Ny surdej
            </button>
          )}
        </div>
      </header>

      {away && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-shelf px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <strong>
              Du var væk i {dur(away.hours)}. {s.name} er nu: {away.mood.title.toLowerCase()}.
            </strong>
            {away.news.length > 0 && (
              <ul className="text-[0.9rem] text-muted">
                {away.news.slice(0, 3).map((e, i) => (
                  <li key={i}>{e.text}</li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setAway(null)} className="rounded-full px-3 py-1 text-[0.9rem] underline">
            Luk
          </button>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        {/* Glasset og betjening */}
        <section className="flex min-w-0 flex-col items-center gap-6">
          <div className="flex w-full max-w-[560px] flex-col items-center gap-3 text-center">
            <span className={`rounded-full px-3 py-1 font-display text-[0.95rem] font-bold ${toneClass}`}>
              {md.title}
            </span>
            <p className="max-w-[46ch] text-[1rem] text-ink" aria-live="polite">
              {md.text}
            </p>
          </div>

          <div className="relative w-full max-w-[440px]">
            <Jar simRef={simRef} fxRef={fxRef} speed={s.speed} />
            {s.dead && (
              <div className="absolute inset-x-4 top-1/3 flex flex-col items-center gap-3 rounded-lg bg-shelf p-5 text-center shadow-lg">
                <strong className="font-display text-xl">{s.name} er ikke mere</strong>
                <p className="text-[0.9rem] text-muted">{s.events[0]?.text}</p>
                <button onClick={restart} className="rounded-full bg-band px-4 py-2 font-bold text-band-ink">
                  Start en ny surdej
                </button>
              </div>
            )}
          </div>

          {(pend.flour > 0 || pend.water > 0) && (
            <p className="rounded-full bg-shelf px-4 py-1.5 text-center text-[0.9rem]">
              Ikke rørt i endnu: <span className="num">+{Math.round(pend.flour)} g mel, +{Math.round(pend.water)} g vand</span>
              {pend.flour > 0 && (
                <>
                  {' '}
                  · forhold <span className="num">1:{dec(pend.flour / pendBase)}:{dec(pend.water / pendBase)}</span>
                </>
              )}
            </p>
          )}

          <div className="flex w-full max-w-[560px] flex-col gap-5">
            <fieldset className="flex flex-wrap items-center justify-center gap-2">
              <legend className="label mb-2 w-full text-center">Mængde pr. tryk</legend>
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  aria-pressed={amount === a}
                  className={`num rounded-full px-3.5 py-1.5 text-[0.9rem] transition-colors ${
                    amount === a ? 'bg-ink text-wall' : 'bg-shelf text-ink hover:bg-line'
                  }`}
                >
                  {a} g
                </button>
              ))}
            </fieldset>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ActionButton onClick={doDiscard} disabled={s.dead || mass < 6} title="Kassér" sub={`−${amount} g surdej`} />
              <ActionButton onClick={doFlour} disabled={s.dead || vol > JAR_ML * 0.98} title="Mel" sub={`+${amount} g`} />
              <ActionButton onClick={doWater} disabled={s.dead || vol > JAR_ML * 0.98} title="Vand" sub={`+${amount} g`} />
              <ActionButton onClick={doStir} disabled={s.dead} title="Rør rundt" sub="bland det hele" primary />
            </div>

            <div className="flex flex-col gap-2 rounded-lg bg-shelf p-4">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="temp" className="label">
                  Temperatur i rummet
                </label>
                <span className="num font-display text-2xl font-bold">{Math.round(s.temp)} °C</span>
              </div>
              <input
                id="temp"
                type="range"
                min="2"
                max="42"
                step="1"
                value={s.temp}
                onChange={(e) => setTemp(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex flex-wrap gap-1.5">
                {PLACES.map((p) => (
                  <button
                    key={p.t}
                    onClick={() => setTemp(p.t)}
                    className={`rounded-full px-2.5 py-1 text-[0.8rem] ${
                      Math.round(s.temp) === p.t ? 'bg-ink text-wall' : 'bg-wall text-ink hover:bg-line'
                    }`}
                  >
                    {p.label} <span className="num opacity-70">{p.t}°</span>
                  </button>
                ))}
              </div>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="label mb-2">Tidens gang</legend>
              <div className="grid grid-cols-4 gap-1 rounded-full bg-shelf p-1">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp.v}
                    onClick={() => setSpeed(sp.v)}
                    aria-pressed={s.speed === sp.v}
                    title={sp.title}
                    className={`num rounded-full px-1 py-1.5 text-[0.8rem] transition-colors ${
                      s.speed === sp.v ? 'bg-ink text-wall' : 'text-ink hover:bg-line'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              <p className="text-[0.8rem] text-muted">
                Når du lukker siden, lever {s.name} videre i realtid og venter på dig.
              </p>
            </fieldset>
          </div>
        </section>

        {/* Tal, graf og logbog */}
        <aside className="flex min-w-0 flex-col gap-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Stat label="Vægt" value={`${Math.round(mass)} g`} />
            <Stat label="Hydrering" value={`${Math.round(hydration(s) * 100)} %`} />
            <Stat label="pH" value={dec(pH(s))} />
            <Stat label="Højde" value={`${dec(1 + s.gas)}×`} />
            <Stat label="Gær pr. gram" value={sci(cells.yeast)} dot="var(--yeast)" />
            <Stat label="Bakterier pr. gram" value={sci(cells.lab)} dot="var(--lab)" />
            <Stat label="Sidst fodret" value={sinceFed == null ? '–' : `${dur(sinceFed)} siden`} />
            <Stat label="Forhold" value={s.lastRatio ? s.lastRatio.text : '–'} />
            <Stat
              label="Top efter"
              value={s.hoursToPeak != null && s.hoursToPeak > 0.2 ? dur(s.hoursToPeak) : '–'}
            />
            <Stat label="Fylder" value={`${Math.round(vol)} af ${JAR_ML} ml`} />
          </dl>

          <Chart history={s.history} now={s.simTime} />

          <section className="flex flex-col gap-2">
            <h2 className="label">Logbog</h2>
            <ol className="flex flex-col gap-1.5 text-[0.88rem]">
              {s.events.slice(0, 7).map((e, i) => (
                <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <span className="num text-muted">{dur(Math.max(0, s.simTime - e.t))}</span>
                  <span className="min-w-0">{e.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-2 text-[0.88rem] text-muted">
            <h2 className="label">Sådan passer du den</h2>
            <p>
              Kassér det meste, kom mel og vand i, og rør rundt. Forholdet <span className="num text-ink">1:2:2</span>{' '}
              betyder én del gammel surdej, to dele mel og to dele vand. Jo mere nyt mel, jo længere tid går der, før
              den topper.
            </p>
            <p>
              Varme får gær og bakterier til at vokse hurtigere, men bakterierne kan bedst lide det varmest, så dejen
              bliver mere sur. I køleskabet sover den. Vandig dej gærer hurtigt, men holder dårligere på luften.
            </p>
          </section>
        </aside>
      </div>
    </main>
  )
}

function ActionButton({ title, sub, onClick, disabled, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-3.5 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'bg-band text-band-ink' : 'border-2 border-ink text-ink hover:bg-shelf'
      }`}
    >
      <span className="font-display text-[1.15rem] font-bold">{title}</span>
      <span className="num text-[0.78rem] opacity-80">{sub}</span>
    </button>
  )
}

function Stat({ label, value, dot }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="label flex items-center gap-1.5">
        {dot && <i className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </dt>
      <dd className="num text-[1.05rem] text-ink">{value}</dd>
    </div>
  )
}

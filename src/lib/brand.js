/*
 * Identidade visual do box (white-label).
 *
 * O box cadastra só 2 cores (boxes.brand_primary / brand_secondary). Daqui saem
 * todos os tokens de src/index.css, nos dois temas, com contraste garantido:
 *   primária   → texto, cabeçalhos, blocos invertidos (no lugar do marrom DS)
 *   secundária → botões, badges, destaques            (no lugar do âmbar DS)
 * Texto precisa de 4,5:1 (WCAG AA). Quando a cor do cliente não chega lá
 * (ex.: dourado como texto sobre fundo claro), ela é escurecida/clareada até chegar.
 */

/* ---------- cor ---------- */

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')

/** Mistura `a` com `b`: t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t))
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Escurece (fundo claro) ou clareia (fundo escuro) `color` até ter `min`:1 contra todos os `bgs`. */
export function ensureContrast(color, bgs, min = 4.5) {
  const list = [].concat(bgs)
  const ok = (c) => list.every((bg) => contrast(c, bg) >= min)
  if (ok(color)) return color
  const target = luminance(list[0]) > 0.5 ? '#000000' : '#ffffff'
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(color, target, t)
    if (ok(c)) return c
  }
  return target
}

/** Entre as opções, a primeira legível (4,5:1) sobre `bg`; senão a de maior contraste. */
function readableOn(bg, options) {
  return options.find((c) => contrast(c, bg) >= 4.5) || [...options].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0]
}

const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

/* ---------- tokens ---------- */

export function brandTokens(primary, secondary) {
  const p = primary.toLowerCase()
  const s = secondary.toLowerCase()

  // Modo Claro: superfícies brancas levemente tingidas pela primária
  const lCanvas = mix('#ffffff', p, 0.035)
  const lElevated = mix('#ffffff', p, 0.07)
  const lightBgs = [lCanvas, '#ffffff', lElevated]
  const lFg = ensureContrast(p, lightBgs, 7)
  const onAccent = readableOn(s, [p, '#0b0b0f', '#ffffff'])
  const light = {
    raiz: p,
    ambar: s,
    ink: onAccent,
    canvas: lCanvas,
    surface: mix('#ffffff', p, 0.015),
    card: '#ffffff',
    elevated: lElevated,
    line: mix('#ffffff', p, 0.13),
    'line-strong': mix('#ffffff', p, 0.24),
    faint: mix('#ffffff', p, 0.2),
    fg: lFg,
    'fg-soft': ensureContrast(mix(lFg, '#ffffff', 0.12), lightBgs),
    'fg-muted': ensureContrast(mix(lFg, '#ffffff', 0.25), lightBgs),
    'fg-subtle': ensureContrast(mix(lFg, '#ffffff', 0.35), lightBgs),
    accent: s,
    'accent-strong': mix(s, '#000000', 0.12),
    'on-accent': onAccent,
    highlight: ensureContrast(s, lightBgs),
    inverse: lFg,
    'on-inverse': lCanvas,
  }

  // Modo Noturno: fundos derivados da primária escurecida
  const dCanvas = mix(p, '#000000', 0.72)
  const dElevated = mix(p, '#000000', 0.5)
  const darkBgs = [dCanvas, dElevated]
  const dFg = mix('#ffffff', p, 0.06)
  const dark = {
    canvas: dCanvas,
    surface: mix(p, '#000000', 0.66),
    card: mix(p, '#000000', 0.58),
    elevated: dElevated,
    line: mix(p, '#000000', 0.4),
    'line-strong': mix(p, '#000000', 0.22),
    faint: mix(p, '#000000', 0.1),
    fg: dFg,
    'fg-soft': ensureContrast(mix(dFg, p, 0.15), darkBgs),
    'fg-muted': ensureContrast(mix(dFg, p, 0.3), darkBgs),
    'fg-subtle': ensureContrast(mix(dFg, p, 0.45), darkBgs),
    accent: s,
    'accent-strong': mix(s, '#ffffff', 0.15),
    'on-accent': onAccent,
    highlight: ensureContrast(s, darkBgs),
    inverse: dFg,
    'on-inverse': dCanvas,
  }

  return { light, dark }
}

/** CSS que sobrepõe os tokens de src/index.css. `html:root` ganha em especificidade das regras originais. */
export function brandCss(primary, secondary) {
  if (!isHex(primary) || !isHex(secondary)) return ''
  const { light, dark } = brandTokens(primary, secondary)
  const decl = (t) => Object.entries(t).map(([k, v]) => `--color-${k}:${v};`).join('')
  return `html:root{${decl(light)}}html:root[data-theme="dark"]{${decl(dark)}}`
}

/* ---------- logos (Storage: assets/boxes/<id>/logo-*.png) ---------- */

/** URL pública de um arquivo do box no Storage (assets/boxes/<id>/<arquivo>). */
export const boxAsset = (boxId, file) => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/assets/boxes/${boxId}/${file}`

export function boxLogos(boxId) {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/assets/boxes/${boxId}`
  return {
    icone: `${base}/logo-icone.png`,
    completa: `${base}/logo-completa.png`, // letras brancas: só sobre fundo escuro
    texto: `${base}/logo-texto.png`, // letras brancas: só sobre fundo escuro
    clara: `${base}/logo-clara.png`, // toda branca: fundos escuros
    escura: `${base}/logo-escura.png`, // toda preta: fundos claros
  }
}

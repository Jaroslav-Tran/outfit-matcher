import { itemFitsSeason, normalizeFit } from './constants.js'
import {
  annotateWardrobeWithPalette,
  detectColorScheme,
  distinctNonNeutralHexes,
  hueFamilyName,
  isHighSaturation,
  SAME_COLOR_DELTA_E,
  SCHEME_ORDER,
  deltaE,
} from './colorUtils.js'

export const MAX_COMBINATIONS = 50000

const REQUIRED_CATEGORIES = ['top', 'bottom', 'shoes']

/** Local calendar date as YYYY-MM-DD (device timezone). */
export function localDateISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseLocalDate(iso) {
  if (!iso || typeof iso !== 'string') return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Whole days between lastWorn and today (local). null if never worn. */
export function daysSinceLastWorn(lastWorn, today = localDateISO()) {
  const worn = parseLocalDate(lastWorn)
  const now = parseLocalDate(today)
  if (!worn || !now) return null
  return Math.round((now.getTime() - worn.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Soft recency penalty for one item.
 * null / never → 0; within 2 days → -5; within 5 days → -2; else 0.
 */
export function recencyPenalty(lastWorn, today = localDateISO()) {
  const days = daysSinceLastWorn(lastWorn, today)
  if (days == null || days < 0) return 0
  if (days <= 2) return -5
  if (days <= 5) return -2
  return 0
}

export function comboRecencyPenalty(items, today = localDateISO()) {
  return (items || []).reduce(
    (sum, item) => sum + recencyPenalty(item.lastWorn, today),
    0,
  )
}

function byCategory(wardrobe, category) {
  return wardrobe.filter((item) => item.category === category)
}

function accessorySubsetCount(accessoryCount, maxAccessories) {
  let count = 1
  if (maxAccessories >= 1) count += accessoryCount
  if (maxAccessories >= 2) count += (accessoryCount * (accessoryCount - 1)) / 2
  return count
}

export function rawCombinationCount(wardrobe, maxAccessories) {
  const tops = byCategory(wardrobe, 'top').length
  const bottoms = byCategory(wardrobe, 'bottom').length
  const shoes = byCategory(wardrobe, 'shoes').length
  const outerwearChoices = byCategory(wardrobe, 'outerwear').length + 1
  const accessories = byCategory(wardrobe, 'accessory').length
  return (
    tops *
    bottoms *
    shoes *
    outerwearChoices *
    accessorySubsetCount(accessories, maxAccessories)
  )
}

function accessorySubsets(accessories, maxAccessories) {
  const subsets = [[]]
  if (maxAccessories >= 1) {
    for (const accessory of accessories) {
      subsets.push([accessory])
    }
  }
  if (maxAccessories >= 2) {
    for (let i = 0; i < accessories.length; i += 1) {
      for (let j = i + 1; j < accessories.length; j += 1) {
        subsets.push([accessories[i], accessories[j]])
      }
    }
  }
  return subsets
}

function enumerateCandidates(wardrobe, maxAccessories, cap) {
  const tops = byCategory(wardrobe, 'top')
  const bottoms = byCategory(wardrobe, 'bottom')
  const shoes = byCategory(wardrobe, 'shoes')
  const outerwear = byCategory(wardrobe, 'outerwear')
  const accessories = byCategory(wardrobe, 'accessory')
  const outerwearOptions = [null, ...outerwear]
  const accSubsets = accessorySubsets(accessories, maxAccessories)

  const combos = []
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const outer of outerwearOptions) {
          for (const accs of accSubsets) {
            if (combos.length >= cap) return combos
            const items = [top, bottom, shoe]
            if (outer) items.push(outer)
            items.push(...accs)
            combos.push({
              top,
              bottom,
              shoes: shoe,
              outerwear: outer,
              accessories: accs,
              items,
            })
          }
        }
      }
    }
  }
  return combos
}

function comboFormality(combo) {
  return combo.top.formality
}

function passesFormalityFilter(combo, formalityFilter) {
  const required = [combo.top, combo.bottom, combo.shoes]
  if (combo.outerwear) required.push(combo.outerwear)

  const tier = combo.top.formality
  const requiredMatch = required.every((item) => item.formality === tier)
  const accessoriesMatch = combo.accessories.every((item) => item.formality === tier)
  if (!requiredMatch || !accessoriesMatch) return false

  if (formalityFilter && formalityFilter !== 'any' && tier !== formalityFilter) {
    return false
  }

  return true
}

function passesSeasonFilter(combo, seasonFilter) {
  if (!seasonFilter || seasonFilter === 'any') return true
  return combo.items.every((item) => itemFitsSeason(item, seasonFilter))
}

function itemName(item) {
  return item.label || item.category
}

function paletteLabel(color) {
  if (!color) return 'your palette'
  return color.label || color.hex
}

function listNames(items) {
  if (items.length === 0) return 'these pieces'
  if (items.length === 1) return itemName(items[0])
  if (items.length === 2) return `${itemName(items[0])} and ${itemName(items[1])}`
  const rest = items.slice(0, -1).map(itemName).join(', ')
  return `${rest}, and ${itemName(items[items.length - 1])}`
}

function representativeNonNeutrals(items) {
  const reps = []
  for (const item of items.filter((entry) => !entry.isNeutral)) {
    const already = reps.some((rep) => deltaE(rep.hex, item.hex) < SAME_COLOR_DELTA_E)
    if (!already) reps.push(item)
  }
  return reps
}

function paletteAppendix(nonNeutrals) {
  const closest = [...nonNeutrals].sort(
    (a, b) => (a.deltaE ?? Infinity) - (b.deltaE ?? Infinity),
  )[0]
  if (!closest?.closestPaletteMatch || !Number.isFinite(closest.deltaE)) return ''
  return ` '${itemName(closest)}' is close to your palette color '${paletteLabel(closest.closestPaletteMatch)}' (ΔE ${closest.deltaE.toFixed(1)}).`
}

function analyzeFit(combo) {
  const topFit = normalizeFit(combo.top.fit)
  const bottomFit = normalizeFit(combo.bottom.fit)
  const silhouette = [combo.top, combo.bottom]
  if (combo.outerwear) silhouette.push(combo.outerwear)

  const relaxedItems = silhouette.filter((item) => normalizeFit(item.fit) === 'relaxed')
  const relaxedCount = relaxedItems.length
  const volumeStackApplied = relaxedCount >= 2
  const volumeStackPenalty = volumeStackApplied ? -4 * (relaxedCount - 1) : 0

  const fitBalanceApplied =
    (topFit === 'fitted' && bottomFit === 'relaxed') ||
    (topFit === 'relaxed' && bottomFit === 'fitted')
  const balanceBonus = fitBalanceApplied ? 3 : 0

  const layerInversionApplied =
    Boolean(combo.outerwear) &&
    normalizeFit(combo.outerwear.fit) === 'fitted' &&
    topFit === 'relaxed'
  const layerPenalty = layerInversionApplied ? -4 : 0

  return {
    extraScore: volumeStackPenalty + balanceBonus + layerPenalty,
    fitBalanceApplied,
    volumeStackApplied,
    relaxedItems,
    fittedBalanceItem: topFit === 'fitted' ? combo.top : combo.bottom,
    relaxedBalanceItem: topFit === 'relaxed' ? combo.top : combo.bottom,
  }
}

function fitAppendix(fit) {
  let extra = ''
  if (fit.fitBalanceApplied) {
    extra += ` ${itemName(fit.relaxedBalanceItem)} is balanced by ${itemName(fit.fittedBalanceItem)}'s slimmer fit.`
  }
  if (fit.volumeStackApplied) {
    extra += ` Note: ${listNames(fit.relaxedItems)} are all relaxed-fit, which can look shapeless without deliberate styling.`
  }
  return extra
}

function buildExplanation(combo, colorScheme, fit) {
  const neutrals = combo.items.filter((item) => item.isNeutral)
  const nonNeutrals = combo.items.filter((item) => !item.isNeutral)
  const baseNeutral =
    neutrals.find((item) => REQUIRED_CATEGORIES.includes(item.category)) ||
    neutrals[0]
  const grounded = baseNeutral ? itemName(baseNeutral) : 'neutral pieces'
  const reps = representativeNonNeutrals(combo.items)
  const appendix = paletteAppendix(nonNeutrals) + fitAppendix(fit)

  if (colorScheme === 'neutral-only') {
    return `All-neutral look — ${listNames(combo.items)} rely on tone and texture rather than color contrast.`
  }

  if (colorScheme === 'monochromatic') {
    const family = hueFamilyName(reps[0]?.hex || nonNeutrals[0]?.hex)
    const anchor = baseNeutral ? `, anchored by ${itemName(baseNeutral)}` : ''
    const verb = nonNeutrals.length === 1 ? 'shares' : 'share'
    return `Monochromatic look built around ${family} — ${listNames(nonNeutrals)} ${verb} a single hue family${anchor}.${appendix}`
  }

  const itemA = itemName(reps[0] || nonNeutrals[0])
  const itemB = itemName(reps[1] || reps[0] || nonNeutrals[1] || nonNeutrals[0])

  if (colorScheme === 'analogous') {
    return `Analogous pairing of ${itemA} and ${itemB}, adjacent on the color wheel, kept grounded by ${grounded}.${appendix}`
  }

  if (colorScheme === 'complementary') {
    return `Complementary contrast — ${itemA} and ${itemB} sit near-opposite on the color wheel, with ${grounded} anchoring the look.${appendix}`
  }

  return appendix.trim()
}

function scoreCombo(combo) {
  const nonNeutrals = combo.items.filter((item) => !item.isNeutral)
  let score = 0

  for (const item of nonNeutrals) {
    const distance = Number.isFinite(item.deltaE) ? item.deltaE : 20
    score += Math.max(0, 20 - distance)
  }

  if (combo.accessories.length === 1) score += 2

  const loudNonNeutrals = nonNeutrals.filter((item) => isHighSaturation(item.hex))
  if (loudNonNeutrals.length >= 2) {
    score -= 3 * loudNonNeutrals.length
  }

  const fit = analyzeFit(combo)
  score += fit.extraScore
  score += comboRecencyPenalty(combo.items)
  return { score, fit }
}

function comboKey(combo) {
  return combo.items
    .map((item) => item.id)
    .sort()
    .join('|')
}

export function generateOutfits(
  wardrobe,
  palette,
  formalityFilter = 'any',
  seasonFilter = 'any',
) {
  if (!wardrobe?.length) return []

  const missingRequired = REQUIRED_CATEGORIES.some(
    (category) => byCategory(wardrobe, category).length === 0,
  )
  if (missingRequired) return []

  // Step 0 — precompute closest palette match / ΔE once per item.
  const annotated = annotateWardrobeWithPalette(wardrobe, palette || [])

  // Step 1 — enumerate, capping at 50,000. Prefer dropping 2-accessory
  // subsets before truncating the loop.
  let maxAccessories = 2
  const rawWithTwo = rawCombinationCount(annotated, 2)
  if (rawWithTwo > MAX_COMBINATIONS) {
    maxAccessories = 1
    console.warn(
      'Outfit enumeration cap: restricting accessory subsets to 0–1 (raw combination count would exceed 50,000).',
    )
    const rawWithOne = rawCombinationCount(annotated, 1)
    if (rawWithOne > MAX_COMBINATIONS) {
      console.warn(
        'Outfit enumeration cap: still exceeding 50,000 combinations after accessory restriction; truncating enumeration at 50,000.',
      )
    }
  }

  const candidates = enumerateCandidates(annotated, maxAccessories, MAX_COMBINATIONS)

  const scored = []
  for (const combo of candidates) {
    // Step 2 — formality (and season, if filtered).
    if (!passesFormalityFilter(combo, formalityFilter)) continue
    if (!passesSeasonFilter(combo, seasonFilter)) continue

    // Step 3 — 3-color rule, then scheme classification.
    const nonNeutralHexes = distinctNonNeutralHexes(combo.items)
    if (nonNeutralHexes.length > 2) continue
    const colorScheme = detectColorScheme(nonNeutralHexes)
    if (colorScheme === 'unclassified') continue

    // Step 4 — score survivors (uses precomputed deltaE only).
    const { score, fit } = scoreCombo(combo)
    scored.push({
      items: combo.items,
      top: combo.top,
      bottom: combo.bottom,
      shoes: combo.shoes,
      outerwear: combo.outerwear,
      accessories: combo.accessories,
      formality: comboFormality(combo),
      colorScheme,
      score,
      explanation: buildExplanation(combo, colorScheme, fit),
    })
  }

  // Step 5 — dedupe by item-id set, then keep the best of each scheme.
  const seen = new Set()
  const unique = []
  for (const outfit of scored) {
    const key = comboKey(outfit)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(outfit)
  }

  const bestByScheme = {}
  for (const outfit of unique) {
    const current = bestByScheme[outfit.colorScheme]
    if (!current || outfit.score > current.score) {
      bestByScheme[outfit.colorScheme] = outfit
    }
  }

  return SCHEME_ORDER.map((scheme) => bestByScheme[scheme]).filter(Boolean)
}

import {
  FORMALITY_ORDER,
  itemHasCategory,
  LENGTH_ORDER,
  normalizeFit,
  normalizeLength,
  normalizeWarmth,
  itemFitsSeason,
  WARMTH_ORDER,
} from './constants.js'
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
import { comboWeatherBonus } from './weather.js'

export const MAX_COMBINATIONS = 50000

export const LAYER_COMFORT_RULES = {
  hot: { idealLayers: 1, maxWarmthSum: 1 },
  mild: { idealLayers: 2, maxWarmthSum: 3 },
  cold: { idealLayers: 3, maxWarmthSum: 6 },
}

const REQUIRED_SLOT_CATEGORIES = ['top', 'bottom', 'shoes']

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
  return wardrobe.filter((item) => itemHasCategory(item, category))
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
  const midLayerChoices = byCategory(wardrobe, 'mid-layer').length + 1
  const outerwearChoices = byCategory(wardrobe, 'outerwear').length + 1
  const accessories = byCategory(wardrobe, 'accessory').length
  return (
    tops *
    bottoms *
    shoes *
    midLayerChoices *
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

export function layerStack(combo) {
  return [combo.top, combo.midLayer, combo.outerwear].filter(Boolean)
}

export function comboHasDuplicateSlots(combo) {
  const slotItems = [
    combo.top,
    combo.bottom,
    combo.shoes,
    combo.midLayer,
    combo.outerwear,
    ...(combo.accessories || []),
  ].filter(Boolean)
  const ids = slotItems.map((item) => item.id)
  return new Set(ids).size !== ids.length
}

export function outerwearFormalityAllowed(topFormality, outerFormality) {
  const top = FORMALITY_ORDER[topFormality]
  const outer = FORMALITY_ORDER[outerFormality]
  if (top == null || outer == null) return false
  return outer >= top && outer <= top + 1
}

function enumerateCandidates(wardrobe, maxAccessories, cap) {
  const tops = byCategory(wardrobe, 'top')
  const bottoms = byCategory(wardrobe, 'bottom')
  const shoes = byCategory(wardrobe, 'shoes')
  const midLayers = byCategory(wardrobe, 'mid-layer')
  const outerwear = byCategory(wardrobe, 'outerwear')
  const accessories = byCategory(wardrobe, 'accessory')
  const midLayerOptions = [null, ...midLayers]
  const outerwearOptions = [null, ...outerwear]
  const accSubsets = accessorySubsets(accessories, maxAccessories)

  const combos = []
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const mid of midLayerOptions) {
          for (const outer of outerwearOptions) {
            for (const accs of accSubsets) {
              if (combos.length >= cap) return combos
              const combo = {
                top,
                bottom,
                shoes: shoe,
                midLayer: mid,
                outerwear: outer,
                accessories: accs,
              }
              if (comboHasDuplicateSlots(combo)) continue
              const items = [top, bottom, shoe]
              if (mid) items.push(mid)
              if (outer) items.push(outer)
              items.push(...accs)
              combo.items = items
              combos.push(combo)
            }
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

export function passesFormalityFilter(combo, formalityFilter) {
  const tier = combo.top.formality
  const core = [combo.top, combo.bottom, combo.shoes]
  if (!core.every((item) => item.formality === tier)) return false

  if (combo.midLayer && combo.midLayer.formality !== tier) return false

  if (combo.outerwear && !outerwearFormalityAllowed(tier, combo.outerwear.formality)) {
    return false
  }

  if (!combo.accessories.every((item) => item.formality === tier)) return false

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
  return item.label || (Array.isArray(item.category) ? item.category[0] : item.category)
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

/** Mention closest palette match when ΔE < 12 (neutrals included). */
function paletteAppendix(items) {
  const closest = [...(items || [])].sort(
    (a, b) => (a.deltaE ?? Infinity) - (b.deltaE ?? Infinity),
  )[0]
  if (!closest?.closestPaletteMatch || !Number.isFinite(closest.deltaE)) return ''
  if (closest.deltaE >= SAME_COLOR_DELTA_E) return ''
  return ` '${itemName(closest)}' is close to your palette color '${paletteLabel(closest.closestPaletteMatch)}' (ΔE ${closest.deltaE.toFixed(1)}).`
}

/** Palette closeness for one item: max(0, 20 − ΔE). Neutrals are included. */
export function palettePointsForItem(item) {
  if (!item?.hex) return 0
  const distance = Number.isFinite(item.deltaE) ? item.deltaE : 20
  return Math.max(0, 20 - distance)
}

export function palettePointsForCombo(items) {
  return (items || []).reduce((sum, item) => sum + palettePointsForItem(item), 0)
}

function analyzeFit(combo) {
  const topFit = normalizeFit(combo.top.fit)
  const bottomFit = normalizeFit(combo.bottom.fit)
  const silhouette = [combo.top, combo.bottom]
  if (combo.midLayer) silhouette.push(combo.midLayer)
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

export function analyzeLayerStyle(combo) {
  const stack = layerStack(combo)
  let extraScore = 0
  let lengthHierarchyBonus = false
  let warmthGradingPenalty = false
  let heavyBulkPenalty = false

  if (stack.length >= 2) {
    lengthHierarchyBonus = true
    for (let i = 1; i < stack.length; i += 1) {
      const inner = stack[i - 1]
      const outer = stack[i]
      const innerLen = LENGTH_ORDER[normalizeLength(inner.length)]
      const outerLen = LENGTH_ORDER[normalizeLength(outer.length)]
      if (outerLen < innerLen) lengthHierarchyBonus = false

      const innerWarm = WARMTH_ORDER[normalizeWarmth(inner.warmth)]
      const outerWarm = WARMTH_ORDER[normalizeWarmth(outer.warmth)]
      if (outerWarm < innerWarm) {
        warmthGradingPenalty = true
        extraScore -= 4
      }
    }
    if (lengthHierarchyBonus) extraScore += 2
  }

  const heavyCount = stack.filter((item) => normalizeWarmth(item.warmth) === 'heavy').length
  if (heavyCount > 1) {
    heavyBulkPenalty = true
    extraScore -= 4
  }

  return {
    extraScore,
    lengthHierarchyBonus,
    warmthGradingPenalty,
    heavyBulkPenalty,
  }
}

export function bandFromWeatherSeasons(weatherSeasons) {
  if (!weatherSeasons?.length) return null
  const set = new Set(weatherSeasons)
  if (set.has('summer') && !set.has('winter') && set.size === 1) return 'hot'
  if (set.has('winter') && !set.has('summer')) return 'cold'
  if (set.has('spring') || set.has('fall')) return 'mild'
  if (set.has('summer')) return 'hot'
  return 'mild'
}

export function comboComfortPenalty(combo, band) {
  if (!band || !LAYER_COMFORT_RULES[band]) return 0
  const rules = LAYER_COMFORT_RULES[band]
  const stack = layerStack(combo)
  const layerCount = stack.length
  const warmthSum = stack.reduce(
    (sum, item) => sum + WARMTH_ORDER[normalizeWarmth(item.warmth)],
    0,
  )
  let penalty = 0
  if (layerCount > rules.idealLayers + 1) penalty -= 3
  if (band === 'cold' && warmthSum < rules.maxWarmthSum / 2) penalty -= 3
  return penalty
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

function midLayerAppendix(combo) {
  if (!combo.midLayer) return ''
  return ` Let the ${itemName(combo.top)} show slightly at the cuff or collar under the ${itemName(combo.midLayer)} for a more deliberate look.`
}

function buildExplanation(combo, colorScheme, fit) {
  const neutrals = combo.items.filter((item) => item.isNeutral)
  const nonNeutrals = combo.items.filter((item) => !item.isNeutral)
  const baseNeutral =
    neutrals.find((item) => itemHasCategory(item, 'top') || itemHasCategory(item, 'bottom')) ||
    neutrals[0]
  const grounded = baseNeutral ? itemName(baseNeutral) : 'neutral pieces'
  const reps = representativeNonNeutrals(combo.items)
  const appendix =
    paletteAppendix(combo.items) + fitAppendix(fit) + midLayerAppendix(combo)

  if (colorScheme === 'neutral-only') {
    // LOOP-02: still duplicates midLayer; fixed in that finding's commit.
    return `All-neutral look — ${listNames(combo.items)} rely on tone and texture rather than color contrast.${midLayerAppendix(combo)}${paletteAppendix(combo.items)}${fitAppendix(fit)}`
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

/**
 * Soft style adjustments only (fit, layering, recency, weather, comfort, accessory, saturation).
 * Used for LOGIC-01 dominance measurement — weights are not retuned here.
 */
export function styleAdjustmentTotal(combo, weatherSeasons = null) {
  const nonNeutrals = (combo.items || []).filter((item) => !item.isNeutral)
  let total = 0
  if ((combo.accessories || []).length === 1) total += 2
  const loudNonNeutrals = nonNeutrals.filter((item) => isHighSaturation(item.hex))
  if (loudNonNeutrals.length >= 2) {
    total -= 3 * loudNonNeutrals.length
  }
  total += analyzeFit(combo).extraScore
  total += analyzeLayerStyle(combo).extraScore
  total += comboRecencyPenalty(combo.items)
  total += comboWeatherBonus(combo.items, weatherSeasons)
  total += comboComfortPenalty(combo, bandFromWeatherSeasons(weatherSeasons))
  return total
}

export function absStyleAdjustmentSum(combo, weatherSeasons = null) {
  const nonNeutrals = (combo.items || []).filter((item) => !item.isNeutral)
  const parts = []
  if ((combo.accessories || []).length === 1) parts.push(2)
  const loudNonNeutrals = nonNeutrals.filter((item) => isHighSaturation(item.hex))
  if (loudNonNeutrals.length >= 2) parts.push(Math.abs(-3 * loudNonNeutrals.length))
  const fit = analyzeFit(combo)
  if (fit.extraScore) parts.push(Math.abs(fit.extraScore))
  const layerStyle = analyzeLayerStyle(combo)
  if (layerStyle.extraScore) parts.push(Math.abs(layerStyle.extraScore))
  const recency = comboRecencyPenalty(combo.items)
  if (recency) parts.push(Math.abs(recency))
  const weather = comboWeatherBonus(combo.items, weatherSeasons)
  if (weather) parts.push(Math.abs(weather))
  const comfort = comboComfortPenalty(combo, bandFromWeatherSeasons(weatherSeasons))
  if (comfort) parts.push(Math.abs(comfort))
  return parts.reduce((sum, n) => sum + n, 0)
}

function scoreCombo(combo, weatherSeasons = null) {
  const palettePoints = palettePointsForCombo(combo.items)
  const fit = analyzeFit(combo)
  const style = styleAdjustmentTotal(combo, weatherSeasons)
  // styleAdjustmentTotal already includes fit.extraScore; avoid double-counting by
  // recomputing: palette + style where style uses analyzeFit inside.
  const score = palettePoints + style
  return { score, fit, palettePoints, style }
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
  weatherSeasons = null,
) {
  if (!wardrobe?.length) return []

  const missingRequired = REQUIRED_SLOT_CATEGORIES.some(
    (category) => byCategory(wardrobe, category).length === 0,
  )
  if (missingRequired) return []

  const annotated = annotateWardrobeWithPalette(wardrobe, palette || [])

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
  const activeWeatherSeasons = weatherSeasons?.length ? weatherSeasons : null

  const scored = []
  for (const combo of candidates) {
    if (!passesFormalityFilter(combo, formalityFilter)) continue
    if (!passesSeasonFilter(combo, seasonFilter)) continue

    const nonNeutralHexes = distinctNonNeutralHexes(combo.items)
    if (nonNeutralHexes.length > 2) continue
    const colorScheme = detectColorScheme(nonNeutralHexes)
    if (colorScheme === 'unclassified') continue

    const { score, fit } = scoreCombo(combo, activeWeatherSeasons)
    scored.push({
      items: combo.items,
      top: combo.top,
      bottom: combo.bottom,
      shoes: combo.shoes,
      midLayer: combo.midLayer,
      outerwear: combo.outerwear,
      accessories: combo.accessories,
      formality: comboFormality(combo),
      colorScheme,
      score,
      explanation: buildExplanation(combo, colorScheme, fit),
    })
  }

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

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

/** Sort by palette closeness desc, stable id asc — never by wardrobe array order. */
export function rankItemsByPalette(items) {
  return [...(items || [])].sort((a, b) => {
    const diff = palettePointsForItem(b) - palettePointsForItem(a)
    if (diff !== 0) return diff
    return String(a.id).localeCompare(String(b.id))
  })
}

export function takeTopKByPalette(items, k) {
  if (k == null || k >= (items?.length || 0)) return items || []
  return rankItemsByPalette(items).slice(0, k)
}

function filterSeason(items, seasonFilter) {
  if (!seasonFilter || seasonFilter === 'any') return items
  return items.filter((item) => itemFitsSeason(item, seasonFilter))
}

/**
 * Incremental non-neutral color budget using union-find (LOGIC-06).
 * Returns false if adding `item` would exceed 2 distinct non-neutral colors.
 */
export function colorBudgetAllows(existingItems, item) {
  return distinctNonNeutralHexes([...(existingItems || []), item].filter(Boolean)).length <= 2
}

function idsConflict(usedIds, item) {
  return item && usedIds.has(item.id)
}

/**
 * Estimate pruned combo space for one formality tier (after season filter).
 */
export function estimatePrunedCountForTier(pools, maxAccessories) {
  const { tops, bottoms, shoes, midLayers, outerwear, accessories } = pools
  if (!tops.length || !bottoms.length || !shoes.length) return 0
  return (
    tops.length *
    bottoms.length *
    shoes.length *
    (midLayers.length + 1) *
    (outerwear.length + 1) *
    accessorySubsetCount(accessories.length, maxAccessories)
  )
}

function poolsForTier(wardrobe, tier) {
  const tops = byCategory(wardrobe, 'top').filter((item) => item.formality === tier)
  const bottoms = byCategory(wardrobe, 'bottom').filter((item) => item.formality === tier)
  const shoes = byCategory(wardrobe, 'shoes').filter((item) => item.formality === tier)
  const midLayers = byCategory(wardrobe, 'mid-layer').filter((item) => item.formality === tier)
  const accessories = byCategory(wardrobe, 'accessory').filter((item) => item.formality === tier)
  const outerwear = byCategory(wardrobe, 'outerwear').filter((item) =>
    outerwearFormalityAllowed(tier, item.formality),
  )
  return { tops, bottoms, shoes, midLayers, outerwear, accessories }
}

/**
 * Choose maxAccessories and optional per-slot K so estimated space ≤ cap.
 * Prefers reducing accessories 2→1→0 before top-K. Never truncates by iteration order.
 */
export function planEnumerationLimits(wardrobe, formalityFilter, cap = MAX_COMBINATIONS) {
  const tiers =
    formalityFilter && formalityFilter !== 'any'
      ? [formalityFilter]
      : ['casual', 'smart-casual', 'formal']

  for (const maxAccessories of [2, 1, 0]) {
    let total = 0
    for (const tier of tiers) {
      total += estimatePrunedCountForTier(poolsForTier(wardrobe, tier), maxAccessories)
    }
    if (total <= cap) {
      return { maxAccessories, topK: null, estimated: total }
    }
  }

  // Still over: shrink each slot to top-K by palette score until under cap.
  for (let k = 12; k >= 1; k -= 1) {
    let total = 0
    for (const tier of tiers) {
      const pools = poolsForTier(wardrobe, tier)
      const shrunk = {
        tops: takeTopKByPalette(pools.tops, k),
        bottoms: takeTopKByPalette(pools.bottoms, k),
        shoes: takeTopKByPalette(pools.shoes, k),
        midLayers: takeTopKByPalette(pools.midLayers, k),
        outerwear: takeTopKByPalette(pools.outerwear, k),
        accessories: takeTopKByPalette(pools.accessories, k),
      }
      total += estimatePrunedCountForTier(shrunk, 0)
    }
    if (total <= cap) {
      return { maxAccessories: 0, topK: k, estimated: total }
    }
  }

  return { maxAccessories: 0, topK: 1, estimated: tiers.length }
}

/**
 * Constraint-pruned DFS. Calls `visit(combo)` for each complete combo.
 * Returns number of combos visited. Stops early if visit returns false or cap hit.
 */
export function forEachPrunedCombo(
  wardrobe,
  formalityFilter = 'any',
  visit,
  { maxAccessories = 2, topK = null, cap = MAX_COMBINATIONS } = {},
) {
  const tiers =
    formalityFilter && formalityFilter !== 'any'
      ? [formalityFilter]
      : ['casual', 'smart-casual', 'formal']

  let produced = 0

  for (const tier of tiers) {
    let pools = poolsForTier(wardrobe, tier)
    if (topK != null) {
      pools = {
        tops: takeTopKByPalette(pools.tops, topK),
        bottoms: takeTopKByPalette(pools.bottoms, topK),
        shoes: takeTopKByPalette(pools.shoes, topK),
        midLayers: takeTopKByPalette(pools.midLayers, topK),
        outerwear: takeTopKByPalette(pools.outerwear, topK),
        accessories: takeTopKByPalette(pools.accessories, topK),
      }
    } else {
      pools = {
        tops: rankItemsByPalette(pools.tops),
        bottoms: rankItemsByPalette(pools.bottoms),
        shoes: rankItemsByPalette(pools.shoes),
        midLayers: rankItemsByPalette(pools.midLayers),
        outerwear: rankItemsByPalette(pools.outerwear),
        accessories: rankItemsByPalette(pools.accessories),
      }
    }

    const midOptions = [null, ...pools.midLayers]
    const outerOptions = [null, ...pools.outerwear]
    const accSubsets = accessorySubsets(pools.accessories, maxAccessories)

    for (const top of pools.tops) {
      for (const bottom of pools.bottoms) {
        if (bottom.id === top.id) continue
        if (!colorBudgetAllows([top], bottom)) continue
        for (const shoe of pools.shoes) {
          if (idsConflict(new Set([top.id, bottom.id]), shoe)) continue
          if (!colorBudgetAllows([top, bottom], shoe)) continue
          for (const mid of midOptions) {
            if (idsConflict(new Set([top.id, bottom.id, shoe.id]), mid)) continue
            if (mid && !colorBudgetAllows([top, bottom, shoe], mid)) continue
            for (const outer of outerOptions) {
              const used = new Set([top.id, bottom.id, shoe.id, mid?.id].filter(Boolean))
              if (idsConflict(used, outer)) continue
              if (
                outer &&
                !colorBudgetAllows([top, bottom, shoe, mid].filter(Boolean), outer)
              ) {
                continue
              }
              for (const accs of accSubsets) {
                if (produced >= cap) return produced

                const combo = {
                  top,
                  bottom,
                  shoes: shoe,
                  midLayer: mid,
                  outerwear: outer,
                  accessories: accs,
                }
                if (comboHasDuplicateSlots(combo)) continue

                let ok = true
                const built = [top, bottom, shoe]
                if (mid) built.push(mid)
                if (outer) built.push(outer)
                for (const acc of accs) {
                  if (!colorBudgetAllows(built, acc)) {
                    ok = false
                    break
                  }
                  built.push(acc)
                }
                if (!ok) continue
                if (distinctNonNeutralHexes(built).length > 2) continue

                combo.items = built
                produced += 1
                if (visit(combo) === false) return produced
                if (produced >= cap) return produced
              }
            }
          }
        }
      }
    }
  }
  return produced
}

async function yieldToEventLoop() {
  if (typeof globalThis.scheduler?.yield === 'function') {
    await globalThis.scheduler.yield()
  } else {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
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
    return `All-neutral look — ${listNames(combo.items)} rely on tone and texture rather than color contrast.${appendix}`
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

function finalizeOutfits(scored) {
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

function scoreVisitedCombo(combo, weatherSeasons) {
  const nonNeutralHexes = distinctNonNeutralHexes(combo.items)
  if (nonNeutralHexes.length > 2) return null
  const colorScheme = detectColorScheme(nonNeutralHexes)
  if (colorScheme === 'unclassified') return null
  const { score, fit } = scoreCombo(combo, weatherSeasons)
  return {
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
  }
}

/**
 * Sync pruned generate (unit tests). Season filter applied before enumeration.
 */
export function generateOutfits(
  wardrobe,
  palette,
  formalityFilter = 'any',
  seasonFilter = 'any',
  weatherSeasons = null,
) {
  if (!wardrobe?.length) return []

  const seasonFiltered = filterSeason(wardrobe, seasonFilter)
  const missingRequired = REQUIRED_SLOT_CATEGORIES.some(
    (category) => byCategory(seasonFiltered, category).length === 0,
  )
  if (missingRequired) return []

  const annotated = annotateWardrobeWithPalette(seasonFiltered, palette || [])
  const limits = planEnumerationLimits(annotated, formalityFilter, MAX_COMBINATIONS)
  if (limits.topK != null) {
    console.warn(
      `Outfit enumeration: accessories=0, top-K=${limits.topK} per slot (pruned estimate ${limits.estimated}).`,
    )
  } else if (limits.maxAccessories < 2) {
    console.warn(
      `Outfit enumeration: accessory subsets limited to 0–${limits.maxAccessories} (pruned estimate ${limits.estimated}).`,
    )
  }

  const activeWeatherSeasons = weatherSeasons?.length ? weatherSeasons : null
  const scored = []
  forEachPrunedCombo(
    annotated,
    formalityFilter,
    (combo) => {
      // Season already applied to pools; keep defensive check for empty-season items.
      if (!passesSeasonFilter(combo, seasonFilter)) return undefined
      if (!passesFormalityFilter(combo, formalityFilter)) return undefined
      const outfit = scoreVisitedCombo(combo, activeWeatherSeasons)
      if (outfit) scored.push(outfit)
      return undefined
    },
    limits,
  )

  return finalizeOutfits(scored)
}

/**
 * Same pruned walk as forEachPrunedCombo, but awaits the event loop every `yieldEvery` leaves.
 */
export async function forEachPrunedComboAsync(
  wardrobe,
  formalityFilter,
  visit,
  { maxAccessories = 2, topK = null, cap = MAX_COMBINATIONS, yieldEvery = 2000, signal = null } = {},
) {
  const tiers =
    formalityFilter && formalityFilter !== 'any'
      ? [formalityFilter]
      : ['casual', 'smart-casual', 'formal']

  let produced = 0
  let steps = 0

  for (const tier of tiers) {
    let pools = poolsForTier(wardrobe, tier)
    if (topK != null) {
      pools = {
        tops: takeTopKByPalette(pools.tops, topK),
        bottoms: takeTopKByPalette(pools.bottoms, topK),
        shoes: takeTopKByPalette(pools.shoes, topK),
        midLayers: takeTopKByPalette(pools.midLayers, topK),
        outerwear: takeTopKByPalette(pools.outerwear, topK),
        accessories: takeTopKByPalette(pools.accessories, topK),
      }
    } else {
      pools = {
        tops: rankItemsByPalette(pools.tops),
        bottoms: rankItemsByPalette(pools.bottoms),
        shoes: rankItemsByPalette(pools.shoes),
        midLayers: rankItemsByPalette(pools.midLayers),
        outerwear: rankItemsByPalette(pools.outerwear),
        accessories: rankItemsByPalette(pools.accessories),
      }
    }

    const midOptions = [null, ...pools.midLayers]
    const outerOptions = [null, ...pools.outerwear]
    const accSubsets = accessorySubsets(pools.accessories, maxAccessories)

    for (const top of pools.tops) {
      for (const bottom of pools.bottoms) {
        if (bottom.id === top.id) continue
        if (!colorBudgetAllows([top], bottom)) continue
        for (const shoe of pools.shoes) {
          if (idsConflict(new Set([top.id, bottom.id]), shoe)) continue
          if (!colorBudgetAllows([top, bottom], shoe)) continue
          for (const mid of midOptions) {
            if (idsConflict(new Set([top.id, bottom.id, shoe.id]), mid)) continue
            if (mid && !colorBudgetAllows([top, bottom, shoe], mid)) continue
            for (const outer of outerOptions) {
              const used = new Set([top.id, bottom.id, shoe.id, mid?.id].filter(Boolean))
              if (idsConflict(used, outer)) continue
              if (
                outer &&
                !colorBudgetAllows([top, bottom, shoe, mid].filter(Boolean), outer)
              ) {
                continue
              }
              for (const accs of accSubsets) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
                if (produced >= cap) return produced

                steps += 1
                if (yieldEvery > 0 && steps % yieldEvery === 0) {
                  await yieldToEventLoop()
                  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
                }

                const combo = {
                  top,
                  bottom,
                  shoes: shoe,
                  midLayer: mid,
                  outerwear: outer,
                  accessories: accs,
                }
                if (comboHasDuplicateSlots(combo)) continue

                let ok = true
                const built = [top, bottom, shoe]
                if (mid) built.push(mid)
                if (outer) built.push(outer)
                for (const acc of accs) {
                  if (!colorBudgetAllows(built, acc)) {
                    ok = false
                    break
                  }
                  built.push(acc)
                }
                if (!ok) continue
                if (distinctNonNeutralHexes(built).length > 2) continue

                combo.items = built
                produced += 1
                if (visit(combo) === false) return produced
                if (produced >= cap) return produced
              }
            }
          }
        }
      }
    }
  }
  return produced
}

/**
 * Async pruned generate with event-loop yields (UI). Supports AbortSignal.
 */
export async function generateOutfitsAsync(
  wardrobe,
  palette,
  formalityFilter = 'any',
  seasonFilter = 'any',
  weatherSeasons = null,
  { signal = null, yieldEvery = 2000 } = {},
) {
  if (!wardrobe?.length) return []

  const seasonFiltered = filterSeason(wardrobe, seasonFilter)
  const missingRequired = REQUIRED_SLOT_CATEGORIES.some(
    (category) => byCategory(seasonFiltered, category).length === 0,
  )
  if (missingRequired) return []

  const annotated = annotateWardrobeWithPalette(seasonFiltered, palette || [])
  const limits = planEnumerationLimits(annotated, formalityFilter, MAX_COMBINATIONS)
  const activeWeatherSeasons = weatherSeasons?.length ? weatherSeasons : null
  const scored = []

  await forEachPrunedComboAsync(
    annotated,
    formalityFilter,
    (combo) => {
      if (!passesSeasonFilter(combo, seasonFilter)) return undefined
      if (!passesFormalityFilter(combo, formalityFilter)) return undefined
      const outfit = scoreVisitedCombo(combo, activeWeatherSeasons)
      if (outfit) scored.push(outfit)
      return undefined
    },
    { ...limits, yieldEvery, signal },
  )

  return finalizeOutfits(scored)
}

export const CATEGORIES = [
  'top',
  'bottom',
  'shoes',
  'outerwear',
  'accessory',
  'mid-layer',
]
export const FORMALITIES = ['casual', 'smart-casual', 'formal']
export const SEASONS = ['spring', 'summer', 'fall', 'winter']
export const FITS = ['fitted', 'regular', 'relaxed']
export const WARMTHS = ['light', 'medium', 'heavy']
export const LENGTHS = ['cropped', 'regular', 'long']

export const FORMALITY_ORDER = {
  casual: 0,
  'smart-casual': 1,
  formal: 2,
}

export const WARMTH_ORDER = {
  light: 0,
  medium: 1,
  heavy: 2,
}

export const LENGTH_ORDER = {
  cropped: 0,
  regular: 1,
  long: 2,
}

const SHOE_FIT_LABELS = {
  fitted: 'sleek/low-profile',
  regular: 'standard',
  relaxed: 'chunky/platform',
}

export function normalizeCategories(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((entry) => CATEGORIES.includes(entry)))]
  }
  if (typeof value === 'string' && value && CATEGORIES.includes(value)) {
    return [value]
  }
  return []
}

export function itemHasCategory(item, category) {
  return normalizeCategories(item?.category).includes(category)
}

export function primaryCategory(item) {
  const cats = normalizeCategories(item?.category)
  if (!cats.length) return 'top'
  return cats.find((c) => c !== 'accessory' && c !== 'mid-layer') || cats[0]
}

/** First listed category — wardrobe grid home section (DATA-06). */
export function homeCategory(item) {
  const cats = normalizeCategories(item?.category)
  return cats[0] || 'top'
}

/** Additional roles shown as chips when the item lives under homeCategory. */
export function extraCategories(item) {
  const cats = normalizeCategories(item?.category)
  return cats.slice(1)
}

export function toggleCategory(categories, category) {
  const current = normalizeCategories(categories)
  const next = current.includes(category)
    ? current.filter((entry) => entry !== category)
    : [...current, category]
  return next.length ? next : current
}

export function normalizeFit(fit) {
  if (fit === 'fitted' || fit === 'relaxed') return fit
  return 'regular'
}

export function normalizeWarmth(warmth) {
  if (warmth === 'light' || warmth === 'heavy') return warmth
  return 'medium'
}

export function normalizeLength(length) {
  if (length === 'cropped' || length === 'long') return length
  return 'regular'
}

export function fitLabel(fit, categoryOrItem) {
  const value = normalizeFit(fit)
  const category =
    typeof categoryOrItem === 'string'
      ? categoryOrItem
      : primaryCategory(categoryOrItem || {})
  if (category === 'shoes') return SHOE_FIT_LABELS[value]
  return value
}

export function itemFitsSeason(item, seasonFilter) {
  if (!seasonFilter || seasonFilter === 'any') return true
  const seasons = item.seasons?.length ? item.seasons : SEASONS
  return seasons.includes(seasonFilter)
}

export function toggleSeason(seasons, season) {
  const current = seasons?.length ? seasons : []
  const next = current.includes(season)
    ? current.filter((entry) => entry !== season)
    : [...current, season]
  return next.length ? next : current
}

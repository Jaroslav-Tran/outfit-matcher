export const CATEGORIES = ['top', 'bottom', 'shoes', 'outerwear', 'accessory']
export const FORMALITIES = ['casual', 'smart-casual', 'formal']
export const SEASONS = ['spring', 'summer', 'fall', 'winter']
export const FITS = ['fitted', 'regular', 'relaxed']

const SHOE_FIT_LABELS = {
  fitted: 'sleek/low-profile',
  regular: 'standard',
  relaxed: 'chunky/platform',
}

export function normalizeFit(fit) {
  if (fit === 'fitted' || fit === 'relaxed') return fit
  return 'regular'
}

export function fitLabel(fit, category) {
  const value = normalizeFit(fit)
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

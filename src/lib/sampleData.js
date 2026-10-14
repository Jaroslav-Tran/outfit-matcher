import { isSuggestedNeutral } from './colorUtils.js'
import { solidColorPngDataUrl } from './imageUtils.js'

function placeholderImage(hex) {
  return solidColorPngDataUrl(hex)
}

export const DEFAULT_PALETTE = [
  { hex: '#D5BBA7', label: 'Warm Sand' },
  { hex: '#BD996F', label: 'Caramel Latte' },
  { hex: '#8E9B76', label: 'Rich Olive' },
  { hex: '#BA815E', label: 'Copper Rose' },
  { hex: '#708A6D', label: 'Deep Sage' },
  { hex: '#4E8288', label: 'Muted Teal' },
  { hex: '#4D648F', label: 'Warm Navy' },
  { hex: '#735742', label: 'Chocolate Bronze' },
  { hex: '#EEE0D1', label: 'Cream Whisper' },
  { hex: '#DCAB3F', label: 'Saffron Glow' },
  { hex: '#C497A6', label: 'Dusty Rose' },
  { hex: '#979797', label: 'Stone Gray' },
]

function piece({ hex, label, category, formality, seasons, isNeutral, fit = 'regular' }) {
  return {
    id: crypto.randomUUID(),
    imageUrl: placeholderImage(hex),
    hex,
    category: Array.isArray(category) ? category : [category],
    formality,
    fit,
    seasons: [...seasons],
    isNeutral: isNeutral ?? isSuggestedNeutral(hex),
    label,
  }
}

export function createSampleData() {
  const palette = DEFAULT_PALETTE.map((color) => ({
    ...color,
    id: crypto.randomUUID(),
  }))

  const wardrobe = [
    piece({
      hex: '#EEE0D1',
      label: 'Cream Whisper tee',
      caption: 'Cream tee',
      category: 'top',
      formality: 'casual',
      seasons: ['spring', 'summer'],
      isNeutral: true,
    }),
    piece({
      hex: '#708A6D',
      label: 'Deep Sage linen shirt',
      caption: 'Sage shirt',
      category: 'top',
      formality: 'casual',
      seasons: ['spring', 'summer'],
      isNeutral: false,
    }),
    piece({
      hex: '#BA815E',
      label: 'Copper Rose tee',
      caption: 'Copper tee',
      category: 'top',
      formality: 'casual',
      seasons: ['spring', 'summer'],
      isNeutral: false,
    }),
    piece({
      hex: '#D5BBA7',
      label: 'Warm Sand chinos',
      caption: 'Sand chinos',
      category: 'bottom',
      formality: 'casual',
      seasons: ['spring', 'summer', 'fall'],
      isNeutral: true,
    }),
    piece({
      hex: '#EEE0D1',
      label: 'Cream Whisper sneakers',
      caption: 'Cream sneakers',
      category: 'shoes',
      formality: 'casual',
      seasons: ['spring', 'summer', 'fall', 'winter'],
      isNeutral: true,
    }),
    piece({
      hex: '#4E8288',
      label: 'Muted Teal tote',
      caption: 'Teal tote',
      category: 'accessory',
      formality: 'casual',
      seasons: ['spring', 'summer'],
      isNeutral: false,
    }),
    piece({
      hex: '#4D648F',
      label: 'Warm Navy knit sweater',
      caption: 'Navy knit',
      category: 'top',
      formality: 'casual',
      seasons: ['fall', 'winter'],
      isNeutral: false,
    }),
    piece({
      hex: '#8E9B76',
      label: 'Rich Olive trousers',
      caption: 'Olive pants',
      category: 'bottom',
      formality: 'casual',
      seasons: ['spring', 'summer', 'fall', 'winter'],
      isNeutral: false,
    }),
    piece({
      hex: '#735742',
      label: 'Chocolate Bronze trousers',
      caption: 'Bronze pants',
      category: 'bottom',
      formality: 'casual',
      seasons: ['fall', 'winter'],
      isNeutral: true,
    }),
    piece({
      hex: '#735742',
      label: 'Chocolate Bronze boots',
      caption: 'Bronze boots',
      category: 'shoes',
      formality: 'casual',
      seasons: ['fall', 'winter'],
      isNeutral: true,
    }),
    piece({
      hex: '#DCAB3F',
      label: 'Saffron Glow scarf',
      caption: 'Saffron scarf',
      category: 'accessory',
      formality: 'casual',
      seasons: ['spring', 'fall', 'winter'],
      isNeutral: false,
    }),
    piece({
      hex: '#979797',
      label: 'Stone Gray sweater',
      caption: 'Gray sweater',
      category: 'top',
      formality: 'casual',
      seasons: ['fall', 'winter'],
      isNeutral: true,
    }),
    piece({
      hex: '#C497A6',
      label: 'Dusty Rose blouse',
      caption: 'Rose blouse',
      category: 'top',
      formality: 'smart-casual',
      seasons: ['spring', 'summer', 'fall'],
      isNeutral: false,
    }),
    piece({
      hex: '#4D648F',
      label: 'Warm Navy trousers',
      caption: 'Navy pants',
      category: 'bottom',
      formality: 'smart-casual',
      seasons: ['spring', 'summer', 'fall', 'winter'],
      isNeutral: true,
    }),
    piece({
      hex: '#BD996F',
      label: 'Caramel Latte loafers',
      caption: 'Caramel loafers',
      category: 'shoes',
      formality: 'smart-casual',
      seasons: ['spring', 'fall', 'winter'],
      isNeutral: true,
    }),
  ]

  return { palette, wardrobe }
}

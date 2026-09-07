export const EXPERIENCE_STORAGE_KEY = 'hurt-experience-journal-v1'

const cleanText = (value, length = 500) => String(value || '').trim().slice(0, length)
const finiteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null

export const normalizeExperience = (entry = {}) => ({
  id: cleanText(entry.id, 80) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: cleanText(entry.createdAt, 40) || new Date().toISOString(),
  material: ['EPS', 'XPS', 'EPP', 'Інше'].includes(entry.material) ? entry.material : 'EPS',
  thicknessMm: finiteNumber(entry.thicknessMm),
  wireDiameterMm: finiteNumber(entry.wireDiameterMm),
  feed: finiteNumber(entry.feed),
  heatPercent: finiteNumber(entry.heatPercent),
  result: ['Добре', 'Потребує корекції', 'Невдало'].includes(entry.result) ? entry.result : 'Добре',
  note: cleanText(entry.note)
})

export const loadExperiences = storage => {
  try {
    const parsed = JSON.parse(storage.getItem(EXPERIENCE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.slice(0, 100).map(normalizeExperience) : []
  } catch { return [] }
}

export const saveExperiences = (storage, entries) => {
  const normalized = entries.slice(0, 100).map(normalizeExperience)
  storage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export const formatExperienceForAi = (entries, limit = 10) => {
  if (!entries.length) return 'Практичний досвід ще не записано.'
  return entries.slice(0, limit).map((entry, index) => [
    `${index + 1}. ${entry.createdAt.slice(0, 10)} — ${entry.material}, ${entry.thicknessMm ?? '?'} мм`,
    `струна ${entry.wireDiameterMm ?? '?'} мм, F${entry.feed ?? '?'}, нагрів ${entry.heatPercent ?? '?'}%, результат: ${entry.result}`,
    entry.note ? `примітка: ${entry.note}` : ''
  ].filter(Boolean).join('; ')).join('\n')
}

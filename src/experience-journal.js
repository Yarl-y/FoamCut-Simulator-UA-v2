export const EXPERIENCE_STORAGE_KEY = 'hurt-experience-journal-v1'
export const CUT_STAGES = ['Підготовка', 'Холодний прогін', 'Пробний різ', 'Робочий різ']

const cleanText = (value, length = 500) => String(value || '').trim().slice(0, length)
const finiteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null

export const normalizeExperience = (entry = {}) => ({
  id: cleanText(entry.id, 80) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: cleanText(entry.createdAt, 40) || new Date().toISOString(),
  updatedAt: cleanText(entry.updatedAt, 40) || cleanText(entry.createdAt, 40) || new Date().toISOString(),
  cutStage: CUT_STAGES.includes(entry.cutStage) ? entry.cutStage : 'Пробний різ',
  cutType: ['Конус', 'Крило', 'Інше'].includes(entry.cutType) ? entry.cutType : 'Інше',
  ncFile: cleanText(entry.ncFile, 180),
  material: ['EPS', 'XPS', 'EPP', 'Інше'].includes(entry.material) ? entry.material : 'EPS',
  thicknessMm: finiteNumber(entry.thicknessMm),
  wireDiameterMm: finiteNumber(entry.wireDiameterMm),
  feed: finiteNumber(entry.feed),
  heatPercent: finiteNumber(entry.heatPercent),
  largeKerfMm: finiteNumber(entry.largeKerfMm),
  smallKerfMm: finiteNumber(entry.smallKerfMm),
  synchronyPercent: finiteNumber(entry.synchronyPercent),
  result: ['Не оцінено', 'Добре', 'Потребує корекції', 'Невдало'].includes(entry.result) ? entry.result : 'Не оцінено',
  dimensions: cleanText(entry.dimensions, 400),
  surface: cleanText(entry.surface, 400),
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

export const mergeExperiences = (current, imported) => {
  if (!Array.isArray(imported)) throw new Error('У файлі немає списку карток.')
  const byId = new Map(current.map(entry => [entry.id, normalizeExperience(entry)]))
  for (const raw of imported.slice(0, 100)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.id) continue
    const entry = normalizeExperience(raw)
    const existing = byId.get(entry.id)
    if (!existing || Date.parse(entry.updatedAt) > Date.parse(existing.updatedAt)) byId.set(entry.id, entry)
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 100)
}

export const formatExperienceForAi = (entries, limit = 10) => {
  const verified = entries.filter(entry => ['Пробний різ', 'Робочий різ'].includes(entry.cutStage) && entry.result !== 'Не оцінено')
  if (!verified.length) return 'Практичний досвід ще не записано або контрольні різи ще не оцінено.'
  return verified.slice(0, limit).map((entry, index) => [
    `${index + 1}. ${entry.createdAt.slice(0, 10)} — ${entry.cutType}, NC: ${entry.ncFile || 'не зазначено'}, ${entry.material}, ${entry.thicknessMm ?? '?'} мм`,
    `струна ${entry.wireDiameterMm ?? '?'} мм, F${entry.feed ?? '?'}, нагрів ${entry.heatPercent ?? '?'}%, результат: ${entry.result}`,
    entry.largeKerfMm !== null || entry.smallKerfMm !== null
      ? `пропал: великий контур ${entry.largeKerfMm ?? '?'} мм, малий контур ${entry.smallKerfMm ?? '?'} мм, синхронність ${entry.synchronyPercent ?? '?'}%`
      : '',
    entry.dimensions ? `виміри: ${entry.dimensions}` : '',
    entry.surface ? `поверхня: ${entry.surface}` : '',
    entry.note ? `примітка: ${entry.note}` : ''
  ].filter(Boolean).join('; ')).join('\n')
}

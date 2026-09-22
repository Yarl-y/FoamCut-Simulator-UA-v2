import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPERIENCE_STORAGE_KEY, formatExperienceForAi, loadExperiences, mergeExperiences, normalizeExperience, saveExperiences } from '../src/experience-journal.js'

const memoryStorage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('experience journal normalizes, saves and loads safe values', () => {
  const storage = memoryStorage()
  const saved = saveExperiences(storage, [{ material: 'XPS', thicknessMm: '100', feed: '300', heatPercent: '42', result: 'Добре', note: 'Чистий зріз' }])
  assert.equal(saved[0].thicknessMm, 100)
  assert.equal(loadExperiences(storage)[0].note, 'Чистий зріз')
  assert.ok(storage.getItem(EXPERIENCE_STORAGE_KEY))
  assert.equal(normalizeExperience({ material: 'невідомо' }).material, 'EPS')
})

test('experience journal creates compact AI context', () => {
  const text = formatExperienceForAi([normalizeExperience({ material: 'EPS', thicknessMm: 80, wireDiameterMm: 0.3, feed: 250, heatPercent: 40,
    largeKerfMm: 0.8, smallKerfMm: 1.2, synchronyPercent: 20, result: 'Добре' })])
  assert.match(text, /EPS, 80 мм/)
  assert.match(text, /F250/)
  assert.match(text, /великий контур 0\.8 мм/)
  assert.match(text, /малий контур 1\.2 мм/)
  assert.match(text, /синхронність 20%/)
  assert.match(formatExperienceForAi([]), /ще не записано/)
})

test('control cut cards preserve NC, measurements and editable stage', () => {
  const storage = memoryStorage()
  const planned = saveExperiences(storage, [{
    cutType: 'Конус', cutStage: 'Підготовка', ncFile: 'конус.nc',
    dimensions: 'очікується 200×200 мм', result: 'Не оцінено'
  }])[0]
  assert.equal(loadExperiences(storage)[0].ncFile, 'конус.nc')
  assert.match(formatExperienceForAi([planned]), /ще не записано/)
  const completed = normalizeExperience({ ...planned, cutStage: 'Пробний різ', result: 'Добре',
    dimensions: '200×200 мм', surface: 'чистий зріз' })
  assert.equal(completed.id, planned.id)
  assert.match(formatExperienceForAi([completed]), /конус\.nc/)
  assert.match(formatExperienceForAi([completed]), /поверхня: чистий зріз/)
})

test('old journal entries remain practical cuts', () => {
  const legacy = normalizeExperience({ material: 'EPS', result: 'Добре', note: 'Старий запис' })
  assert.equal(legacy.cutStage, 'Пробний різ')
  assert.match(formatExperienceForAi([legacy]), /Старий запис/)
})

test('import merges cards without duplicating and keeps a newer edit', () => {
  const older = normalizeExperience({ id: 'one', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', ncFile: 'cone.nc', cutStage: 'Підготовка' })
  const newer = { ...older, updatedAt: '2026-09-19T10:00:00.000Z', cutStage: 'Пробний різ', result: 'Добре' }
  const merged = mergeExperiences([older], [newer])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].cutStage, 'Пробний різ')
  assert.throws(() => mergeExperiences([], {}), /немає списку карток/)
})

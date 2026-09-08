import test from 'node:test'
import assert from 'node:assert/strict'
import { EXPERIENCE_STORAGE_KEY, formatExperienceForAi, loadExperiences, normalizeExperience, saveExperiences } from '../src/experience-journal.js'

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

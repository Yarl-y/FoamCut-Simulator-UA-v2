const positiveNumber = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} має бути більшим за нуль`)
  return number
}

export const createBlockPlanFile = (blocks, corridor) => ({
  format: 'foamcut-block-plan',
  version: 1,
  savedAt: new Date().toISOString(),
  corridor: Math.max(0, Number(corridor) || 0),
  blocks: blocks.map((block, index) => ({
    name: String(block.name || `Блок ${index + 1}`),
    width: positiveNumber(block.width, `Блок ${index + 1}, ширина`),
    height: positiveNumber(block.height, `Блок ${index + 1}, висота`),
    thickness: positiveNumber(block.thickness, `Блок ${index + 1}, товщина`),
    columns: Math.max(1, Math.floor(positiveNumber(block.columns, `Блок ${index + 1}, стовпці`)))
  }))
})

export const parseBlockPlanFile = text => {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('Файл не є коректним JSON') }
  if (data?.format !== 'foamcut-block-plan' || data?.version !== 1) {
    throw new Error('Це не план блоків FoamCut Simulator')
  }
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('План не містить блоків')
  return createBlockPlanFile(data.blocks, data.corridor)
}

const positiveNumber = (value, label) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} має бути більшим за нуль`)
  return number
}

export const createBlockPlanFile = (blocks, corridor, assignments = [], options = {}) => ({
  format: 'foamcut-block-plan',
  version: 2,
  savedAt: new Date().toISOString(),
  corridor: Math.max(0, Number(corridor) || 0),
  blocks: blocks.map((block, index) => ({
    name: String(block.name || `Блок ${index + 1}`),
    width: positiveNumber(block.width, `Блок ${index + 1}, ширина`),
    height: positiveNumber(block.height, `Блок ${index + 1}, висота`),
    thickness: positiveNumber(block.thickness, `Блок ${index + 1}, товщина`),
    columns: Math.max(1, Math.floor(positiveNumber(block.columns, `Блок ${index + 1}, стовпці`)))
  })),
  assignments: assignments.map((assignment, index) => ({
    partId: Math.max(1, Math.floor(positiveNumber(assignment.partId, `Закріплення ${index + 1}, деталь`))),
    blockNumber: Math.max(1, Math.floor(positiveNumber(assignment.blockNumber, `Закріплення ${index + 1}, блок`))),
    slot: assignment.slot == null ? null : Math.max(0, Math.floor(Number(assignment.slot)))
  })).filter(assignment => assignment.blockNumber <= blocks.length),
  manualPlacements: (options.manualPlacements || []).map((placement, index) => ({
    partId: Math.max(1, Math.floor(positiveNumber(placement.partId, `Ручна секція ${index + 1}`))),
    blockNumber: Math.max(1, Math.floor(positiveNumber(placement.blockNumber, `Блок ручної секції ${index + 1}`))),
    centerX: Number(placement.centerX), centerY: Number(placement.centerY),
    turns: ((Math.floor(Number(placement.turns) || 0) % 4) + 4) % 4,
    mirrorX: Boolean(placement.mirrorX), mirrorY: Boolean(placement.mirrorY)
  })).filter(placement => placement.blockNumber <= blocks.length
    && Number.isFinite(placement.centerX) && Number.isFinite(placement.centerY)),
  manualRoutes: (options.manualRoutes || []).map(route => ({
    blockNumber: Math.max(1, Math.floor(positiveNumber(route.blockNumber, 'Блок ручного маршруту'))),
    steps: (route.steps || []).map(step => step.type === 'section'
      ? { type: 'section', partId: Math.max(1, Math.floor(positiveNumber(step.partId, 'Секція маршруту'))),
        ...(step.entryHint && Number.isFinite(Number(step.entryHint.x)) && Number.isFinite(Number(step.entryHint.y))
          && ['left', 'right'].includes(step.entryHint.side)
          ? { entryHint: { x: Number(step.entryHint.x), y: Number(step.entryHint.y), side: step.entryHint.side } }
          : {}) }
      : step.type === 'home' ? { type: 'home' }
        : step.type === 'exitBottom' ? { type: 'exitBottom' }
        : { type: 'point', x: Number(step.x), y: Number(step.y) })
      .filter(step => step.type !== 'point' || (Number.isFinite(step.x) && Number.isFinite(step.y)))
  })).filter(route => route.blockNumber <= blocks.length)
})

export const parseBlockPlanFile = text => {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('Файл не є коректним JSON') }
  if (data?.format !== 'foamcut-block-plan' || ![1, 2].includes(data?.version)) {
    throw new Error('Це не план блоків FoamCut Simulator')
  }
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('План не містить блоків')
  return createBlockPlanFile(data.blocks, data.corridor,
    Array.isArray(data.assignments) ? data.assignments : [],
    { manualPlacements: Array.isArray(data.manualPlacements) ? data.manualPlacements : [],
      manualRoutes: Array.isArray(data.manualRoutes) ? data.manualRoutes : [] })
}

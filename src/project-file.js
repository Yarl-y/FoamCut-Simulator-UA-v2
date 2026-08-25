const sanitizePoints = (points, label) => {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error(`У проєкті відсутній профіль ${label}`)
  }

  return points.map((point, index) => {
    const x = Number(point?.x)
    const y = Number(point?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Некоректна точка ${index + 1} профілю ${label}`)
    }
    return { x, y }
  })
}

export const createFoamCutProject = ({ settings, leftPoints, rightPoints }) => ({
  format: 'FoamCut Simulator Project',
  version: 1,
  savedAt: new Date().toISOString(),
  settings: { ...settings },
  profiles: {
    left: leftPoints.map(point => ({ x: point.x, y: point.y })),
    right: rightPoints.map(point => ({ x: point.x, y: point.y }))
  }
})

export const parseFoamCutProject = text => {
  let project
  try {
    project = JSON.parse(text)
  } catch {
    throw new Error('Файл проєкту не є коректним JSON')
  }

  if (project?.format !== 'FoamCut Simulator Project' || project.version !== 1) {
    throw new Error('Непідтримуваний формат або версія проєкту')
  }

  const leftPoints = sanitizePoints(project.profiles?.left, 'X/Y')
  const rightPoints = sanitizePoints(project.profiles?.right, 'A/Z')
  if (leftPoints.length !== rightPoints.length) {
    throw new Error('Кількість точок X/Y та A/Z у проєкті не збігається')
  }

  return {
    settings: project.settings && typeof project.settings === 'object' ? project.settings : {},
    leftPoints,
    rightPoints,
    savedAt: project.savedAt || null
  }
}

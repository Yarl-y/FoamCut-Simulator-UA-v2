const station = (id, name, position, width, height, lift = 0, upperFullness = 1, lowerFullness = 1, bottomFlatness = 0) => ({
  id, name, position, width, height, lift, upperFullness, lowerFullness, bottomFlatness
})

const sections = (count, hollowFrom = Infinity) => Array.from({ length: count }, (_, index) => ({
  hollow: index >= hollowFrom,
  wallThickness: 5,
  bottomThickness: 8
}))

export const builtinFuselageTemplates = [
  {
    id: 'glider', name: 'Планерний', builtin: true,
    description: 'Плавний планерний фюзеляж із повною кабіною та тонкою хвостовою балкою.',
    length: 900, width: 140, height: 160,
    stations: [
      station('nose', 'Ніс', 0, 0.18, 0.2, 0.3),
      station('cabin', 'Кабіна', 0.28, 1, 1),
      station('middle', 'Середина', 0.62, 0.78, 0.72, 0.04),
      station('tail', 'Хвіст', 1, 0.26, 0.28, 0.2)
    ],
    sectionSettings: sections(3),
    tube: { enabled: false, diameter: 8, clearance: 0.4, height: 70, sideOffset: 0, start: 0, length: 850 }
  },
  {
    id: 'bixler', name: 'Bixler-подібний', builtin: true,
    description: 'Фюзеляж мотопланера з об’ємною кабіною, верхньою моторною зоною та витягнутим хвостом.',
    length: 900, width: 150, height: 175,
    stations: [
      station('nose', 'Ніс', 0, 0.2, 0.22, 0.28, 0.88, 1, 0.05),
      station('cockpit-front', 'Перед кабіною', 0.14, 0.78, 0.82, 0.08, 1.08, 1, 0.08),
      station('cockpit', 'Кабіна', 0.3, 1, 1, 0, 1.12, 1, 0.12),
      station('wing', 'Крило', 0.46, 0.9, 0.82, 0.02, 1, 1, 0.18),
      station('motor', 'Мотор', 0.58, 0.72, 0.78, 0.13, 1.18, 0.92, 0.08),
      station('boom', 'Хвостова балка', 0.76, 0.46, 0.48, 0.18),
      station('tail', 'Хвіст', 1, 0.22, 0.24, 0.24)
    ],
    sectionSettings: sections(6, 1),
    tube: { enabled: true, diameter: 8, clearance: 0.4, height: 72, sideOffset: 0, start: 120, length: 720 }
  },
  {
    id: 'classic-motor', name: 'Класичний моторний', builtin: true,
    description: 'Пряміша носова частина під передній двигун, містка середина та плавний перехід до хвоста.',
    length: 820, width: 155, height: 170,
    stations: [
      station('firewall', 'Моторама', 0, 0.72, 0.72, 0.05, 0.9, 1, 0.25),
      station('nose', 'Капот', 0.16, 0.88, 0.82, 0.03, 0.94, 1, 0.2),
      station('cabin', 'Кабіна', 0.34, 1, 1, 0, 1.05, 1, 0.16),
      station('wing', 'За крилом', 0.55, 0.82, 0.76, 0.05, 1, 1, 0.12),
      station('boom', 'Балка', 0.78, 0.45, 0.46, 0.16),
      station('tail', 'Хвіст', 1, 0.24, 0.28, 0.22)
    ],
    sectionSettings: sections(5, 1),
    tube: { enabled: true, diameter: 8, clearance: 0.4, height: 68, sideOffset: 0, start: 100, length: 650 }
  },
  {
    id: 'motor-glider', name: 'Мотопланер', builtin: true,
    description: 'Тонкий планерний корпус зі збільшеною центральною зоною під крило, акумулятор і силову установку.',
    length: 1050, width: 135, height: 155,
    stations: [
      station('nose', 'Ніс', 0, 0.15, 0.18, 0.28),
      station('battery', 'Акумулятор', 0.18, 0.86, 0.82, 0.06, 1.05, 1, 0.08),
      station('cabin', 'Кабіна', 0.34, 1, 1),
      station('wing', 'Крило', 0.5, 0.8, 0.7, 0.06),
      station('boom', 'Балка', 0.76, 0.4, 0.42, 0.18),
      station('tail', 'Хвіст', 1, 0.2, 0.22, 0.25)
    ],
    sectionSettings: sections(5, 1),
    tube: { enabled: true, diameter: 8, clearance: 0.4, height: 66, sideOffset: 0, start: 100, length: 900 }
  },
  {
    id: 'custom-base', name: 'Користувацька основа', builtin: true,
    description: 'Нейтральна форма для побудови власного фюзеляжу зі станцій.',
    length: 900, width: 150, height: 150,
    stations: [
      station('start', 'Ніс', 0, 0.25, 0.25, 0.2),
      station('front', 'Передня', 0.25, 1, 1),
      station('rear', 'Задня', 0.65, 0.7, 0.7, 0.08),
      station('end', 'Хвіст', 1, 0.25, 0.25, 0.2)
    ],
    sectionSettings: sections(3),
    tube: { enabled: false, diameter: 8, clearance: 0.4, height: 65, sideOffset: 0, start: 0, length: 850 }
  }
]

const STORAGE_KEY = 'foamcut-user-fuselage-templates-v1'

export const cloneFuselageTemplate = template => JSON.parse(JSON.stringify(template))

export const loadUserFuselageTemplates = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(template => template && typeof template.name === 'string' && Array.isArray(template.stations))
      .map(template => ({ ...cloneFuselageTemplate(template), builtin: false }))
  } catch {
    return []
  }
}

export const saveUserFuselageTemplates = templates => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.map(template => ({
    ...cloneFuselageTemplate(template), builtin: false
  }))))
}

import './style.css'
import { parseDxf, renderDxfPreview, resampleDxfContour } from './dxf.js'

document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>FoamCut Simulator</h1>
    <p>Симулятор піноріза — 4 осі</p>

    <div>
      <input type="file" id="ncFile" accept=".nc,.tap,.gcode,.txt">
      <button id="load">Завантажити NC</button>
    </div>

    <section id="dxfProfiles" class="dxf-profiles">
      <h2>Профілі DXF</h2>
      <label class="dxf-point-count">Синхронізованих точок траєкторії
        <input id="dxfPointCount" type="number" min="2" step="1" value="200">
      </label>
      <div class="cut-planning-controls">
        <label>Режим різання
          <select id="cutPassMode">
            <option value="single">Один прохід — повний контур</option>
            <option value="double">Два проходи — верх і низ</option>
          </select>
        </label>
        <label>Підхід і вихід, мм
          <input id="leadDistance" type="number" min="0" step="1" value="20">
        </label>
        <label>Швидкість різання, мм/хв
          <input id="cutFeedRate" type="number" min="1" step="10" value="300">
        </label>
      </div>
      <div class="dxf-profile-grid">
        <section id="dxfLeftPanel" class="dxf-profile-panel" data-side="left">
          <h3>Кореневий профіль X/Y</h3>
          <div><input type="file" id="dxfLeftFile" accept=".dxf">
            <button id="loadDxfLeft">Завантажити X/Y</button></div>
          <svg id="dxfLeftSvg" viewBox="0 0 800 500" width="800" height="500"
               style="border:1px solid #888"></svg>
          <p id="dxfLeftStatus">DXF X/Y ще не завантажено</p>
          <div id="dxfLeftTools" class="dxf-tools" hidden>
            <label>Контур <select id="dxfLeftContour"></select></label>
            <label>Початкова точка <input id="dxfLeftStart" type="number" min="0" step="1" value="0"></label>
            <label><input id="dxfLeftReverse" type="checkbox"> Зворотний напрямок</label>
            <button id="assignDxfLeft">Призначити X/Y</button>
          </div>
        </section>
        <section id="dxfRightPanel" class="dxf-profile-panel" data-side="right">
          <h3>Крайовий профіль A/Z</h3>
          <div><input type="file" id="dxfRightFile" accept=".dxf">
            <button id="loadDxfRight">Завантажити A/Z</button></div>
          <svg id="dxfRightSvg" viewBox="0 0 800 500" width="800" height="500"
               style="border:1px solid #888"></svg>
          <p id="dxfRightStatus">DXF A/Z ще не завантажено</p>
          <div id="dxfRightTools" class="dxf-tools" hidden>
            <label>Контур <select id="dxfRightContour"></select></label>
            <label>Початкова точка <input id="dxfRightStart" type="number" min="0" step="1" value="0"></label>
            <label><input id="dxfRightReverse" type="checkbox"> Зворотний напрямок</label>
            <button id="assignDxfRight">Призначити A/Z</button>
          </div>
        </section>
      </div>
      <p id="dxfAssignmentStatus">Профілі ще не призначені</p>
    </section>

    <h2>Траєкторія різання</h2>

    <svg id="trajectory"
         viewBox="0 0 800 500"
         width="800"
         height="500"
         style="border:1px solid #888">
    </svg>

    <p id="status">Виберіть NC-файл</p>
  </div>
`

const view3d = document.getElementById('view3d')

view3d.innerHTML = `
  <h2>Просторовий вигляд струни</h2>
  <div class="three-d-controls">
    <div class="dimension-controls">
      <label>Довжина піноблока, мм <input id="foamLength" type="number" min="1" step="1" value="500"></label>
      <label>Ширина піноблока, мм <input id="foamWidth" type="number" min="1" step="1" value="200"></label>
      <label>Висота піноблока, мм <input id="foamHeight" type="number" min="1" step="1" value="100"></label>
      <label>Відступ по довжині, мм <input id="profileLengthOffset" type="number" min="0" step="1" value="0"></label>
      <label>Відступ по висоті, мм <input id="profileHeightOffset" type="number" min="0" step="1" value="0"></label>
    </div>
    <div class="animation-controls">
      <button id="pause3d">Пауза</button>
      <button id="stop3d">Стоп</button>
      <button id="reset3d">На початок</button>
      <label>Швидкість <input id="speed3d" type="range" min="1" max="100" value="25"></label>
    </div>
  </div>
  <svg id="svg3d" width="800" height="500" style="border:1px solid #999"></svg>
`

const fileInput = document.querySelector('#ncFile')
const loadButton = document.querySelector('#load')
const dxfPointCountInput = document.querySelector('#dxfPointCount')
const cutPassModeInput = document.querySelector('#cutPassMode')
const leadDistanceInput = document.querySelector('#leadDistance')
const cutFeedRateInput = document.querySelector('#cutFeedRate')
const dxfAssignmentStatus = document.querySelector('#dxfAssignmentStatus')
const svg = document.querySelector('#trajectory')
const status = document.querySelector('#status')
const foamLengthInput = document.getElementById('foamLength')
const foamWidthInput = document.getElementById('foamWidth')
const foamHeightInput = document.getElementById('foamHeight')
const profileLengthOffsetInput = document.getElementById('profileLengthOffset')
const profileHeightOffsetInput = document.getElementById('profileHeightOffset')
const svg3d = document.getElementById('svg3d')
const pause3d = document.getElementById('pause3d')
const stop3d = document.getElementById('stop3d')
const reset3d = document.getElementById('reset3d')
const speed3d = document.getElementById('speed3d')
let renderActiveFoamBlock = null
const preparedDxfProfiles = { left: null, right: null }
const cuttingSettings = { feedRate: 300 }
const dxfSides = {
  left: {
    label: 'X/Y',
    model: null,
    fileInput: document.querySelector('#dxfLeftFile'),
    loadButton: document.querySelector('#loadDxfLeft'),
    svg: document.querySelector('#dxfLeftSvg'),
    status: document.querySelector('#dxfLeftStatus'),
    tools: document.querySelector('#dxfLeftTools'),
    contourSelect: document.querySelector('#dxfLeftContour'),
    startInput: document.querySelector('#dxfLeftStart'),
    reverseInput: document.querySelector('#dxfLeftReverse'),
    assignButton: document.querySelector('#assignDxfLeft')
  },
  right: {
    label: 'A/Z',
    model: null,
    fileInput: document.querySelector('#dxfRightFile'),
    loadButton: document.querySelector('#loadDxfRight'),
    svg: document.querySelector('#dxfRightSvg'),
    status: document.querySelector('#dxfRightStatus'),
    tools: document.querySelector('#dxfRightTools'),
    contourSelect: document.querySelector('#dxfRightContour'),
    startInput: document.querySelector('#dxfRightStart'),
    reverseInput: document.querySelector('#dxfRightReverse'),
    assignButton: document.querySelector('#assignDxfRight')
  }
}

const updateFoamBlockDimensions = () => {
  if (renderActiveFoamBlock) renderActiveFoamBlock()
}

foamLengthInput.addEventListener('input', updateFoamBlockDimensions)
foamWidthInput.addEventListener('input', updateFoamBlockDimensions)
foamHeightInput.addEventListener('input', updateFoamBlockDimensions)
profileLengthOffsetInput.addEventListener('input', updateFoamBlockDimensions)
profileHeightOffsetInput.addEventListener('input', updateFoamBlockDimensions)

const getSelectedDxfContour = side => {
  const state = dxfSides[side]
  if (!state.model) return null
  return state.model.contours[Number(state.contourSelect.value)] || null
}

const refreshDxfContourPreview = side => {
  const state = dxfSides[side]
  const contour = getSelectedDxfContour(side)
  if (!contour) return

  state.startInput.max = Math.max(0, contour.points.length - 1)
  const startIndex = Math.min(
    Math.max(0, Number(state.startInput.value) || 0),
    contour.points.length - 1
  )
  state.startInput.value = startIndex
  renderDxfPreview(state.svg, state.model, {
    contour,
    startIndex,
    reverse: state.reverseInput.checked
  })
}

const updateDxfAssignmentStatus = () => {
  const left = preparedDxfProfiles.left
    ? `${preparedDxfProfiles.left.points.length} точок`
    : 'не призначено'
  const right = preparedDxfProfiles.right
    ? `${preparedDxfProfiles.right.points.length} точок`
    : 'не призначено'
  dxfAssignmentStatus.textContent = `X/Y: ${left}; A/Z: ${right}`
}

const interpolateMove = (start, end, segmentCount = 12) => Array.from(
  { length: segmentCount },
  (_, index) => {
    const ratio = (index + 1) / segmentCount
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio
    }
  }
)

const getOutsidePoint = (points, point, distance) => {
  const center = points.reduce((sum, current) => ({
    x: sum.x + current.x / points.length,
    y: sum.y + current.y / points.length
  }), { x: 0, y: 0 })
  const dx = point.x - center.x
  const dy = point.y - center.y
  const vectorLength = Math.hypot(dx, dy) || 1

  return {
    x: point.x + dx / vectorLength * distance,
    y: point.y + dy / vectorLength * distance
  }
}

const buildCuttingPath = points => {
  if (points.length < 2) return points.map(point => ({ ...point }))

  let orderedPoints = points
  if (cutPassModeInput.value === 'double') {
    const half = Math.floor(points.length / 2)
    const averageY = surface => surface.reduce((sum, point) => sum + point.y, 0)
      / Math.max(surface.length, 1)
    const firstAverageY = averageY(points.slice(0, half + 1))
    const secondAverageY = averageY(points.slice(half))

    if (firstAverageY < secondAverageY) {
      orderedPoints = [points[0], ...points.slice(1).reverse()]
    }
  }

  const leadDistance = Math.max(0, Number(leadDistanceInput.value) || 0)
  const start = orderedPoints[0]
  const splitIndex = Math.floor(orderedPoints.length / 2)
  const opposite = orderedPoints[splitIndex]
  const outsideStart = getOutsidePoint(orderedPoints, start, leadDistance)
  const approachStart = [outsideStart, ...interpolateMove(outsideStart, start)]

  if (cutPassModeInput.value === 'double') {
    const outsideOpposite = getOutsidePoint(orderedPoints, opposite, leadDistance)
    const firstSurface = orderedPoints.slice(1, splitIndex + 1)
    const exitFirst = interpolateMove(opposite, outsideOpposite)
    const enterSecond = interpolateMove(outsideOpposite, opposite)
    const secondSurface = orderedPoints.slice(splitIndex + 1)
    const closeAtStart = [{ ...start }]
    const exitSecond = interpolateMove(start, outsideStart)

    return [
      ...approachStart,
      ...firstSurface,
      ...exitFirst,
      ...enterSecond,
      ...secondSurface,
      ...closeAtStart,
      ...exitSecond
    ]
  }

  return [
    ...approachStart,
    ...orderedPoints.slice(1),
    { ...start },
    ...interpolateMove(start, outsideStart)
  ]
}

const renderPreparedDxfSimulation = () => {
  if (!preparedDxfProfiles.left || !preparedDxfProfiles.right) return

  const requestedFeedRate = Number(cutFeedRateInput.value)
  cuttingSettings.feedRate = Number.isFinite(requestedFeedRate) && requestedFeedRate > 0
    ? requestedFeedRate
    : 300
  const leftPoints = buildCuttingPath(preparedDxfProfiles.left.points)
  const rightPoints = buildCuttingPath(preparedDxfProfiles.right.points)

  if (leftPoints.length !== rightPoints.length) {
    dxfAssignmentStatus.textContent += '; кількість точок сторін не збігається'
    return
  }

  const passLabel = cutPassModeInput.value === 'double'
    ? 'два проходи (верх/низ)'
    : 'один прохід'
  renderSimulation(
    leftPoints,
    rightPoints,
    `DXF-траєкторія — ${passLabel}; X/Y і A/Z: ${leftPoints.length} синхронних точок; `
      + `швидкість різання: ${cuttingSettings.feedRate} мм/хв`
  )
}

const assignSelectedDxfContour = side => {
  const state = dxfSides[side]
  const contour = getSelectedDxfContour(side)
  if (!contour) return

  const pointCount = Math.max(2, Number(dxfPointCountInput.value) || 200)
  const startIndex = Number(state.startInput.value) || 0
  preparedDxfProfiles[side] = {
    points: resampleDxfContour(contour, pointCount, startIndex, state.reverseInput.checked),
    contourIndex: Number(state.contourSelect.value),
    startIndex,
    reverse: state.reverseInput.checked
  }
  updateDxfAssignmentStatus()

  if (preparedDxfProfiles.left && preparedDxfProfiles.right) {
    renderPreparedDxfSimulation()
  }
}

const selectNearestDxfPoint = (side, event) => {
  const state = dxfSides[side]
  const contour = getSelectedDxfContour(side)
  if (!contour || !state.model) return

  const rectangle = state.svg.getBoundingClientRect()
  const pointerX = (event.clientX - rectangle.left) * 800 / rectangle.width
  const pointerY = (event.clientY - rectangle.top) * 500 / rectangle.height
  const { minX, minY, width, height } = state.model.bounds
  const scale = Math.min(720 / Math.max(width, 1), 420 / Math.max(height, 1))
  let nearestIndex = 0
  let nearestDistance = Infinity

  contour.points.forEach((point, index) => {
    const x = 40 + (point.x - minX) * scale
    const y = 460 - (point.y - minY) * scale
    const distance = Math.hypot(pointerX - x, pointerY - y)

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })

  state.startInput.value = nearestIndex
  refreshDxfContourPreview(side)
}

const loadDxfSide = async side => {
  const state = dxfSides[side]
  const file = state.fileInput.files[0]

  if (!file) {
    state.status.textContent = `Спочатку виберіть DXF-файл для ${state.label}`
    return
  }

  state.status.textContent = `Читання файлу ${file.name}...`

  try {
    const model = parseDxf(await file.text())
    state.model = model
    preparedDxfProfiles[side] = null
    state.contourSelect.replaceChildren()

    model.contours.forEach((contour, index) => {
      const option = document.createElement('option')
      option.value = index
      option.textContent = `Контур ${index + 1}: ${contour.closed ? 'замкнений' : 'відкритий'}, `
        + `${contour.sourcePathCount} сегм.`
      state.contourSelect.appendChild(option)
    })

    state.tools.hidden = false
    state.startInput.value = 0
    state.reverseInput.checked = false
    updateDxfAssignmentStatus()
    refreshDxfContourPreview(side)

    const unsupportedText = model.unsupported.length
      ? ` Непідтримані об’єкти: ${model.unsupported.join(', ')}.`
      : ''

    state.status.textContent =
      `${file.name}: ${model.paths.length} об’єктів; `
      + `${model.contours.length} контурів `
      + `(${model.contours.filter(contour => contour.closed).length} замкнених); `
      + `${model.bounds.width.toFixed(2)} × ${model.bounds.height.toFixed(2)} мм; `
      + `одиниці: ${model.units}.${unsupportedText}`
  } catch (error) {
    state.model = null
    preparedDxfProfiles[side] = null
    state.svg.replaceChildren()
    state.tools.hidden = true
    updateDxfAssignmentStatus()
    state.status.textContent = `Не вдалося прочитати DXF: ${error.message}`
  }
}

Object.entries(dxfSides).forEach(([side, state]) => {
  state.contourSelect.addEventListener('change', () => {
    state.startInput.value = 0
    refreshDxfContourPreview(side)
  })
  state.startInput.addEventListener('input', () => refreshDxfContourPreview(side))
  state.reverseInput.addEventListener('change', () => refreshDxfContourPreview(side))
  state.assignButton.addEventListener('click', () => assignSelectedDxfContour(side))
  state.svg.addEventListener('click', event => selectNearestDxfPoint(side, event))
  state.loadButton.addEventListener('click', () => loadDxfSide(side))
})

dxfPointCountInput.addEventListener('change', () => {
  for (const side of ['left', 'right']) {
    if (preparedDxfProfiles[side]) assignSelectedDxfContour(side)
  }
})
cutPassModeInput.addEventListener('change', renderPreparedDxfSimulation)
leadDistanceInput.addEventListener('input', renderPreparedDxfSimulation)
cutFeedRateInput.addEventListener('input', renderPreparedDxfSimulation)

loadButton.addEventListener('click', async () => {
  const file = fileInput.files[0]

  if (!file) {
    status.textContent = 'Спочатку виберіть NC-файл'
    return
  }

  const text = await file.text()
const leftPoints = []
const rightPoints = []

let x = 0
let y = 0
let a = 0
let z = 0
let isAbsoluteMode = true

const coordinatePattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'

for (const line of text.split(/\r?\n/)) {
    const cleanLine = line.replace(/\([^)]*\)/g, '').split(';', 1)[0]
    const distanceModes = [...cleanLine.matchAll(/G\s*0?9([01])(?![\d.])/gi)]

    if (distanceModes.length > 0) {
        isAbsoluteMode = distanceModes.at(-1)[1] === '0'
    }

    const xMatch = cleanLine.match(new RegExp(`X\\s*(${coordinatePattern})`, 'i'))
    const yMatch = cleanLine.match(new RegExp(`Y\\s*(${coordinatePattern})`, 'i'))
    const aMatch = cleanLine.match(new RegExp(`A\\s*(${coordinatePattern})`, 'i'))
    const zMatch = cleanLine.match(new RegExp(`Z\\s*(${coordinatePattern})`, 'i'))

  if (xMatch) x = isAbsoluteMode ? Number(xMatch[1]) : x + Number(xMatch[1])
if (yMatch) y = isAbsoluteMode ? Number(yMatch[1]) : y + Number(yMatch[1])
if (aMatch) a = isAbsoluteMode ? Number(aMatch[1]) : a + Number(aMatch[1])
if (zMatch) z = isAbsoluteMode ? Number(zMatch[1]) : z + Number(zMatch[1])
    if (xMatch || yMatch || aMatch || zMatch) {
        leftPoints.push({ x, y })
        rightPoints.push({ x: a, y: z })
    }
}
   if (leftPoints.length < 2 || rightPoints.length < 2) {
        status.textContent = 'У файлі не знайдено траєкторію 4 осей'
        return
    }

    renderSimulation(
      leftPoints,
      rightPoints,
      `Файл: ${file.name} — X/Y: ${leftPoints.length} точок, A/Z: ${rightPoints.length} точок`
    )
})

const renderSimulation = (leftPoints, rightPoints, simulationStatus) => {
    const allPoints = [...leftPoints, ...rightPoints]

    const minX = Math.min(...allPoints.map(p => p.x))
    const maxX = Math.max(...allPoints.map(p => p.x))
    const minY = Math.min(...allPoints.map(p => p.y))
    const maxY = Math.max(...allPoints.map(p => p.y))

    const scaleX = 700 / Math.max(maxX - minX, 1)
    const scaleY = 400 / Math.max(maxY - minY, 1)
    const scale = Math.min(scaleX, scaleY)

    const makeCoords = points => points.map(p => {
        const px = 50 + (p.x - minX) * scale
        const py = 450 - (p.y - minY) * scale
        return `${px},${py}`
    }).join(' ')

    const leftCoords = makeCoords(leftPoints)
    const rightCoords = makeCoords(rightPoints)

  const leftStart = leftPoints[0]
const leftEnd = leftPoints[leftPoints.length - 1]
const rightStart = rightPoints[0]
const rightEnd = rightPoints[rightPoints.length - 1]

const toSvg = p => ({
    x: 50 + (p.x - minX) * scale,
    y: 450 - (p.y - minY) * scale
})

const ls = toSvg(leftStart)
const le = toSvg(leftEnd)
const rs = toSvg(rightStart)
const re = toSvg(rightEnd)

svg.innerHTML = `
    <defs>
        <marker id="arrowBlue" markerWidth="10" markerHeight="10"
            refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="blue" />
        </marker>

        <marker id="arrowRed" markerWidth="10" markerHeight="10"
            refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L9,3 z" fill="red" />
        </marker>
    </defs>

    <polyline
        points="${leftCoords}"
        fill="none"
        stroke="blue"
        stroke-width="2"
        marker-end="url(#arrowBlue)"
    />

    <polyline
        points="${rightCoords}"
        fill="none"
        stroke="red"
        stroke-width="2"
        marker-end="url(#arrowRed)"
    />

    <circle cx="${ls.x}" cy="${ls.y}" r="6" fill="limegreen" />
    <circle cx="${rs.x}" cy="${rs.y}" r="6" fill="limegreen" />

    <circle cx="${le.x}" cy="${le.y}" r="6" fill="black" />
    <circle cx="${re.x}" cy="${re.y}" r="6" fill="black" />

    <text x="${ls.x + 8}" y="${ls.y - 8}" font-size="14">START</text>
    <text x="${le.x + 8}" y="${le.y - 8}" font-size="14">END</text
`
const leftMover = document.createElementNS("http://www.w3.org/2000/svg", "circle")
leftMover.setAttribute("cx", ls.x)
leftMover.setAttribute("cy", ls.y)
leftMover.setAttribute("r", "7")
leftMover.setAttribute("fill", "blue")
svg.appendChild(leftMover)

const rightMover = document.createElementNS("http://www.w3.org/2000/svg", "circle")
rightMover.setAttribute("cx", rs.x)
rightMover.setAttribute("cy", rs.y)
rightMover.setAttribute("r", "7")
rightMover.setAttribute("fill", "red")
svg.appendChild(rightMover)
const wire = document.createElementNS("http://www.w3.org/2000/svg", "line")
wire.setAttribute("x1", ls.x)
wire.setAttribute("y1", ls.y)
wire.setAttribute("x2", rs.x)
wire.setAttribute("y2", rs.y)
wire.setAttribute("stroke", "orange")
wire.setAttribute("stroke-width", "3")
svg.appendChild(wire)
let i = 0

function animateWire() {
    if (i >= leftPoints.length || i >= rightPoints.length) return

const lp = toSvg(leftPoints[i])
const rp = toSvg(rightPoints[i])

    leftMover.setAttribute("cx", lp.x)
    leftMover.setAttribute("cy", lp.y)

    rightMover.setAttribute("cx", rp.x)
    rightMover.setAttribute("cy", rp.y)

    wire.setAttribute("x1", lp.x)
    wire.setAttribute("y1", lp.y)
    wire.setAttribute("x2", rp.x)
    wire.setAttribute("y2", rp.y)

    i++

    setTimeout(animateWire, 20)
}
wire.setAttribute("stroke", "lime")
wire.setAttribute("stroke-width", "6")
animateWire()
let isPaused3d = false
let isStopped3d = false

const cancelWireAnimation3D = () => {
  if (window.foamWireAnimation) {
    cancelAnimationFrame(window.foamWireAnimation)
    window.foamWireAnimation = null
  }
}

pause3d.onclick = () => {
  if (!isPaused3d && !isStopped3d) {
    isPaused3d = true
    pause3d.textContent = "Продовжити"
    cancelWireAnimation3D()
    return
  }

  isPaused3d = false
  isStopped3d = false
  lastWireTime = 0
  pause3d.textContent = "Пауза"
  cancelWireAnimation3D()
  window.foamWireAnimation = requestAnimationFrame(animateWire3D)
}
stop3d.onclick = () => {
  cancelWireAnimation3D()
  isPaused3d = false
  isStopped3d = true
  pause3d.textContent = "Продовжити"
}
reset3d.onclick = () => {
  cancelWireAnimation3D()

  wireIndex = 0
  lastWireTime = 0
  isPaused3d = false
  isStopped3d = false
  pause3d.textContent = "Пауза"

  updateMachinePosition(0)

window.foamWireAnimation = requestAnimationFrame(animateWire3D)
}
svg3d.innerHTML = ``
const allX3d = [
  ...leftPoints.map(p => p.x),
  ...rightPoints.map(p => p.x)
]

const allY3d = [
  ...leftPoints.map(p => p.y),
  ...rightPoints.map(p => p.y)
]

const minX3d = Math.min(...allX3d)
const maxX3d = Math.max(...allX3d)
const minY3d = Math.min(...allY3d)
const maxY3d = Math.max(...allY3d)
const machineScene = {
  leftDepth: 0,
  rightDepth: 200,
  foam: {
    defaultLength: 500,
    defaultWidth: 200,
    defaultHeight: 100
  },
  profileOffset: {
    x: 0,
    y: 0
  },
  projection: {
    depthX: 0.55,
    depthY: 0.28,
    marginX: 50,
    marginY: 50,
    width: 800,
    height: 500
  },
  additionalAxes: []
}

const svgElement = (tag, attributes, parent = svg3d) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag)

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }

  parent.appendChild(element)
  return element
}

const polygonPoints = points => points.map(point => point.join(",")).join(" ")

const readBlockDimension = (input, fallback) => {
  const value = Number(input.value)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const readProfileOffset = input => {
  const value = Number(input.value)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
const count3d = Math.min(leftPoints.length, rightPoints.length)
let wireIndex = 0
let lastWireTime = 0
let project3d = null
let movingWire = null
let leftCarriage = null
let rightCarriage = null

const updateMachinePosition = index => {
  const i = Math.min(index, count3d - 1)
  const leftPosition = project3d(
    leftPoints[i].x + machineScene.profileOffset.x,
    leftPoints[i].y + machineScene.profileOffset.y,
    machineScene.leftDepth
  )
  const rightPosition = project3d(
    rightPoints[i].x + machineScene.profileOffset.x,
    rightPoints[i].y + machineScene.profileOffset.y,
    machineScene.rightDepth
  )

  leftCarriage.setAttribute("transform", `translate(${leftPosition[0]} ${leftPosition[1]})`)
  rightCarriage.setAttribute("transform", `translate(${rightPosition[0]} ${rightPosition[1]})`)
  movingWire.setAttribute("x1", leftPosition[0])
  movingWire.setAttribute("y1", leftPosition[1])
  movingWire.setAttribute("x2", rightPosition[0])
  movingWire.setAttribute("y2", rightPosition[1])
}

const renderMachineScene = () => {
  const length = readBlockDimension(foamLengthInput, machineScene.foam.defaultLength)
  const width = readBlockDimension(foamWidthInput, machineScene.foam.defaultWidth)
  const height = readBlockDimension(foamHeightInput, machineScene.foam.defaultHeight)
  const profileOffsetX = readProfileOffset(profileLengthOffsetInput)
  const profileOffsetY = readProfileOffset(profileHeightOffsetInput)
  const sceneMinX = Math.min(0, minX3d + profileOffsetX)
  const sceneMaxX = Math.max(length, maxX3d + profileOffsetX)
  const sceneMinY = Math.min(0, minY3d + profileOffsetY)
  const sceneMaxY = Math.max(height, maxY3d + profileOffsetY)
  const verticalPadding = Math.max(sceneMaxY - sceneMinY, 1) * 0.12
  const frameBottom = sceneMinY - verticalPadding
  const frameTop = sceneMaxY + verticalPadding
  const projection = machineScene.projection
  const rawCorners = []

  machineScene.rightDepth = width
  machineScene.profileOffset.x = profileOffsetX
  machineScene.profileOffset.y = profileOffsetY

  for (const x of [sceneMinX, sceneMaxX]) {
    for (const y of [frameBottom, frameTop]) {
      for (const depth of [machineScene.leftDepth, machineScene.rightDepth]) {
        rawCorners.push([
          x + depth * projection.depthX,
          y + depth * projection.depthY
        ])
      }
    }
  }

  const rawMinX = Math.min(...rawCorners.map(point => point[0]))
  const rawMaxX = Math.max(...rawCorners.map(point => point[0]))
  const rawMinY = Math.min(...rawCorners.map(point => point[1]))
  const rawMaxY = Math.max(...rawCorners.map(point => point[1]))
  const availableWidth = projection.width - projection.marginX * 2
  const availableHeight = projection.height - projection.marginY * 2
  const millimetersToSvg = Math.min(
    availableWidth / Math.max(rawMaxX - rawMinX, 1),
    availableHeight / Math.max(rawMaxY - rawMinY, 1)
  )

  project3d = (x, y, depth) => {
    const projectedX = x + depth * projection.depthX
    const projectedY = y + depth * projection.depthY

    return [
      projection.marginX + (projectedX - rawMinX) * millimetersToSvg,
      projection.height - projection.marginY
        - (projectedY - rawMinY) * millimetersToSvg
    ]
  }

  svg3d.replaceChildren()

  const frameLayer = svgElement("g", { "data-layer": "machine-frame" })
  const foamLayer = svgElement("g", { "data-layer": "foam-block" })
  const historyLayer = svgElement("g", { "data-layer": "wire-history" })
  const pathLayer = svgElement("g", { "data-layer": "toolpaths" })
  const motionLayer = svgElement("g", { "data-layer": "moving-parts" })
  svgElement("g", { "data-layer": "additional-axes" })

  const drawMachineSide = (depth, label, color) => {
    const bottomLeft = project3d(sceneMinX, frameBottom, depth)
    const topLeft = project3d(sceneMinX, frameTop, depth)
    const bottomRight = project3d(sceneMaxX, frameBottom, depth)
    const topRight = project3d(sceneMaxX, frameTop, depth)

    svgElement("polyline", {
      points: [bottomLeft, topLeft, topRight, bottomRight].map(point => point.join(",")).join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": "5",
      "stroke-linejoin": "round"
    }, frameLayer)

    svgElement("line", {
      x1: bottomLeft[0],
      y1: bottomLeft[1],
      x2: bottomRight[0],
      y2: bottomRight[1],
      stroke: "#4b5563",
      "stroke-width": "8",
      "stroke-linecap": "round"
    }, frameLayer)

    svgElement("text", {
      x: topLeft[0] + 8,
      y: topLeft[1] - 10,
      fill: color,
      "font-size": "15",
      "font-weight": "700"
    }, frameLayer).textContent = label
  }

  drawMachineSide(machineScene.leftDepth, "Ліва сторона X/Y", "#2563eb")
  drawMachineSide(machineScene.rightDepth, "Права сторона A/Z", "#dc2626")

  const foamCorners = {
    nearBottomLeft: project3d(0, 0, machineScene.leftDepth),
    nearBottomRight: project3d(length, 0, machineScene.leftDepth),
    nearTopLeft: project3d(0, height, machineScene.leftDepth),
    nearTopRight: project3d(length, height, machineScene.leftDepth),
    farBottomLeft: project3d(0, 0, machineScene.rightDepth),
    farBottomRight: project3d(length, 0, machineScene.rightDepth),
    farTopLeft: project3d(0, height, machineScene.rightDepth),
    farTopRight: project3d(length, height, machineScene.rightDepth)
  }

  svgElement("polygon", {
    points: polygonPoints([foamCorners.nearTopLeft, foamCorners.nearTopRight,
      foamCorners.farTopRight, foamCorners.farTopLeft]),
    fill: "#fef3c7",
    stroke: "#d97706",
    "stroke-width": "2"
  }, foamLayer)

  svgElement("polygon", {
    points: polygonPoints([foamCorners.nearBottomRight, foamCorners.farBottomRight,
      foamCorners.farTopRight, foamCorners.nearTopRight]),
    fill: "#fde68a",
    stroke: "#d97706",
    "stroke-width": "2"
  }, foamLayer)

  svgElement("polygon", {
    points: polygonPoints([foamCorners.nearBottomLeft, foamCorners.nearBottomRight,
      foamCorners.nearTopRight, foamCorners.nearTopLeft]),
    fill: "#fff7d6",
    "fill-opacity": "0.78",
    stroke: "#d97706",
    "stroke-width": "2"
  }, foamLayer)

  const makePath3d = (points, depth, color) => {
    svgElement("polyline", {
      points: points.map(point => project3d(
        point.x + machineScene.profileOffset.x,
        point.y + machineScene.profileOffset.y,
        depth
      ).join(",")).join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": "3",
      "stroke-linejoin": "round"
    }, pathLayer)
  }

  makePath3d(leftPoints, machineScene.leftDepth, "#2563eb")
  makePath3d(rightPoints, machineScene.rightDepth, "#dc2626")

  const step3d = Math.max(1, Math.floor(count3d / 12))

  for (let i = 0; i < count3d; i += step3d) {
    const leftPosition = project3d(
      leftPoints[i].x + machineScene.profileOffset.x,
      leftPoints[i].y + machineScene.profileOffset.y,
      machineScene.leftDepth
    )
    const rightPosition = project3d(
      rightPoints[i].x + machineScene.profileOffset.x,
      rightPoints[i].y + machineScene.profileOffset.y,
      machineScene.rightDepth
    )

    svgElement("line", {
      x1: leftPosition[0],
      y1: leftPosition[1],
      x2: rightPosition[0],
      y2: rightPosition[1],
      stroke: "#64748b",
      "stroke-opacity": "0.35",
      "stroke-width": "1"
    }, historyLayer)
  }

  movingWire = svgElement("line", {
    stroke: "#22c55e",
    "stroke-width": "4",
    "stroke-linecap": "round"
  }, motionLayer)

  const makeCarriage = label => {
    const carriage = svgElement("g", {}, motionLayer)

    svgElement("rect", {
      x: "-12", y: "-9", width: "24", height: "18", rx: "4",
      fill: "none", stroke: "#374151", "stroke-width": "2"
    }, carriage)
    svgElement("circle", { cx: "0", cy: "0", r: "3", fill: "#22c55e" }, carriage)
    svgElement("text", {
      x: "16", y: "5", fill: "#374151", "font-size": "13", "font-weight": "700"
    }, carriage).textContent = label

    return carriage
  }

  leftCarriage = makeCarriage("X/Y")
  rightCarriage = makeCarriage("A/Z")
  updateMachinePosition(wireIndex)
}

renderActiveFoamBlock = renderMachineScene
renderMachineScene()

cancelWireAnimation3D()

const animateWire3D = (time) => {
  window.foamWireAnimation = null

  if (isPaused3d || isStopped3d) return

if (time - lastWireTime > 101 - Number(speed3d.value)) {
    const i = Math.min(wireIndex, count3d - 1)

    updateMachinePosition(i)

    wireIndex++

    if (wireIndex >= count3d) {
      wireIndex = 0
    }

    lastWireTime = time
  }

  window.foamWireAnimation = requestAnimationFrame(animateWire3D)
}

updateMachinePosition(0)
window.foamWireAnimation = requestAnimationFrame(animateWire3D)

 status.textContent = simulationStatus
}

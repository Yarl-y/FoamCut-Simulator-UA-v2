import './style.css'

document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>FoamCut Simulator</h1>
    <p>Симулятор піноріза — 4 осі</p>

    <div>
      <input type="file" id="ncFile" accept=".nc,.tap,.gcode,.txt">
      <button id="load">Завантажити NC</button>
    </div>

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

const fileInput = document.querySelector('#ncFile')
const loadButton = document.querySelector('#load')
const svg = document.querySelector('#trajectory')
const status = document.querySelector('#status')

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

for (const line of text.split(/\r?\n/)) {
    const xMatch = line.match(/X\s*(-?\d+(?:\.\d+)?)/i)
    const yMatch = line.match(/Y\s*(-?\d+(?:\.\d+)?)/i)
    const aMatch = line.match(/A\s*(-?\d+(?:\.\d+)?)/i)
    const zMatch = line.match(/Z\s*(-?\d+(?:\.\d+)?)/i)

  if (xMatch) x += Number(xMatch[1])
if (yMatch) y += Number(yMatch[1])
if (aMatch) a += Number(aMatch[1])
if (zMatch) z += Number(zMatch[1])
    if (xMatch || yMatch || aMatch || zMatch) {
        leftPoints.push({ x, y })
        rightPoints.push({ x: a, y: z })
    }
}
   if (leftPoints.length < 2 || rightPoints.length < 2) {
        status.textContent = 'У файлі не знайдено траєкторію 4 осей'
        return
    }

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
const view3d = document.getElementById("view3d")

view3d.innerHTML = `
    <h2>Просторовий вигляд струни</h2>
    <svg id="svg3d" width="800" height="500"
        style="border:1px solid #999"></svg>
`
const svg3d = document.getElementById("svg3d")

svg3d.innerHTML = `
    <rect x="80" y="80" width="220" height="320"
        fill="none" stroke="blue" stroke-width="2" />

    <rect x="500" y="80" width="220" height="320"
        fill="none" stroke="red" stroke-width="2" />

    <text x="120" y="60" font-size="18">X / Y</text>
    <text x="560" y="60" font-size="18">A / Z</text>
`
 status.textContent =
    
 `Файл: ${file.name} — X/Y: ${leftPoints.length} точок, A/Z: ${rightPoints.length} точок`
})

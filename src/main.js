import './style.css'

document.querySelector('#app').innerHTML = `
  <div class="foamcut">
    <h1>FoamCut Simulator</h1>
    <p>Симулятор піноріза — 4 осі</p>

    <div class="controls">
      <label>
        Ширина деталі, мм
        <input id="width" type="number" value="500">
      </label>

      <label>
        Висота деталі, мм
        <input id="height" type="number" value="200">
      </label>

      <button id="draw">Показати траєкторію</button>
    </div>

    <h2>Траєкторія різання</h2>

    <svg id="canvas" viewBox="0 0 800 500">
      <rect x="0" y="0" width="800" height="500"
            fill="white" stroke="black"/>

      <polyline
        id="trajectory"
        points=""
        fill="none"
        stroke="red"
        stroke-width="4"/>

      <circle id="start" cx="80" cy="400" r="7" fill="green"/>
      <circle id="finish" cx="720" cy="400" r="7" fill="blue"/>
    </svg>

    <p id="status">Готовий до роботи</p>
  </div>
`

document.querySelector('#draw').addEventListener('click', () => {
  const width = Number(document.querySelector('#width').value)
  const height = Number(document.querySelector('#height').value)

  const y = 400 - Math.min(height, 300)

  document.querySelector('#trajectory').setAttribute(
    'points',
    `80,400 400,${y} 720,400`
  )

  document.querySelector('#status').textContent =
    `Траєкторія побудована: ${width} × ${height} мм`
})
import './style.css'
import { createAssemblyFile, parseAssemblyFile } from './assembly-file.js'
import { renderAssemblyView } from './assembly-view.js'
import { parseDxf, renderDxfPreview, resampleDxfContour } from './dxf.js'
import { createDxfPolyline, createPreviewModel, recoverNcProfiles } from './nc-dxf.js'
import { createFoamCutProject, parseFoamCutProject } from './project-file.js'
import {
  createGliderFuselageSegment,
  createPairedHollowCutPath,
  createLibraryProfile,
  createSparHoleContour,
  createStraightSparHoleContour,
  defaultFuselageStations,
  holeFitsFuselageMaterial,
  insertPairedSparHoles,
  normalizeProfilePair,
  profileLibraryEntries,
  sparHoleFitsProfile,
  transformLibraryProfile
} from './profile-library.js'

document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>FoamCut Simulator</h1>
    <p>Симулятор піноріза — 4 осі</p>

    <div class="project-controls">
      <input type="file" id="projectFile" accept=".json,.foamcut">
      <button id="loadProject">Відкрити проєкт</button>
      <button id="saveProject" disabled>Зберегти проєкт</button>
      <span id="projectStatus">Проєкт ще не збережено</span>
    </div>

    <section class="profile-library">
      <button id="toggleProfileLibrary" type="button" aria-expanded="false">Бібліотека профілів</button>
      <div id="profileLibraryPanel" class="profile-library-panel" hidden>
        <div class="profile-library-workspace">
        <div class="profile-library-controls">
        <h2>Конструктор крила</h2>
        <div class="profile-library-grid">
          <label>Кореневий профіль
            <select id="rootLibraryProfile"></select>
          </label>
          <label>Хорда кореня, мм
            <input id="rootLibraryChord" type="number" min="1" step="1" value="300">
          </label>
          <label>Кінцевий профіль
            <select id="tipLibraryProfile"></select>
          </label>
          <label>Хорда кінця, мм
            <input id="tipLibraryChord" type="number" min="1" step="1" value="150">
          </label>
          <label>Розмах півкрила, мм
            <input id="halfSpan" type="number" min="1" step="1" value="800">
          </label>
          <label>Стрілоподібність, мм
            <input id="wingSweep" type="number" step="1" value="40">
          </label>
          <label>Крутка кінця, °
            <input id="tipTwist" type="number" step="0.1" value="-2">
          </label>
          <label>Вісь крутки, % хорди
            <input id="twistAxis" type="number" min="0" max="100" step="1" value="25">
          </label>
        </div>
        <div class="spar-hole-controls">
          <h3>Отвори лонжеронів</h3>
          <label class="spar-hole-mode">Режим позиціонування
            <select id="sparHoleMode">
              <option value="profile">За відсотком хорди</option>
              <option value="straight">Наскрізні прямі прути</option>
            </select>
          </label>
          <div class="spar-hole-row">
            <label><input id="spar1Enabled" type="checkbox" checked> Отвір 1</label>
            <label><span id="spar1PositionLabel">Положення, % хорди</span> <input id="spar1Position" type="number" min="1" max="99" step="1" value="30"></label>
            <label>Висота від хорди, мм <input id="spar1Height" type="number" step="1" value="0"></label>
            <label>Ø кореня, мм <input id="spar1RootDiameter" type="number" min="1" step="1" value="12"></label>
            <label id="spar1TipDiameterLabel">Ø кінця, мм <input id="spar1TipDiameter" type="number" min="1" step="1" value="10"></label>
          </div>
          <div class="spar-hole-row">
            <label><input id="spar2Enabled" type="checkbox"> Отвір 2</label>
            <label><span id="spar2PositionLabel">Положення, % хорди</span> <input id="spar2Position" type="number" min="1" max="99" step="1" value="55"></label>
            <label>Висота від хорди, мм <input id="spar2Height" type="number" step="1" value="0"></label>
            <label>Ø кореня, мм <input id="spar2RootDiameter" type="number" min="1" step="1" value="10"></label>
            <label id="spar2TipDiameterLabel">Ø кінця, мм <input id="spar2TipDiameter" type="number" min="1" step="1" value="8"></label>
          </div>
          <p id="sparHoleHelp">Струна входить до кожного отвору від найближчої поверхні та повертається тим самим каналом.</p>
        </div>
        <div class="servo-channel-controls">
          <h3>Канали проводів сервоприводів</h3>
          <p>Координати задаються в міліметрах від передньої крайки кореневого профілю та його лінії хорди.</p>
          <div class="servo-channel-row">
            <label><input id="servo1Enabled" type="checkbox"> Канал 1</label>
            <label>X кореня <input id="servo1RootX" type="number" step="1" value="180"></label>
            <label>Y кореня <input id="servo1RootY" type="number" step="1" value="0"></label>
            <label>Ø кореня <input id="servo1RootDiameter" type="number" min="1" step="1" value="8"></label>
            <label>X кінця <input id="servo1TipX" type="number" step="1" value="120"></label>
            <label>Y кінця <input id="servo1TipY" type="number" step="1" value="0"></label>
            <label>Ø кінця <input id="servo1TipDiameter" type="number" min="1" step="1" value="8"></label>
          </div>
          <div class="servo-channel-row">
            <label><input id="servo2Enabled" type="checkbox"> Канал 2</label>
            <label>X кореня <input id="servo2RootX" type="number" step="1" value="220"></label>
            <label>Y кореня <input id="servo2RootY" type="number" step="1" value="0"></label>
            <label>Ø кореня <input id="servo2RootDiameter" type="number" min="1" step="1" value="6"></label>
            <label>X кінця <input id="servo2TipX" type="number" step="1" value="150"></label>
            <label>Y кінця <input id="servo2TipY" type="number" step="1" value="0"></label>
            <label>Ø кінця <input id="servo2TipDiameter" type="number" min="1" step="1" value="6"></label>
          </div>
        </div>
        <button id="buildLibraryWing" type="button">Побудувати 3D-крило</button>
        <p id="profileLibraryStatus">Виберіть параметри кореневого та кінцевого профілів</p>
        <div class="fuselage-library">
          <h3>Планерний фюзеляж</h3>
          <p>Параметричний шаблон загального планерного компонування</p>
          <div class="profile-library-grid fuselage-library-grid">
            <label>Секція для різання
              <select id="fuselageSegment"></select>
            </label>
            <label>Загальна довжина, мм
              <input id="fuselageLength" type="number" min="1" step="1" value="900">
            </label>
            <label>Максимальна ширина, мм
              <input id="fuselageWidth" type="number" min="1" step="1" value="140">
            </label>
            <label>Максимальна висота, мм
              <input id="fuselageHeight" type="number" min="1" step="1" value="160">
            </label>
            <label class="fuselage-hollow-toggle"><input id="fuselageHollow" type="checkbox"> Порожниста вибрана секція</label>
            <label>Товщина стінки, мм
              <input id="fuselageWallThickness" type="number" min="1" step="1" value="5">
            </label>
            <label>Товщина днища, мм
              <input id="fuselageBottomThickness" type="number" min="1" step="1" value="5">
            </label>
            <label class="fuselage-tube-toggle"><input id="fuselageTube" type="checkbox"> Поздовжня карбонова трубка</label>
            <label>Зовнішній Ø трубки, мм
              <input id="fuselageTubeDiameter" type="number" min="1" step="0.1" value="8">
            </label>
            <label>Посадковий зазор, мм
              <input id="fuselageTubeClearance" type="number" min="0" step="0.1" value="0.4">
            </label>
            <label>Висота осі від спільного нуля, мм
              <input id="fuselageTubeHeight" type="number" step="1" value="70">
            </label>
            <label>Бокове зміщення від центра, мм
              <input id="fuselageTubeSideOffset" type="number" step="1" value="0">
            </label>
            <label>Початок трубки від носа, мм
              <input id="fuselageTubeStart" type="number" min="0" step="1" value="0">
            </label>
            <label>Довжина трубки, мм
              <input id="fuselageTubeLength" type="number" min="1" step="1" value="850">
            </label>
          </div>
          <div class="fuselage-stations-toolbar">
            <strong>Поперечні станції та стики</strong>
            <button id="addFuselageSection" type="button">+ Додати секцію</button>
            <button id="resetFuselageSections" type="button">Початкові 3 секції</button>
          </div>
          <div class="fuselage-stations-table">
            <div class="fuselage-stations-head" aria-hidden="true">
              <span>Назва</span><span>Положення, %</span><span>Ширина, %</span>
              <span>Висота, %</span><span>Підйом, %</span><span>Верх, %</span>
              <span>Низ, %</span><span>Плоскість низу, %</span><span></span>
            </div>
            <div id="fuselageStations" class="fuselage-stations"></div>
          </div>
          <button id="buildFuselageSegment" type="button">Побудувати секцію фюзеляжу</button>
          <p id="fuselageLibraryStatus">Виберіть секцію — для кожної створюється окремий NC-файл</p>
        </div>
        </div>
        <aside class="library-preview-panel">
          <div class="library-preview-toolbar">
            <strong>Живий 3D-перегляд</strong>
            <button id="previewWing" type="button">Крило</button>
            <button id="previewFuselage" type="button">Фюзеляж</button>
            <button id="measureLibrary" type="button">Рулетка</button>
            <button id="clearLibraryMeasure" type="button">Очистити</button>
            <button id="smallerLibraryMeasure" type="button" title="Зменшити напис рулетки">Текст −</button>
            <button id="largerLibraryMeasure" type="button" title="Збільшити напис рулетки">Текст +</button>
          </div>
          <svg id="libraryPreviewSvg" viewBox="0 0 800 500" aria-label="Попередній 3D-перегляд деталі"></svg>
          <p id="libraryPreviewStatus">Змінюйте параметри — модель оновлюється автоматично</p>
          <small>Миша: обертання · колесо: масштаб</small>
        </aside>
        </div>
      </div>
    </section>

    <div>
      <input type="file" id="ncFile" accept=".nc,.tap,.gcode,.txt">
      <button id="load">Завантажити NC</button>
    </div>
    <div class="nc-to-dxf-controls">
      <button id="downloadNcDxfLeft" disabled>Завантажити DXF X/Y</button>
      <button id="downloadNcDxfRight" disabled>Завантажити DXF A/Z</button>
      <span id="ncToDxfStatus">Відкрийте NC для відновлення профілів</span>
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
      <section class="nc-generator">
        <div class="machine-limit-controls">
          <label>Хід X, мм <input id="limitX" type="number" min="1" step="1" value="600"></label>
          <label>Хід Y, мм <input id="limitY" type="number" min="1" step="1" value="600"></label>
          <label>Хід A, мм <input id="limitA" type="number" min="1" step="1" value="600"></label>
          <label>Хід Z, мм <input id="limitZ" type="number" min="1" step="1" value="600"></label>
          <label>Робоча довжина струни, мм
            <input id="wireSpan" type="number" min="1" step="1" value="1060">
          </label>
          <label>Фактичний пропал, мм
            <input id="wireKerf" type="number" min="0" step="0.1" value="1.0" title="Збережено для майбутньої компенсації контуру">
          </label>
        </div>
        <div class="nc-generator-actions">
          <button id="generateNc" disabled>Створити NC для Mach3</button>
          <button id="downloadNc" disabled>Завантажити NC-файл</button>
        </div>
        <textarea id="generatedNcPreview" rows="12" readonly
          placeholder="Після призначення обох профілів тут з’явиться NC/G-code"></textarea>
        <p id="generatedNcStatus">Спочатку призначте профілі X/Y та A/Z</p>
      </section>
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
    <div class="orbit-controls">
      <button data-camera-view="iso">Ізометрія</button>
      <button data-camera-view="front">Спереду</button>
      <button data-camera-view="left">Зліва</button>
      <button data-camera-view="right">Справа</button>
      <button data-camera-view="top">Зверху</button>
      <label><input id="showCutSurface" type="checkbox" checked> Показувати вирізану поверхню</label>
    </div>
    <p class="orbit-help">Миша: ліва — орбіта; Shift + ліва або права — переміщення; коліщатко — масштаб</p>
  </div>
  <svg id="svg3d" width="800" height="500" style="border:1px solid #999"></svg>
  <section class="assembly-workspace">
    <h2>Збірка моделі</h2>
    <div class="assembly-actions">
      <button id="addLeftWing" disabled>Додати ліве півкрило</button>
      <button id="addRightWing" disabled>Додати праве півкрило</button>
      <button id="addFuselagePart" disabled>Додати секцію фюзеляжу</button>
    </div>
    <div class="assembly-file-controls">
      <input id="assemblyFile" type="file" accept=".json,.foamcut-assembly">
      <button id="loadAssembly">Відкрити збірку</button>
      <button id="saveAssembly" disabled>Зберегти всю збірку</button>
      <span id="assemblyFileStatus">Збірку ще не збережено</span>
    </div>
    <p id="assemblyCandidateStatus">Спочатку побудуйте крило або секцію фюзеляжу</p>
    <div id="assemblyPartsList" class="assembly-parts-list"></div>
    <div class="assembly-orbit-controls">
      <button data-assembly-camera="iso">Ізометрія</button>
      <button data-assembly-camera="front">Спереду</button>
      <button data-assembly-camera="side">Збоку</button>
      <button data-assembly-camera="top">Зверху</button>
      <button id="measureAssembly" type="button">Рулетка</button>
      <button id="clearAssemblyMeasure" type="button">Очистити</button>
      <button id="smallerAssemblyMeasure" type="button">Текст −</button>
      <button id="largerAssemblyMeasure" type="button">Текст +</button>
    </div>
    <p class="orbit-help">Збірка: ліва кнопка — орбіта; Shift + ліва або права — переміщення; коліщатко — масштаб</p>
    <svg id="assemblySvg" viewBox="0 0 800 500" width="800" height="500"></svg>
    <p id="assemblyStatus">Збірка поки порожня</p>
  </section>
`

const fileInput = document.querySelector('#ncFile')
const loadButton = document.querySelector('#load')
const projectFileInput = document.querySelector('#projectFile')
const loadProjectButton = document.querySelector('#loadProject')
const saveProjectButton = document.querySelector('#saveProject')
const projectStatus = document.querySelector('#projectStatus')
const toggleProfileLibraryButton = document.querySelector('#toggleProfileLibrary')
const profileLibraryPanel = document.querySelector('#profileLibraryPanel')
const rootLibraryProfileInput = document.querySelector('#rootLibraryProfile')
const tipLibraryProfileInput = document.querySelector('#tipLibraryProfile')
const rootLibraryChordInput = document.querySelector('#rootLibraryChord')
const tipLibraryChordInput = document.querySelector('#tipLibraryChord')
const halfSpanInput = document.querySelector('#halfSpan')
const wingSweepInput = document.querySelector('#wingSweep')
const tipTwistInput = document.querySelector('#tipTwist')
const twistAxisInput = document.querySelector('#twistAxis')
const buildLibraryWingButton = document.querySelector('#buildLibraryWing')
const profileLibraryStatus = document.querySelector('#profileLibraryStatus')
const sparHoleModeInput = document.querySelector('#sparHoleMode')
const sparHoleHelp = document.querySelector('#sparHoleHelp')
const sparHoleInputs = [1, 2].map(number => ({
  enabled: document.querySelector(`#spar${number}Enabled`),
  position: document.querySelector(`#spar${number}Position`),
  height: document.querySelector(`#spar${number}Height`),
  rootDiameter: document.querySelector(`#spar${number}RootDiameter`),
  tipDiameter: document.querySelector(`#spar${number}TipDiameter`),
  positionLabel: document.querySelector(`#spar${number}PositionLabel`),
  tipDiameterLabel: document.querySelector(`#spar${number}TipDiameterLabel`)
}))
const servoChannelInputs = [1, 2].map(number => ({
  enabled: document.querySelector(`#servo${number}Enabled`),
  rootX: document.querySelector(`#servo${number}RootX`),
  rootY: document.querySelector(`#servo${number}RootY`),
  rootDiameter: document.querySelector(`#servo${number}RootDiameter`),
  tipX: document.querySelector(`#servo${number}TipX`),
  tipY: document.querySelector(`#servo${number}TipY`),
  tipDiameter: document.querySelector(`#servo${number}TipDiameter`)
}))
const fuselageSegmentInput = document.querySelector('#fuselageSegment')
const fuselageLengthInput = document.querySelector('#fuselageLength')
const fuselageWidthInput = document.querySelector('#fuselageWidth')
const fuselageHeightInput = document.querySelector('#fuselageHeight')
const fuselageHollowInput = document.querySelector('#fuselageHollow')
const fuselageWallThicknessInput = document.querySelector('#fuselageWallThickness')
const fuselageBottomThicknessInput = document.querySelector('#fuselageBottomThickness')
const fuselageTubeInput = document.querySelector('#fuselageTube')
const fuselageTubeDiameterInput = document.querySelector('#fuselageTubeDiameter')
const fuselageTubeClearanceInput = document.querySelector('#fuselageTubeClearance')
const fuselageTubeHeightInput = document.querySelector('#fuselageTubeHeight')
const fuselageTubeSideOffsetInput = document.querySelector('#fuselageTubeSideOffset')
const fuselageTubeStartInput = document.querySelector('#fuselageTubeStart')
const fuselageTubeLengthInput = document.querySelector('#fuselageTubeLength')
const fuselageStationsElement = document.querySelector('#fuselageStations')
const addFuselageSectionButton = document.querySelector('#addFuselageSection')
const resetFuselageSectionsButton = document.querySelector('#resetFuselageSections')
const buildFuselageSegmentButton = document.querySelector('#buildFuselageSegment')
const fuselageLibraryStatus = document.querySelector('#fuselageLibraryStatus')
const libraryPreviewSvg = document.querySelector('#libraryPreviewSvg')
const libraryPreviewStatus = document.querySelector('#libraryPreviewStatus')
const previewWingButton = document.querySelector('#previewWing')
const previewFuselageButton = document.querySelector('#previewFuselage')
const measureLibraryButton = document.querySelector('#measureLibrary')
const clearLibraryMeasureButton = document.querySelector('#clearLibraryMeasure')
const smallerLibraryMeasureButton = document.querySelector('#smallerLibraryMeasure')
const largerLibraryMeasureButton = document.querySelector('#largerLibraryMeasure')
const downloadNcDxfLeftButton = document.querySelector('#downloadNcDxfLeft')
const downloadNcDxfRightButton = document.querySelector('#downloadNcDxfRight')
const ncToDxfStatus = document.querySelector('#ncToDxfStatus')
const dxfPointCountInput = document.querySelector('#dxfPointCount')
const cutPassModeInput = document.querySelector('#cutPassMode')
const leadDistanceInput = document.querySelector('#leadDistance')
const cutFeedRateInput = document.querySelector('#cutFeedRate')
const dxfAssignmentStatus = document.querySelector('#dxfAssignmentStatus')
const generateNcButton = document.querySelector('#generateNc')
const downloadNcButton = document.querySelector('#downloadNc')
const generatedNcPreview = document.querySelector('#generatedNcPreview')
const generatedNcStatus = document.querySelector('#generatedNcStatus')
const machineLimitInputs = {
  x: document.querySelector('#limitX'),
  y: document.querySelector('#limitY'),
  a: document.querySelector('#limitA'),
  z: document.querySelector('#limitZ')
}
const wireSpanInput = document.querySelector('#wireSpan')
const wireKerfInput = document.querySelector('#wireKerf')
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
const showCutSurfaceInput = document.getElementById('showCutSurface')
const addLeftWingButton = document.getElementById('addLeftWing')
const addRightWingButton = document.getElementById('addRightWing')
const addFuselagePartButton = document.getElementById('addFuselagePart')
const assemblyCandidateStatus = document.getElementById('assemblyCandidateStatus')
const assemblyPartsList = document.getElementById('assemblyPartsList')
const assemblySvg = document.getElementById('assemblySvg')
const assemblyStatus = document.getElementById('assemblyStatus')
const measureAssemblyButton = document.getElementById('measureAssembly')
const clearAssemblyMeasureButton = document.getElementById('clearAssemblyMeasure')
const smallerAssemblyMeasureButton = document.getElementById('smallerAssemblyMeasure')
const largerAssemblyMeasureButton = document.getElementById('largerAssemblyMeasure')
const assemblyFileInput = document.getElementById('assemblyFile')
const loadAssemblyButton = document.getElementById('loadAssembly')
const saveAssemblyButton = document.getElementById('saveAssembly')
const assemblyFileStatus = document.getElementById('assemblyFileStatus')
let renderActiveFoamBlock = null
const preparedDxfProfiles = { left: null, right: null }
const cuttingSettings = { feedRate: 300 }
let preparedCuttingTrajectory = null
let generatedNcText = ''
let recoveredNcProfiles = null
let activeStraightSparRods = []
let activeServoChannels = []
let currentAssemblyCandidate = null
let fuselageStations = defaultFuselageStations.map(station => ({ ...station }))
let fuselageSectionSettings = Array.from({ length: defaultFuselageStations.length - 1 }, () => ({
  hollow: false,
  wallThickness: 5,
  bottomThickness: 5
}))
let nextFuselageStationId = 1
let libraryPreviewMode = 'wing'
const libraryPreviewCamera = { yaw: -35, pitch: -22, zoom: 1, panX: 0, panY: 0 }
const libraryMeasurement = { active: false, points: [], fontSize: 22 }
const assemblyMeasurement = { active: false, points: [], fontSize: 22 }
const assemblyParts = []
let nextAssemblyPartId = 1
const assemblyCamera = { yaw: -35, pitch: -22, zoom: 1, panX: 0, panY: 0 }
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

for (const { id, name } of profileLibraryEntries) {
  for (const select of [rootLibraryProfileInput, tipLibraryProfileInput]) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = name
    select.appendChild(option)
  }
}
rootLibraryProfileInput.value = 'naca2412'
tipLibraryProfileInput.value = 'naca2412'

const readFuselageStations = () => [...fuselageStationsElement.querySelectorAll('.fuselage-station-row')].map(
  row => ({
    id: row.dataset.id,
    name: row.querySelector('[data-field="name"]').value.trim() || 'Станція',
    position: Number(row.querySelector('[data-field="position"]').value) / 100,
    width: Number(row.querySelector('[data-field="width"]').value) / 100,
    height: Number(row.querySelector('[data-field="height"]').value) / 100,
    lift: Number(row.querySelector('[data-field="lift"]').value) / 100,
    upperFullness: Number(row.querySelector('[data-field="upperFullness"]').value) / 100,
    lowerFullness: Number(row.querySelector('[data-field="lowerFullness"]').value) / 100,
    bottomFlatness: Number(row.querySelector('[data-field="bottomFlatness"]').value) / 100
  })
)

const escapeAttribute = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const renderFuselageStations = (selectedSegment = Number(fuselageSegmentInput.value) || 0) => {
  fuselageStationsElement.innerHTML = ''
  fuselageStations.forEach((station, index) => {
    const row = document.createElement('div')
    row.className = 'fuselage-station-row'
    row.dataset.id = station.id
    row.innerHTML = `
      <input data-field="name" value="${escapeAttribute(station.name)}" aria-label="Назва станції ${index + 1}">
      <input data-field="position" type="number" min="0" max="100" step="0.1" value="${station.position * 100}" aria-label="Положення станції ${index + 1}">
      <input data-field="width" type="number" min="1" step="0.1" value="${station.width * 100}" aria-label="Ширина станції ${index + 1}">
      <input data-field="height" type="number" min="1" step="0.1" value="${station.height * 100}" aria-label="Висота станції ${index + 1}">
      <input data-field="lift" type="number" step="0.1" value="${station.lift * 100}" aria-label="Підйом станції ${index + 1}">
      <input data-field="upperFullness" type="number" min="20" max="150" step="1" value="${(station.upperFullness ?? 1) * 100}" aria-label="Верхня повнота станції ${index + 1}">
      <input data-field="lowerFullness" type="number" min="20" max="150" step="1" value="${(station.lowerFullness ?? 1) * 100}" aria-label="Нижня повнота станції ${index + 1}">
      <input data-field="bottomFlatness" type="number" min="0" max="100" step="1" value="${(station.bottomFlatness ?? 0) * 100}" aria-label="Плоскість низу станції ${index + 1}">
      <button type="button" data-remove-station="${index}" ${index === 0 || index === fuselageStations.length - 1 ? 'disabled' : ''} title="Видалити станцію і об'єднати сусідні секції">×</button>
    `
    fuselageStationsElement.appendChild(row)
  })
  fuselageSegmentInput.innerHTML = ''
  fuselageStations.slice(0, -1).forEach((station, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = `${station.name} → ${fuselageStations[index + 1].name}`
    fuselageSegmentInput.appendChild(option)
  })
  fuselageSegmentInput.value = String(Math.min(selectedSegment, fuselageStations.length - 2))
}

const previewPart = ({ kind, name, span, outerLeft, outerRight, offsets, selected = false, rods = [] }) => ({
  id: 0,
  kind,
  side: kind === 'wing' ? 'right' : null,
  name,
  span,
  outerLeft,
  outerRight,
  cutLeft: outerLeft,
  cutRight: outerRight,
  straightSparRods: rods,
  servoChannels: [],
  offsets,
  visible: true,
  previewSelected: selected
})

const renderLibraryPreview = () => {
  try {
    const pointCount = 100
    let parts
    if (libraryPreviewMode === 'wing') {
      const rootChord = readPositiveLibraryNumber(rootLibraryChordInput, 'Хорда кореня')
      const tipChord = readPositiveLibraryNumber(tipLibraryChordInput, 'Хорда кінця')
      const halfSpan = readPositiveLibraryNumber(halfSpanInput, 'Розмах півкрила')
      const root = transformLibraryProfile(
        createLibraryProfile(rootLibraryProfileInput.value, pointCount),
        { chord: rootChord }
      )
      const tip = transformLibraryProfile(
        createLibraryProfile(tipLibraryProfileInput.value, pointCount),
        {
          chord: tipChord,
          sweep: Number(wingSweepInput.value) || 0,
          twistDegrees: Number(tipTwistInput.value) || 0,
          twistAxisPercent: Math.min(100, Math.max(0, Number(twistAxisInput.value) || 0))
        }
      )
      parts = [previewPart({
        kind: 'wing', name: 'Попередній вигляд крила', span: halfSpan,
        outerLeft: root, outerRight: tip, offsets: { x: 0, y: 0, z: 0 }
      })]
      libraryPreviewStatus.textContent = `Крило: ${rootChord} → ${tipChord} мм; піврозмах ${halfSpan} мм`
    } else {
      const totalLength = readPositiveLibraryNumber(fuselageLengthInput, 'Довжина фюзеляжу')
      const maximumWidth = readPositiveLibraryNumber(fuselageWidthInput, 'Ширина фюзеляжу')
      const maximumHeight = readPositiveLibraryNumber(fuselageHeightInput, 'Висота фюзеляжу')
      const tubeEnabled = fuselageTubeInput.checked
      const tubeDiameter = tubeEnabled ? readPositiveLibraryNumber(fuselageTubeDiameterInput, 'Діаметр трубки') : 0
      const tubeClearance = Math.max(0, Number(fuselageTubeClearanceInput.value) || 0)
      const tubeHeight = Number(fuselageTubeHeightInput.value) || 0
      const tubeSideOffset = Number(fuselageTubeSideOffsetInput.value) || 0
      const tubeStart = Math.max(0, Number(fuselageTubeStartInput.value) || 0)
      const tubeLength = tubeEnabled ? readPositiveLibraryNumber(fuselageTubeLengthInput, 'Довжина трубки') : 0
      fuselageStations = readFuselageStations()
      const selectedSegment = Number(fuselageSegmentInput.value) || 0
      parts = fuselageStations.slice(0, -1).map((station, index) => {
        const { hollow, wallThickness, bottomThickness } = fuselageSectionSettings[index]
        const segment = createGliderFuselageSegment({
          segmentIndex: index, stations: fuselageStations, totalLength,
          maximumWidth, maximumHeight, pointCount,
          hollow, wallThickness, bottomThickness
        })
        const overlapStart = Math.max(tubeStart, segment.segmentStart)
        const overlapEnd = Math.min(tubeStart + tubeLength, segment.segmentStart + segment.segmentLength)
        const tubeRods = tubeEnabled && overlapEnd > overlapStart
          ? [{
              x: tubeSideOffset,
              y: tubeHeight + segment.translation.y,
              diameter: tubeDiameter + tubeClearance,
              start: overlapStart - segment.segmentStart,
              length: overlapEnd - overlapStart
            }]
          : []
        const outerPart = previewPart({
          kind: 'fuselage',
          name: `${segment.leftName} → ${segment.rightName}`,
          span: segment.segmentLength,
          outerLeft: segment.leftPoints,
          outerRight: segment.rightPoints,
          offsets: { x: segment.segmentStart, y: -segment.translation.y, z: 0 },
          selected: index === selectedSegment,
          rods: tubeRods
        })
        if (!hollow) return [outerPart]
        return [
          outerPart,
          {
            ...previewPart({
              kind: 'fuselage', name: '', span: segment.segmentLength,
              outerLeft: segment.innerLeftPoints, outerRight: segment.innerRightPoints,
              offsets: { x: segment.segmentStart, y: -segment.translation.y, z: 0 }
            }),
            previewInner: true
          }
        ]
      })
        .flat()
      const selectedName = `${fuselageStations[selectedSegment].name} → ${fuselageStations[selectedSegment + 1].name}`
      const selectedSettings = fuselageSectionSettings[selectedSegment]
      libraryPreviewStatus.textContent = `Фюзеляж: ${fuselageStations.length - 1} секц.; вибрано ${selectedName}`
        + (selectedSettings.hollow
          ? `; порожниста — стінка ${selectedSettings.wallThickness} мм, днище ${selectedSettings.bottomThickness} мм`
          : '; суцільна')
    }
    renderAssemblyView(libraryPreviewSvg, parts, libraryPreviewCamera, libraryMeasurement)
    previewWingButton.classList.toggle('active', libraryPreviewMode === 'wing')
    previewFuselageButton.classList.toggle('active', libraryPreviewMode === 'fuselage')
  } catch (error) {
    libraryPreviewSvg.replaceChildren()
    libraryPreviewStatus.textContent = `Перегляд: ${error.message}`
  }
}

let libraryPreviewFrame = 0
const scheduleLibraryPreview = mode => {
  if (mode) libraryPreviewMode = mode
  cancelAnimationFrame(libraryPreviewFrame)
  libraryPreviewFrame = requestAnimationFrame(renderLibraryPreview)
}

fuselageStationsElement.addEventListener('input', () => {
  fuselageStations = readFuselageStations()
  const selectedSegment = Number(fuselageSegmentInput.value) || 0
  const options = [...fuselageSegmentInput.options]
  options.forEach((option, index) => {
    option.textContent = `${fuselageStations[index].name} → ${fuselageStations[index + 1].name}`
  })
  fuselageSegmentInput.value = String(selectedSegment)
  scheduleLibraryPreview('fuselage')
})

fuselageStationsElement.addEventListener('click', event => {
  const index = Number(event.target.dataset.removeStation)
  if (!Number.isInteger(index) || index <= 0 || index >= fuselageStations.length - 1) return
  fuselageStations = readFuselageStations()
  fuselageSectionSettings.splice(index, 1)
  fuselageStations.splice(index, 1)
  renderFuselageStations(Math.max(0, index - 1))
  loadSelectedSectionSettings()
  scheduleLibraryPreview('fuselage')
})

addFuselageSectionButton.addEventListener('click', () => {
  fuselageStations = readFuselageStations()
  const segmentIndex = Number(fuselageSegmentInput.value) || 0
  const left = fuselageStations[segmentIndex]
  const right = fuselageStations[segmentIndex + 1]
  const average = field => (left[field] + right[field]) / 2
  const inheritedSectionSettings = { ...fuselageSectionSettings[segmentIndex] }
  fuselageStations.splice(segmentIndex + 1, 0, {
    id: `custom-${nextFuselageStationId++}`,
    name: `Стик ${fuselageStations.length}`,
    position: average('position'),
    width: average('width'),
    height: average('height'),
    lift: average('lift'),
    upperFullness: average('upperFullness'),
    lowerFullness: average('lowerFullness'),
    bottomFlatness: average('bottomFlatness')
  })
  fuselageSectionSettings.splice(segmentIndex + 1, 0, inheritedSectionSettings)
  renderFuselageStations(segmentIndex + 1)
  loadSelectedSectionSettings()
  scheduleLibraryPreview('fuselage')
})

resetFuselageSectionsButton.addEventListener('click', () => {
  fuselageStations = defaultFuselageStations.map(station => ({ ...station }))
  fuselageSectionSettings = Array.from({ length: defaultFuselageStations.length - 1 }, () => ({
    hollow: false,
    wallThickness: 5,
    bottomThickness: 5
  }))
  renderFuselageStations()
  loadSelectedSectionSettings()
  scheduleLibraryPreview('fuselage')
})

renderFuselageStations()

previewWingButton.addEventListener('click', () => scheduleLibraryPreview('wing'))
previewFuselageButton.addEventListener('click', () => scheduleLibraryPreview('fuselage'))
const loadSelectedSectionSettings = () => {
  const settings = fuselageSectionSettings[Number(fuselageSegmentInput.value) || 0]
  if (!settings) return
  fuselageHollowInput.checked = settings.hollow
  fuselageWallThicknessInput.value = settings.wallThickness
  fuselageBottomThicknessInput.value = settings.bottomThickness
  syncHollowFuselageControls()
}
fuselageSegmentInput.addEventListener('change', () => {
  loadSelectedSectionSettings()
  scheduleLibraryPreview('fuselage')
})

const wingPreviewInputs = [
  rootLibraryProfileInput, rootLibraryChordInput, tipLibraryProfileInput, tipLibraryChordInput,
  halfSpanInput, wingSweepInput, tipTwistInput, twistAxisInput
]
wingPreviewInputs.forEach(input => {
  input.addEventListener('input', () => scheduleLibraryPreview('wing'))
  input.addEventListener('change', () => scheduleLibraryPreview('wing'))
})
;[
  fuselageLengthInput, fuselageWidthInput, fuselageHeightInput, fuselageHollowInput,
  fuselageWallThicknessInput, fuselageBottomThicknessInput
].forEach(input => {
  input.addEventListener('input', () => scheduleLibraryPreview('fuselage'))
  input.addEventListener('change', () => scheduleLibraryPreview('fuselage'))
})

;[
  fuselageTubeInput, fuselageTubeDiameterInput, fuselageTubeClearanceInput,
  fuselageTubeHeightInput, fuselageTubeSideOffsetInput
  , fuselageTubeStartInput, fuselageTubeLengthInput
].forEach(input => {
  input.addEventListener('input', () => scheduleLibraryPreview('fuselage'))
  input.addEventListener('change', () => scheduleLibraryPreview('fuselage'))
})

const syncHollowFuselageControls = () => {
  fuselageWallThicknessInput.disabled = !fuselageHollowInput.checked
  fuselageBottomThicknessInput.disabled = !fuselageHollowInput.checked
}
fuselageHollowInput.addEventListener('change', syncHollowFuselageControls)
syncHollowFuselageControls()

const saveSelectedSectionSettings = () => {
  const index = Number(fuselageSegmentInput.value) || 0
  fuselageSectionSettings[index] = {
    hollow: fuselageHollowInput.checked,
    wallThickness: Math.max(1, Number(fuselageWallThicknessInput.value) || 5),
    bottomThickness: Math.max(1, Number(fuselageBottomThicknessInput.value) || 5)
  }
}
;[fuselageHollowInput, fuselageWallThicknessInput, fuselageBottomThicknessInput].forEach(input => {
  input.addEventListener('input', saveSelectedSectionSettings)
  input.addEventListener('change', saveSelectedSectionSettings)
})

const syncFuselageTubeControls = () => {
  ;[
    fuselageTubeDiameterInput, fuselageTubeClearanceInput,
    fuselageTubeHeightInput, fuselageTubeSideOffsetInput
    , fuselageTubeStartInput, fuselageTubeLengthInput
  ].forEach(input => { input.disabled = !fuselageTubeInput.checked })
}
fuselageTubeInput.addEventListener('change', syncFuselageTubeControls)
syncFuselageTubeControls()

let libraryPreviewDrag = null
libraryPreviewSvg.addEventListener('pointerdown', event => {
  if (libraryMeasurement.active) return
  libraryPreviewDrag = { x: event.clientX, y: event.clientY, yaw: libraryPreviewCamera.yaw, pitch: libraryPreviewCamera.pitch }
  libraryPreviewSvg.setPointerCapture(event.pointerId)
})
libraryPreviewSvg.addEventListener('pointermove', event => {
  if (!libraryPreviewDrag) return
  libraryPreviewCamera.yaw = libraryPreviewDrag.yaw + (event.clientX - libraryPreviewDrag.x) * 0.45
  libraryPreviewCamera.pitch = Math.max(-89, Math.min(89, libraryPreviewDrag.pitch - (event.clientY - libraryPreviewDrag.y) * 0.45))
  scheduleLibraryPreview()
})
libraryPreviewSvg.addEventListener('pointerup', () => { libraryPreviewDrag = null })
libraryPreviewSvg.addEventListener('pointercancel', () => { libraryPreviewDrag = null })
libraryPreviewSvg.addEventListener('wheel', event => {
  event.preventDefault()
  libraryPreviewCamera.zoom = Math.max(0.3, Math.min(4, libraryPreviewCamera.zoom * Math.exp(-event.deltaY * 0.001)))
  scheduleLibraryPreview()
}, { passive: false })

const selectMeasurementPoint = (svgElement, measurement, event, rerender) => {
  const rectangle = svgElement.getBoundingClientRect()
  const screenX = (event.clientX - rectangle.left) * 800 / rectangle.width
  const screenY = (event.clientY - rectangle.top) * 500 / rectangle.height
  let nearest = null
  let nearestDistance = Infinity
  for (const candidate of svgElement.__foamcutSnapPoints || []) {
    const distance = Math.hypot(candidate.screen[0] - screenX, candidate.screen[1] - screenY)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  if (!nearest || nearestDistance > 22) return
  if (measurement.points.length >= 2) measurement.points = []
  measurement.points.push({ ...nearest.world })
  rerender()
}

measureLibraryButton.addEventListener('click', () => {
  libraryMeasurement.active = !libraryMeasurement.active
  measureLibraryButton.classList.toggle('active', libraryMeasurement.active)
  libraryPreviewSvg.classList.toggle('measuring', libraryMeasurement.active)
})
clearLibraryMeasureButton.addEventListener('click', () => {
  libraryMeasurement.points = []
  scheduleLibraryPreview()
})
const adjustMeasurementText = (measurement, delta, rerender) => {
  measurement.fontSize = Math.max(14, Math.min(42, measurement.fontSize + delta))
  rerender()
}
smallerLibraryMeasureButton.addEventListener('click', () => {
  adjustMeasurementText(libraryMeasurement, -2, scheduleLibraryPreview)
})
largerLibraryMeasureButton.addEventListener('click', () => {
  adjustMeasurementText(libraryMeasurement, 2, scheduleLibraryPreview)
})
libraryPreviewSvg.addEventListener('click', event => {
  if (libraryMeasurement.active) {
    selectMeasurementPoint(libraryPreviewSvg, libraryMeasurement, event, scheduleLibraryPreview)
  }
})

toggleProfileLibraryButton.addEventListener('click', () => {
  profileLibraryPanel.hidden = !profileLibraryPanel.hidden
  toggleProfileLibraryButton.setAttribute('aria-expanded', String(!profileLibraryPanel.hidden))
  if (!profileLibraryPanel.hidden) scheduleLibraryPreview()
})

sparHoleModeInput.addEventListener('change', () => {
  const straightMode = sparHoleModeInput.value === 'straight'
  const rootChord = Math.max(1, Number(rootLibraryChordInput.value) || 300)
  for (const hole of sparHoleInputs) {
    const currentPosition = Number(hole.position.value) || 0
    hole.position.value = straightMode
      ? Math.round(currentPosition * rootChord / 100 * 1000) / 1000
      : Math.round(currentPosition / rootChord * 100 * 1000) / 1000
    hole.position.min = straightMode ? 0 : 1
    hole.position.max = straightMode ? rootChord : 99
    hole.positionLabel.textContent = straightMode ? 'X від передньої крайки, мм' : 'Положення, % хорди'
    hole.tipDiameterLabel.hidden = straightMode
  }
  sparHoleHelp.textContent = straightMode
    ? 'Обидва отвори лежать на одній абсолютній прямій осі; діаметр однаковий по всьому розмаху.'
    : 'Струна входить до кожного отвору від найближчої поверхні та повертається тим самим каналом.'
})

const updateFoamBlockDimensions = () => {
  if (renderActiveFoamBlock) renderActiveFoamBlock()
  if (preparedCuttingTrajectory) updateGeneratedNcPreview()
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

const updateProjectSaveAvailability = () => {
  saveProjectButton.disabled = !(
    preparedDxfProfiles.left
    && preparedDxfProfiles.right
    && preparedDxfProfiles.left.points.length === preparedDxfProfiles.right.points.length
  )
}

const showProfileInDxfPanel = (side, points, closed, sourceLabel) => {
  const state = dxfSides[side]
  state.model = createPreviewModel(points, closed)
  state.contourSelect.replaceChildren()
  const option = document.createElement('option')
  option.value = '0'
  option.textContent = `${sourceLabel}: ${closed ? 'замкнений' : 'відкритий'}, ${points.length} точок`
  state.contourSelect.appendChild(option)
  state.startInput.value = 0
  state.reverseInput.checked = false
  state.tools.hidden = false
  state.status.textContent = `${sourceLabel}: ${points.length} точок, `
    + `${closed ? 'замкнений профіль' : 'відкрита траєкторія'}`
  refreshDxfContourPreview(side)
}

const downloadTextFile = (text, fileName, type) => {
  const blobUrl = URL.createObjectURL(new Blob([text], { type }))
  const downloadLink = document.createElement('a')
  downloadLink.href = blobUrl
  downloadLink.download = fileName
  document.body.appendChild(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

const getProjectSettings = () => ({
  pointCount: Number(dxfPointCountInput.value),
  passMode: cutPassModeInput.value,
  leadDistance: Number(leadDistanceInput.value),
  feedRate: Number(cutFeedRateInput.value),
  foamLength: Number(foamLengthInput.value),
  foamWidth: Number(foamWidthInput.value),
  foamHeight: Number(foamHeightInput.value),
  profileLengthOffset: Number(profileLengthOffsetInput.value),
  profileHeightOffset: Number(profileHeightOffsetInput.value),
  limitX: Number(machineLimitInputs.x.value),
  limitY: Number(machineLimitInputs.y.value),
  limitA: Number(machineLimitInputs.a.value),
  limitZ: Number(machineLimitInputs.z.value),
  wireSpan: Number(wireSpanInput.value),
  wireKerf: Number(wireKerfInput.value),
  animationSpeed: Number(speed3d.value),
  internalFirst: Boolean(preparedDxfProfiles.left?.internalFirst)
})

const applyProjectSettings = settings => {
  const inputs = {
    pointCount: dxfPointCountInput,
    leadDistance: leadDistanceInput,
    feedRate: cutFeedRateInput,
    foamLength: foamLengthInput,
    foamWidth: foamWidthInput,
    foamHeight: foamHeightInput,
    profileLengthOffset: profileLengthOffsetInput,
    profileHeightOffset: profileHeightOffsetInput,
    limitX: machineLimitInputs.x,
    limitY: machineLimitInputs.y,
    limitA: machineLimitInputs.a,
    limitZ: machineLimitInputs.z,
    wireSpan: wireSpanInput,
    wireKerf: wireKerfInput,
    animationSpeed: speed3d
  }

  for (const [name, input] of Object.entries(inputs)) {
    const value = Number(settings[name])
    if (Number.isFinite(value)) input.value = value
  }
  if (['single', 'double'].includes(settings.passMode)) cutPassModeInput.value = settings.passMode
}

saveProjectButton.addEventListener('click', () => {
  if (!preparedDxfProfiles.left || !preparedDxfProfiles.right) return

  const project = createFoamCutProject({
    settings: getProjectSettings(),
    leftPoints: preparedDxfProfiles.left.points,
    rightPoints: preparedDxfProfiles.right.points
  })
  const date = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    `${JSON.stringify(project, null, 2)}\n`,
    `foamcut-project-${date}.foamcut.json`,
    'application/json'
  )
  projectStatus.textContent = `Проєкт збережено: ${project.profiles.left.length} синхронних точок`
})

loadProjectButton.addEventListener('click', async () => {
  const file = projectFileInput.files[0]
  if (!file) {
    projectStatus.textContent = 'Спочатку виберіть файл проєкту'
    return
  }

  try {
    activeStraightSparRods = []
    activeServoChannels = []
    const project = parseFoamCutProject(await file.text())
    applyProjectSettings(project.settings)
    preparedDxfProfiles.left = {
      points: project.leftPoints,
      source: 'project',
      internalFirst: project.settings.internalFirst === true
    }
    preparedDxfProfiles.right = {
      points: project.rightPoints,
      source: 'project',
      internalFirst: project.settings.internalFirst === true
    }
    showProfileInDxfPanel('left', project.leftPoints, true, `Проєкт ${file.name} — X/Y`)
    showProfileInDxfPanel('right', project.rightPoints, true, `Проєкт ${file.name} — A/Z`)
    updateDxfAssignmentStatus()
    updateProjectSaveAvailability()
    renderPreparedDxfSimulation()
    projectStatus.textContent = `Проєкт ${file.name} відкрито; відновлено ${project.leftPoints.length} точок`
  } catch (error) {
    projectStatus.textContent = `Не вдалося відкрити проєкт: ${error.message}`
  }
})

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

const buildCuttingPath = (points, passMode = cutPassModeInput.value) => {
  if (points.length < 2) return points.map(point => ({ ...point }))

  let orderedPoints = points
  if (passMode === 'double') {
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

  if (passMode === 'double') {
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

const formatNcNumber = value => {
  const normalized = Math.abs(value) < 0.0005 ? 0 : value
  return normalized.toFixed(3)
}

const createMach3Nc = trajectory => {
  const readNcOffset = input => {
    const value = Number(input.value)
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }
  const offsetX = readNcOffset(profileLengthOffsetInput)
  const offsetY = readNcOffset(profileHeightOffsetInput)
  const lines = [
    '%',
    '(FoamCut Simulator - 4 axis X/Y + A/Z)',
    '(Metric units, absolute coordinates)'
  ]

  if (trajectory.sourceLeftPoints && trajectory.sourceRightPoints) {
    lines.push('(FOAMCUT_PROFILE_DATA_BEGIN)')
    const profileCount = Math.min(
      trajectory.sourceLeftPoints.length,
      trajectory.sourceRightPoints.length
    )

    for (let index = 0; index < profileCount; index++) {
      const left = trajectory.sourceLeftPoints[index]
      const right = trajectory.sourceRightPoints[index]
      lines.push(`(FOAMCUT_PROFILE X${formatNcNumber(left.x)} Y${formatNcNumber(left.y)} `
        + `A${formatNcNumber(right.x)} Z${formatNcNumber(right.y)})`)
    }
    lines.push('(FOAMCUT_PROFILE_DATA_END)')
  }

  lines.push('G21', 'G90', 'G94', `F${formatNcNumber(trajectory.feedRate)}`)
  let previousLine = null

  for (let index = 0; index < trajectory.leftPoints.length; index++) {
    const left = trajectory.leftPoints[index]
    const right = trajectory.rightPoints[index]
    const movement = `G1 X${formatNcNumber(left.x + offsetX)} `
      + `Y${formatNcNumber(left.y + offsetY)} `
      + `A${formatNcNumber(right.x + offsetX)} `
      + `Z${formatNcNumber(right.y + offsetY)}`

    if (movement !== previousLine) lines.push(movement)
    previousLine = movement
  }

  lines.push('M30', '%')
  return `${lines.join('\n')}\n`
}

const validateMachineEnvelope = trajectory => {
  const offsetX = Math.max(0, Number(profileLengthOffsetInput.value) || 0)
  const offsetY = Math.max(0, Number(profileHeightOffsetInput.value) || 0)
  const axes = {
    x: trajectory.leftPoints.map(point => point.x + offsetX),
    y: trajectory.leftPoints.map(point => point.y + offsetY),
    a: trajectory.rightPoints.map(point => point.x + offsetX),
    z: trajectory.rightPoints.map(point => point.y + offsetY)
  }
  const labels = { x: 'X', y: 'Y', a: 'A', z: 'Z' }
  const ranges = {}
  const errors = []

  for (const [axis, values] of Object.entries(axes)) {
    const minimum = Math.min(...values)
    const maximum = Math.max(...values)
    const travel = maximum - minimum
    const configuredLimit = Number(machineLimitInputs[axis].value)
    const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 600
    ranges[axis] = { minimum, maximum, travel, limit }

    if (travel > limit + 0.0005) {
      errors.push(`${labels[axis]}: потрібно ${formatNcNumber(travel)} мм, доступно ${limit} мм`)
    }
  }

  const configuredWireSpan = Number(wireSpanInput.value)
  const wireSpan = Number.isFinite(configuredWireSpan) && configuredWireSpan > 0
    ? configuredWireSpan
    : 1060
  const foamWidth = Number(foamWidthInput.value) || 0
  if (foamWidth > wireSpan) {
    errors.push(`ширина блока ${formatNcNumber(foamWidth)} мм більша за робочу довжину струни ${wireSpan} мм`)
  }

  return { valid: errors.length === 0, errors, ranges, wireSpan }
}

const updateGeneratedNcPreview = () => {
  if (!preparedCuttingTrajectory) {
    generatedNcText = ''
    generatedNcPreview.value = ''
    generateNcButton.disabled = true
    downloadNcButton.disabled = true
    generatedNcStatus.className = ''
    generatedNcStatus.textContent = 'Спочатку призначте профілі X/Y та A/Z'
    return
  }

  generatedNcText = createMach3Nc(preparedCuttingTrajectory)
  generatedNcPreview.value = generatedNcText
  generateNcButton.disabled = false
  const validation = validateMachineEnvelope(preparedCuttingTrajectory)
  downloadNcButton.disabled = !validation.valid
  const movementCount = generatedNcText.split('\n').filter(line => line.startsWith('G1 ')).length
  const travelSummary = Object.entries(validation.ranges)
    .map(([axis, range]) => `${axis.toUpperCase()} ${formatNcNumber(range.travel)}/${range.limit} мм`)
    .join('; ')

  if (validation.valid) {
    generatedNcStatus.className = 'nc-status-valid'
    generatedNcStatus.textContent = `NC готовий: ${movementCount} синхронних рухів; `
      + `F${formatNcNumber(preparedCuttingTrajectory.feedRate)} мм/хв; ${travelSummary}`
  } else {
    generatedNcStatus.className = 'nc-status-error'
    generatedNcStatus.textContent = `NC не можна завантажити: ${validation.errors.join('; ')}. ${travelSummary}`
  }
}

const renderPreparedDxfSimulation = () => {
  if (!preparedDxfProfiles.left || !preparedDxfProfiles.right) return

  const requestedFeedRate = Number(cutFeedRateInput.value)
  cuttingSettings.feedRate = Number.isFinite(requestedFeedRate) && requestedFeedRate > 0
    ? requestedFeedRate
    : 300
  const internalFirst = preparedDxfProfiles.left.internalFirst === true
    || preparedDxfProfiles.right.internalFirst === true
  const effectivePassMode = internalFirst ? 'single' : cutPassModeInput.value
  const leftPoints = buildCuttingPath(preparedDxfProfiles.left.points, effectivePassMode)
  const rightPoints = buildCuttingPath(preparedDxfProfiles.right.points, effectivePassMode)

  if (leftPoints.length !== rightPoints.length) {
    preparedCuttingTrajectory = null
    updateGeneratedNcPreview()
    dxfAssignmentStatus.textContent += '; кількість точок сторін не збігається'
    return
  }

  preparedCuttingTrajectory = {
    leftPoints,
    rightPoints,
    sourceLeftPoints: preparedDxfProfiles.left.points.map(point => ({ ...point })),
    sourceRightPoints: preparedDxfProfiles.right.points.map(point => ({ ...point })),
    feedRate: cuttingSettings.feedRate,
    passMode: effectivePassMode
  }
  updateGeneratedNcPreview()

  const passLabel = internalFirst
    ? 'порожнина спочатку, потім зовнішній контур'
    : effectivePassMode === 'double'
    ? 'два проходи (верх/низ)'
    : 'один прохід'
  renderSimulation(
    leftPoints,
    rightPoints,
    `DXF-траєкторія — ${passLabel}; X/Y і A/Z: ${leftPoints.length} синхронних точок; `
      + `швидкість різання: ${cuttingSettings.feedRate} мм/хв`
  )
}

const readPositiveLibraryNumber = (input, label) => {
  const value = Number(input.value)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} має бути більшою за 0`)
  return value
}

const readLibraryNumber = (input, label) => {
  const value = Number(input.value)
  if (!Number.isFinite(value)) throw new Error(`${label} має бути числом`)
  return value
}

buildLibraryWingButton.addEventListener('click', () => {
  try {
    activeStraightSparRods = []
    activeServoChannels = []
    const pointCount = Math.max(20, Number(dxfPointCountInput.value) || 200)
    const rootChord = readPositiveLibraryNumber(rootLibraryChordInput, 'Хорда кореня')
    const tipChord = readPositiveLibraryNumber(tipLibraryChordInput, 'Хорда кінця')
    const halfSpan = readPositiveLibraryNumber(halfSpanInput, 'Розмах півкрила')
    const sweep = Number(wingSweepInput.value) || 0
    const twist = Number(tipTwistInput.value) || 0
    const twistAxis = Math.min(100, Math.max(0, Number(twistAxisInput.value) || 0))
    const rootNormalized = createLibraryProfile(rootLibraryProfileInput.value, pointCount)
    const tipNormalized = createLibraryProfile(tipLibraryProfileInput.value, pointCount)
    const rootTransform = { chord: rootChord }
    const tipTransform = {
      chord: tipChord,
      sweep,
      twistDegrees: twist,
      twistAxisPercent: twistAxis
    }
    const rootPoints = transformLibraryProfile(rootNormalized, rootTransform)
    const tipPoints = transformLibraryProfile(tipNormalized, tipTransform)
    const straightSparAxes = []
    const sparHoles = sparHoleInputs.filter(hole => hole.enabled.checked).map((hole, index) => {
      const height = Number(hole.height.value) || 0
      const rootDiameter = readPositiveLibraryNumber(hole.rootDiameter, `Діаметр кореня отвору ${index + 1}`)
      let left
      let right

      if (sparHoleModeInput.value === 'straight') {
        const x = Number(hole.position.value)
        if (!Number.isFinite(x) || x < 0) {
          throw new Error(`Положення X отвору ${index + 1} має бути додатним числом`)
        }
        left = createStraightSparHoleContour({ x, y: height, diameter: rootDiameter })
        right = createStraightSparHoleContour({ x, y: height, diameter: rootDiameter })
        straightSparAxes.push({ x, y: height, diameter: rootDiameter })
      } else {
        const positionPercent = Math.min(99, Math.max(1, Number(hole.position.value) || 1))
        const tipDiameter = readPositiveLibraryNumber(
          hole.tipDiameter,
          `Діаметр кінця отвору ${index + 1}`
        )
        left = createSparHoleContour({
          ...rootTransform,
          positionPercent,
          height,
          diameter: rootDiameter
        })
        right = createSparHoleContour({
          ...tipTransform,
          positionPercent,
          height,
          diameter: tipDiameter
        })
      }
      if (!sparHoleFitsProfile(rootPoints, left)) {
        throw new Error(`Отвір ${index + 1} не вміщується в кореневому профілі`)
      }
      if (!sparHoleFitsProfile(tipPoints, right)) {
        throw new Error(`Отвір ${index + 1} не вміщується в кінцевому профілі`)
      }
      return { left, right }
    })
    const servoChannels = servoChannelInputs.filter(channel => channel.enabled.checked)
      .map((channel, index) => {
        const rootX = readLibraryNumber(channel.rootX, `X кореня каналу ${index + 1}`)
        const rootY = readLibraryNumber(channel.rootY, `Y кореня каналу ${index + 1}`)
        const rootDiameter = readPositiveLibraryNumber(
          channel.rootDiameter,
          `Діаметр кореня каналу ${index + 1}`
        )
        const tipX = readLibraryNumber(channel.tipX, `X кінця каналу ${index + 1}`)
        const tipY = readLibraryNumber(channel.tipY, `Y кінця каналу ${index + 1}`)
        const tipDiameter = readPositiveLibraryNumber(
          channel.tipDiameter,
          `Діаметр кінця каналу ${index + 1}`
        )
        const left = createStraightSparHoleContour({
          x: rootX,
          y: rootY,
          diameter: rootDiameter
        })
        const right = createStraightSparHoleContour({
          x: tipX,
          y: tipY,
          diameter: tipDiameter
        })
        if (!sparHoleFitsProfile(rootPoints, left)) {
          throw new Error(`Канал ${index + 1} не вміщується в кореневому профілі`)
        }
        if (!sparHoleFitsProfile(tipPoints, right)) {
          throw new Error(`Канал ${index + 1} не вміщується в кінцевому профілі`)
        }
        return {
          left,
          right,
          axis: { rootX, rootY, rootDiameter, tipX, tipY, tipDiameter }
        }
      })
    const profilesWithHoles = insertPairedSparHoles(
      rootPoints,
      tipPoints,
      [...sparHoles, ...servoChannels]
    )
    const normalizedPair = normalizeProfilePair(
      profilesWithHoles.leftPoints,
      profilesWithHoles.rightPoints
    )
    activeStraightSparRods = straightSparAxes.map(axis => ({
      x: axis.x + normalizedPair.translation.x,
      y: axis.y + normalizedPair.translation.y,
      diameter: axis.diameter
    }))
    activeServoChannels = servoChannels.map(({ axis }) => ({
      rootX: axis.rootX + normalizedPair.translation.x,
      rootY: axis.rootY + normalizedPair.translation.y,
      rootDiameter: axis.rootDiameter,
      tipX: axis.tipX + normalizedPair.translation.x,
      tipY: axis.tipY + normalizedPair.translation.y,
      tipDiameter: axis.tipDiameter
    }))
    const translateOuterProfile = points => points.map(point => ({
      x: point.x + normalizedPair.translation.x,
      y: point.y + normalizedPair.translation.y
    }))
    currentAssemblyCandidate = {
      kind: 'wing',
      name: `${rootLibraryProfileInput.selectedOptions[0].textContent} / ${tipLibraryProfileInput.selectedOptions[0].textContent}`,
      span: halfSpan,
      outerLeft: translateOuterProfile(rootPoints),
      outerRight: translateOuterProfile(tipPoints),
      cutLeft: normalizedPair.leftPoints.map(point => ({ ...point })),
      cutRight: normalizedPair.rightPoints.map(point => ({ ...point })),
      straightSparRods: activeStraightSparRods.map(rod => ({ ...rod })),
      servoChannels: activeServoChannels.map(channel => ({ ...channel })),
      defaultOffsets: { x: 0, y: 0, z: 0 }
    }
    updateAssemblyCandidateControls()

    preparedDxfProfiles.left = { points: normalizedPair.leftPoints, source: 'library' }
    preparedDxfProfiles.right = { points: normalizedPair.rightPoints, source: 'library' }
    showProfileInDxfPanel(
      'left',
      normalizedPair.leftPoints,
      true,
      `Бібліотека ${rootLibraryProfileInput.selectedOptions[0].textContent}`
    )
    showProfileInDxfPanel(
      'right',
      normalizedPair.rightPoints,
      true,
      `Бібліотека ${tipLibraryProfileInput.selectedOptions[0].textContent}`
    )
    foamWidthInput.value = halfSpan
    updateDxfAssignmentStatus()
    updateProjectSaveAvailability()
    renderPreparedDxfSimulation()
    profileLibraryStatus.className = 'profile-library-valid'
    profileLibraryStatus.textContent = `Крило побудовано: корінь ${rootChord} мм, кінець ${tipChord} мм, `
      + `піврозмах ${halfSpan} мм, крутка ${twist}°, отворів лонжеронів: ${sparHoles.length}; `
      + `${sparHoleModeInput.value === 'straight' ? 'наскрізні прямі осі' : 'позиція за хордою'}; `
      + `каналів проводів: ${servoChannels.length}`
  } catch (error) {
    profileLibraryStatus.className = 'profile-library-error'
    profileLibraryStatus.textContent = `Не вдалося побудувати крило: ${error.message}`
  }
})

buildFuselageSegmentButton.addEventListener('click', () => {
  try {
    activeStraightSparRods = []
    activeServoChannels = []
    const pointCount = Math.max(20, Number(dxfPointCountInput.value) || 200)
    const totalLength = readPositiveLibraryNumber(fuselageLengthInput, 'Довжина фюзеляжу')
    const maximumWidth = readPositiveLibraryNumber(fuselageWidthInput, 'Ширина фюзеляжу')
    const maximumHeight = readPositiveLibraryNumber(fuselageHeightInput, 'Висота фюзеляжу')
    saveSelectedSectionSettings()
    const selectedSectionSettings = fuselageSectionSettings[Number(fuselageSegmentInput.value)]
    const { hollow, wallThickness, bottomThickness } = selectedSectionSettings
    const tubeEnabled = fuselageTubeInput.checked
    const tubeDiameter = tubeEnabled
      ? readPositiveLibraryNumber(fuselageTubeDiameterInput, 'Діаметр трубки')
      : 0
    const tubeClearance = Math.max(0, Number(fuselageTubeClearanceInput.value) || 0)
    const tubeHeight = Number(fuselageTubeHeightInput.value) || 0
    const tubeSideOffset = Number(fuselageTubeSideOffsetInput.value) || 0
    const tubeStart = Math.max(0, Number(fuselageTubeStartInput.value) || 0)
    const tubeLength = tubeEnabled
      ? readPositiveLibraryNumber(fuselageTubeLengthInput, 'Довжина трубки')
      : 0
    fuselageStations = readFuselageStations()
    const segment = createGliderFuselageSegment({
      segmentIndex: Number(fuselageSegmentInput.value),
      stations: fuselageStations,
      totalLength,
      maximumWidth,
      maximumHeight,
      hollow,
      wallThickness,
      bottomThickness,
      pointCount
    })

    let cutProfiles = hollow
      ? createPairedHollowCutPath(
          segment.leftPoints,
          segment.rightPoints,
          segment.innerLeftPoints,
          segment.innerRightPoints
        )
      : { leftPoints: segment.leftPoints, rightPoints: segment.rightPoints }

    const overlapStart = Math.max(tubeStart, segment.segmentStart)
    const overlapEnd = Math.min(tubeStart + tubeLength, segment.segmentStart + segment.segmentLength)
    const tubeCrossesSection = tubeEnabled && overlapEnd > overlapStart
    if (tubeCrossesSection) {
      const holeDiameter = tubeDiameter + tubeClearance
      const centerX = points => (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2
      const leftHole = createStraightSparHoleContour({
        x: centerX(segment.leftPoints) + tubeSideOffset,
        y: tubeHeight + segment.translation.y,
        diameter: holeDiameter
      })
      const rightHole = createStraightSparHoleContour({
        x: centerX(segment.rightPoints) + tubeSideOffset,
        y: tubeHeight + segment.translation.y,
        diameter: holeDiameter
      })
      if (!holeFitsFuselageMaterial(segment.leftPoints, segment.innerLeftPoints, leftHole)) {
        throw new Error(`${segment.leftName}: отвір трубки не вміщується в матеріалі перерізу`)
      }
      if (!holeFitsFuselageMaterial(segment.rightPoints, segment.innerRightPoints, rightHole)) {
        throw new Error(`${segment.rightName}: отвір трубки не вміщується в матеріалі перерізу`)
      }
      cutProfiles = insertPairedSparHoles(cutProfiles.leftPoints, cutProfiles.rightPoints, [{ left: leftHole, right: rightHole }])
    }

    preparedDxfProfiles.left = {
      points: cutProfiles.leftPoints,
      source: 'fuselage-library',
      internalFirst: hollow
    }
    preparedDxfProfiles.right = {
      points: cutProfiles.rightPoints,
      source: 'fuselage-library',
      internalFirst: hollow
    }
    showProfileInDxfPanel('left', cutProfiles.leftPoints, true, `Фюзеляж — ${segment.leftName}`)
    showProfileInDxfPanel('right', cutProfiles.rightPoints, true, `Фюзеляж — ${segment.rightName}`)
    foamWidthInput.value = Math.round(segment.segmentLength * 1000) / 1000
    currentAssemblyCandidate = {
      kind: 'fuselage',
      name: `Фюзеляж ${segment.leftName} → ${segment.rightName}`,
      span: segment.segmentLength,
      outerLeft: segment.leftPoints.map(point => ({ ...point })),
      outerRight: segment.rightPoints.map(point => ({ ...point })),
      innerLeft: segment.innerLeftPoints?.map(point => ({ ...point })) || null,
      innerRight: segment.innerRightPoints?.map(point => ({ ...point })) || null,
      cutLeft: cutProfiles.leftPoints.map(point => ({ ...point })),
      cutRight: cutProfiles.rightPoints.map(point => ({ ...point })),
      straightSparRods: tubeCrossesSection
        ? [{
            x: tubeSideOffset,
            y: tubeHeight + segment.translation.y,
            diameter: tubeDiameter,
            start: overlapStart - segment.segmentStart,
            length: overlapEnd - overlapStart
          }]
        : [],
      servoChannels: [],
      defaultOffsets: { x: segment.segmentStart, y: 0, z: 0 }
    }
    updateAssemblyCandidateControls()
    updateDxfAssignmentStatus()
    updateProjectSaveAvailability()
    renderPreparedDxfSimulation()
    fuselageLibraryStatus.className = 'profile-library-valid'
    fuselageLibraryStatus.textContent = `Секцію ${segment.leftName} → ${segment.rightName} побудовано; `
      + `довжина блока ${foamWidthInput.value} мм`
      + (hollow ? `; порожнина: стінка ${wallThickness} мм, днище ${bottomThickness} мм; внутрішній контур ріжеться першим` : '')
      + (tubeCrossesSection ? `; трубка Ø${tubeDiameter} мм, отвір Ø${tubeDiameter + tubeClearance} мм; діапазон ${tubeStart}–${tubeStart + tubeLength} мм` : '')
  } catch (error) {
    fuselageLibraryStatus.className = 'profile-library-error'
    fuselageLibraryStatus.textContent = `Не вдалося побудувати секцію: ${error.message}`
  }
})

const updateAssemblyCandidateControls = () => {
  const wingReady = currentAssemblyCandidate?.kind === 'wing'
  const fuselageReady = currentAssemblyCandidate?.kind === 'fuselage'
  addLeftWingButton.disabled = !wingReady
  addRightWingButton.disabled = !wingReady
  addFuselagePartButton.disabled = !fuselageReady
  assemblyCandidateStatus.textContent = currentAssemblyCandidate
    ? `Поточна деталь: ${currentAssemblyCandidate.name}`
    : 'Спочатку побудуйте крило або секцію фюзеляжу'
}

const updateAssemblySvg = () => {
  const result = renderAssemblyView(assemblySvg, assemblyParts, assemblyCamera, assemblyMeasurement)
  saveAssemblyButton.disabled = assemblyParts.length === 0
  assemblyStatus.textContent = result.visibleCount
    ? `У збірці ${assemblyParts.length} деталей; показано ${result.visibleCount}. `
      + 'Виберіть потрібну деталь для симуляції та створення NC.'
    : `У збірці ${assemblyParts.length} деталей; усі деталі приховані`
}

const selectAssemblyPartForCutting = part => {
  activeStraightSparRods = part.straightSparRods.map(rod => ({ ...rod }))
  activeServoChannels = part.servoChannels.map(channel => ({ ...channel }))
  preparedDxfProfiles.left = {
    points: part.cutLeft.map(point => ({ ...point })),
    source: 'assembly',
    internalFirst: part.kind === 'fuselage' && part.cutLeft.length > part.outerLeft.length
  }
  preparedDxfProfiles.right = {
    points: part.cutRight.map(point => ({ ...point })),
    source: 'assembly',
    internalFirst: part.kind === 'fuselage' && part.cutRight.length > part.outerRight.length
  }
  foamWidthInput.value = Math.round(part.span * 1000) / 1000
  showProfileInDxfPanel('left', preparedDxfProfiles.left.points, true, `${part.name} — X/Y`)
  showProfileInDxfPanel('right', preparedDxfProfiles.right.points, true, `${part.name} — A/Z`)
  updateDxfAssignmentStatus()
  updateProjectSaveAvailability()
  renderPreparedDxfSimulation()
  assemblyStatus.textContent = `${part.name} вибрано для різання; симуляція та NC оновлені`
}

const renderAssemblyPartsList = () => {
  assemblyPartsList.replaceChildren()
  for (const part of assemblyParts) {
    const row = document.createElement('div')
    row.className = 'assembly-part-row'
    const visibleLabel = document.createElement('label')
    const visibleInput = document.createElement('input')
    visibleInput.type = 'checkbox'
    visibleInput.checked = part.visible
    visibleInput.addEventListener('change', () => {
      part.visible = visibleInput.checked
      assemblyFileStatus.textContent = 'Збірку змінено — збережіть файл'
      updateAssemblySvg()
    })
    visibleLabel.append(visibleInput, document.createTextNode(part.name))
    row.appendChild(visibleLabel)

    for (const axis of ['x', 'y', 'z']) {
      const label = document.createElement('label')
      label.textContent = `${axis.toUpperCase()}, мм `
      const input = document.createElement('input')
      input.type = 'number'
      input.step = '1'
      input.value = part.offsets[axis]
      input.addEventListener('input', () => {
        const value = Number(input.value)
        if (Number.isFinite(value)) {
          part.offsets[axis] = value
          assemblyFileStatus.textContent = 'Збірку змінено — збережіть файл'
          updateAssemblySvg()
        }
      })
      label.appendChild(input)
      row.appendChild(label)
    }

    const selectButton = document.createElement('button')
    selectButton.textContent = 'Вибрати для різання'
    selectButton.addEventListener('click', () => selectAssemblyPartForCutting(part))
    row.appendChild(selectButton)
    assemblyPartsList.appendChild(row)
  }
  updateAssemblySvg()
}

const addCurrentCandidateToAssembly = side => {
  if (!currentAssemblyCandidate) return
  const candidate = currentAssemblyCandidate
  if (candidate.kind === 'wing' && !['left', 'right'].includes(side)) return
  if (candidate.kind === 'fuselage' && side !== 'fuselage') return
  const sideLabel = side === 'left' ? 'Ліве півкрило' : side === 'right' ? 'Праве півкрило' : ''
  assemblyParts.push({
    id: nextAssemblyPartId++,
    kind: candidate.kind,
    side: candidate.kind === 'wing' ? side : null,
    name: candidate.kind === 'wing' ? `${sideLabel}: ${candidate.name}` : candidate.name,
    span: candidate.span,
    outerLeft: candidate.outerLeft.map(point => ({ ...point })),
    outerRight: candidate.outerRight.map(point => ({ ...point })),
    innerLeft: candidate.innerLeft?.map(point => ({ ...point })) || null,
    innerRight: candidate.innerRight?.map(point => ({ ...point })) || null,
    cutLeft: candidate.cutLeft.map(point => ({ ...point })),
    cutRight: candidate.cutRight.map(point => ({ ...point })),
    straightSparRods: candidate.straightSparRods.map(rod => ({ ...rod })),
    servoChannels: candidate.servoChannels.map(channel => ({ ...channel })),
    offsets: { ...candidate.defaultOffsets },
    visible: true
  })
  assemblyFileStatus.textContent = 'Збірку змінено — збережіть файл'
  renderAssemblyPartsList()
}

addLeftWingButton.addEventListener('click', () => addCurrentCandidateToAssembly('left'))
addRightWingButton.addEventListener('click', () => addCurrentCandidateToAssembly('right'))
addFuselagePartButton.addEventListener('click', () => addCurrentCandidateToAssembly('fuselage'))

saveAssemblyButton.addEventListener('click', () => {
  if (!assemblyParts.length) return
  const assembly = createAssemblyFile(assemblyParts)
  const date = new Date().toISOString().slice(0, 10)
  downloadTextFile(
    `${JSON.stringify(assembly, null, 2)}\n`,
    `foamcut-assembly-${date}.foamcut-assembly.json`,
    'application/json'
  )
  assemblyFileStatus.textContent = `Збірку збережено: ${assembly.parts.length} деталей`
})

loadAssemblyButton.addEventListener('click', async () => {
  const file = assemblyFileInput.files[0]
  if (!file) {
    assemblyFileStatus.textContent = 'Спочатку виберіть файл збірки'
    return
  }
  try {
    const assembly = parseAssemblyFile(await file.text())
    assemblyParts.splice(0, assemblyParts.length, ...assembly.parts)
    nextAssemblyPartId = Math.max(...assemblyParts.map(part => part.id), 0) + 1
    renderAssemblyPartsList()
    assemblyFileStatus.textContent = `Збірку ${file.name} відкрито: ${assemblyParts.length} деталей`
  } catch (error) {
    assemblyFileStatus.textContent = `Не вдалося відкрити збірку: ${error.message}`
  }
})

const assemblyCameraViews = {
  iso: { yaw: -35, pitch: -22 },
  front: { yaw: 0, pitch: 0 },
  side: { yaw: -90, pitch: 0 },
  top: { yaw: 0, pitch: -90 }
}
const resetAssemblyCamera = viewName => {
  const view = assemblyCameraViews[viewName] || assemblyCameraViews.iso
  assemblyCamera.yaw = view.yaw
  assemblyCamera.pitch = view.pitch
  assemblyCamera.zoom = 1
  assemblyCamera.panX = 0
  assemblyCamera.panY = 0
  updateAssemblySvg()
}
document.querySelectorAll('[data-assembly-camera]').forEach(button => {
  button.addEventListener('click', () => resetAssemblyCamera(button.dataset.assemblyCamera))
})
measureAssemblyButton.addEventListener('click', () => {
  assemblyMeasurement.active = !assemblyMeasurement.active
  measureAssemblyButton.classList.toggle('active', assemblyMeasurement.active)
  assemblySvg.classList.toggle('measuring', assemblyMeasurement.active)
})
clearAssemblyMeasureButton.addEventListener('click', () => {
  assemblyMeasurement.points = []
  updateAssemblySvg()
})
smallerAssemblyMeasureButton.addEventListener('click', () => {
  adjustMeasurementText(assemblyMeasurement, -2, updateAssemblySvg)
})
largerAssemblyMeasureButton.addEventListener('click', () => {
  adjustMeasurementText(assemblyMeasurement, 2, updateAssemblySvg)
})
assemblySvg.addEventListener('click', event => {
  if (assemblyMeasurement.active) {
    selectMeasurementPoint(assemblySvg, assemblyMeasurement, event, updateAssemblySvg)
  }
})
let assemblyCameraDrag = null
assemblySvg.addEventListener('pointerdown', event => {
  if (assemblyMeasurement.active) return
  const pan = event.button === 2 || (event.button === 0 && event.shiftKey)
  if (event.button !== 0 && event.button !== 2) return
  assemblyCameraDrag = { x: event.clientX, y: event.clientY, pan }
  assemblySvg.setPointerCapture(event.pointerId)
  event.preventDefault()
})
assemblySvg.addEventListener('pointermove', event => {
  if (!assemblyCameraDrag) return
  const deltaX = event.clientX - assemblyCameraDrag.x
  const deltaY = event.clientY - assemblyCameraDrag.y
  assemblyCameraDrag.x = event.clientX
  assemblyCameraDrag.y = event.clientY
  if (assemblyCameraDrag.pan) {
    assemblyCamera.panX += deltaX
    assemblyCamera.panY += deltaY
  } else {
    assemblyCamera.yaw += deltaX * 0.45
    assemblyCamera.pitch = Math.max(-89, Math.min(89, assemblyCamera.pitch - deltaY * 0.4))
  }
  updateAssemblySvg()
})
assemblySvg.addEventListener('pointerup', event => {
  assemblyCameraDrag = null
  if (assemblySvg.hasPointerCapture(event.pointerId)) assemblySvg.releasePointerCapture(event.pointerId)
})
assemblySvg.addEventListener('pointercancel', () => { assemblyCameraDrag = null })
assemblySvg.addEventListener('contextmenu', event => event.preventDefault())
assemblySvg.addEventListener('wheel', event => {
  event.preventDefault()
  assemblyCamera.zoom = Math.max(
    0.25,
    Math.min(5, assemblyCamera.zoom * Math.exp(-event.deltaY * 0.001))
  )
  updateAssemblySvg()
}, { passive: false })
assemblySvg.addEventListener('dblclick', () => resetAssemblyCamera('iso'))
updateAssemblyCandidateControls()
renderAssemblyPartsList()

const assignSelectedDxfContour = side => {
  const state = dxfSides[side]
  const contour = getSelectedDxfContour(side)
  if (!contour) return

  const pointCount = Math.max(2, Number(dxfPointCountInput.value) || 200)
  const startIndex = Number(state.startInput.value) || 0
  activeStraightSparRods = []
  activeServoChannels = []
  preparedDxfProfiles[side] = {
    points: resampleDxfContour(contour, pointCount, startIndex, state.reverseInput.checked),
    contourIndex: Number(state.contourSelect.value),
    startIndex,
    reverse: state.reverseInput.checked
  }
  updateDxfAssignmentStatus()
  updateProjectSaveAvailability()

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
    activeStraightSparRods = []
    activeServoChannels = []
    const model = parseDxf(await file.text())
    state.model = model
    preparedDxfProfiles[side] = null
    preparedCuttingTrajectory = null
    updateGeneratedNcPreview()
    updateProjectSaveAvailability()
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
    preparedCuttingTrajectory = null
    updateGeneratedNcPreview()
    updateProjectSaveAvailability()
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
Object.values(machineLimitInputs).forEach(input => {
  input.addEventListener('input', updateGeneratedNcPreview)
})
wireSpanInput.addEventListener('input', updateGeneratedNcPreview)
generateNcButton.addEventListener('click', updateGeneratedNcPreview)
downloadNcButton.addEventListener('click', () => {
  if (!generatedNcText) return

  const blobUrl = URL.createObjectURL(new Blob([generatedNcText], { type: 'text/plain' }))
  const downloadLink = document.createElement('a')
  downloadLink.href = blobUrl
  downloadLink.download = 'foamcut-generated.nc'
  downloadLink.click()
  URL.revokeObjectURL(blobUrl)
})

const downloadRecoveredDxf = side => {
  if (!recoveredNcProfiles) return

  const isLeft = side === 'left'
  const points = isLeft ? recoveredNcProfiles.leftPoints : recoveredNcProfiles.rightPoints
  const closed = isLeft ? recoveredNcProfiles.leftClosed : recoveredNcProfiles.rightClosed
  const fileName = isLeft ? 'profile_XY.dxf' : 'profile_AZ.dxf'
  const layer = isLeft ? 'XY_PROFILE' : 'AZ_PROFILE'
  const dxfText = createDxfPolyline(points, layer, closed)
  const blobUrl = URL.createObjectURL(new Blob([dxfText], { type: 'application/dxf' }))
  const downloadLink = document.createElement('a')
  downloadLink.href = blobUrl
  downloadLink.download = fileName
  document.body.appendChild(downloadLink)
  downloadLink.click()
  downloadLink.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

downloadNcDxfLeftButton.addEventListener('click', () => downloadRecoveredDxf('left'))
downloadNcDxfRightButton.addEventListener('click', () => downloadRecoveredDxf('right'))

loadButton.addEventListener('click', async () => {
  const file = fileInput.files[0]

  if (!file) {
    status.textContent = 'Спочатку виберіть NC-файл'
    return
  }

  const text = await file.text()
activeStraightSparRods = []
activeServoChannels = []
recoveredNcProfiles = null
downloadNcDxfLeftButton.disabled = true
downloadNcDxfRightButton.disabled = true
ncToDxfStatus.textContent = 'Пошук профілів у NC...'
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
        ncToDxfStatus.textContent = 'Не вдалося відновити профілі з цього NC'
        return
    }

    recoveredNcProfiles = recoverNcProfiles(text, leftPoints, rightPoints)
    downloadNcDxfLeftButton.disabled = false
    downloadNcDxfRightButton.disabled = false
    preparedDxfProfiles.left = { points: recoveredNcProfiles.leftPoints, source: 'nc' }
    preparedDxfProfiles.right = { points: recoveredNcProfiles.rightPoints, source: 'nc' }
    preparedCuttingTrajectory = null
    updateGeneratedNcPreview()
    showProfileInDxfPanel(
      'left',
      recoveredNcProfiles.leftPoints,
      recoveredNcProfiles.leftClosed,
      `Відновлено з ${file.name} — X/Y`
    )
    showProfileInDxfPanel(
      'right',
      recoveredNcProfiles.rightPoints,
      recoveredNcProfiles.rightClosed,
      `Відновлено з ${file.name} — A/Z`
    )
    updateDxfAssignmentStatus()
    updateProjectSaveAvailability()

    const recoveryMessage = {
      embedded: 'Точні чисті профілі відновлено зі службових даних FoamCut',
      detected: 'Замкнені профілі знайдено автоматично',
      full: 'Службових даних немає: DXF міститиме повну траєкторію NC'
    }
    ncToDxfStatus.textContent = recoveryMessage[recoveredNcProfiles.method]

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
    marginX: 50,
    marginY: 50,
    width: 800,
    height: 500
  },
  camera: {
    yaw: -28,
    pitch: -18,
    zoom: 1,
    panX: 0,
    panY: 0
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
let cutSurfaceLayer = null
let lastCutSurfaceIndex = 0
let activeFoamBounds = null

const appendCutSurfaceSegment = index => {
  if (!cutSurfaceLayer || !showCutSurfaceInput.checked || index <= 0 || index >= count3d) return

  const offsetX = machineScene.profileOffset.x
  const offsetY = machineScene.profileOffset.y
  const previousLeft = {
    x: leftPoints[index - 1].x + offsetX,
    y: leftPoints[index - 1].y + offsetY
  }
  const currentLeft = {
    x: leftPoints[index].x + offsetX,
    y: leftPoints[index].y + offsetY
  }
  const previousRight = {
    x: rightPoints[index - 1].x + offsetX,
    y: rightPoints[index - 1].y + offsetY
  }
  const currentRight = {
    x: rightPoints[index].x + offsetX,
    y: rightPoints[index].y + offsetY
  }
  const insideFoam = point => activeFoamBounds
    && point.x >= activeFoamBounds.minX
    && point.x <= activeFoamBounds.maxX
    && point.y >= activeFoamBounds.minY
    && point.y <= activeFoamBounds.maxY

  if (![previousLeft, currentLeft, previousRight, currentRight].every(insideFoam)) return

  const corners = [
    project3d(previousLeft.x, previousLeft.y, machineScene.leftDepth),
    project3d(currentLeft.x, currentLeft.y, machineScene.leftDepth),
    project3d(currentRight.x, currentRight.y, machineScene.rightDepth),
    project3d(previousRight.x, previousRight.y, machineScene.rightDepth)
  ]
  svgElement("polygon", {
    points: polygonPoints(corners),
    fill: "#38bdf8",
    "fill-opacity": "0.28",
    stroke: "#0284c7",
    "stroke-opacity": "0.32",
    "stroke-width": "0.7"
  }, cutSurfaceLayer)
}

const updateMachinePosition = index => {
  const i = Math.min(index, count3d - 1)

  if (i === 0 && lastCutSurfaceIndex > 0) {
    cutSurfaceLayer?.replaceChildren()
    lastCutSurfaceIndex = 0
  } else if (i > lastCutSurfaceIndex) {
    for (let segmentIndex = lastCutSurfaceIndex + 1; segmentIndex <= i; segmentIndex++) {
      appendCutSurfaceSegment(segmentIndex)
    }
    lastCutSurfaceIndex = i
  }

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
  const camera = machineScene.camera
  const rawCorners = []

  machineScene.rightDepth = width
  machineScene.profileOffset.x = profileOffsetX
  machineScene.profileOffset.y = profileOffsetY
  activeFoamBounds = { minX: 0, maxX: length, minY: 0, maxY: height }

  const sceneCenter = {
    x: (sceneMinX + sceneMaxX) / 2,
    y: (frameBottom + frameTop) / 2,
    depth: (machineScene.leftDepth + machineScene.rightDepth) / 2
  }
  const yaw = camera.yaw * Math.PI / 180
  const pitch = camera.pitch * Math.PI / 180
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const rotateForCamera = (x, y, depth) => {
    const dx = x - sceneCenter.x
    const dy = y - sceneCenter.y
    const dz = depth - sceneCenter.depth
    const yawX = dx * cosYaw - dz * sinYaw
    const yawDepth = dx * sinYaw + dz * cosYaw
    const pitchY = dy * cosPitch - yawDepth * sinPitch

    return [yawX, pitchY]
  }

  for (const x of [sceneMinX, sceneMaxX]) {
    for (const y of [frameBottom, frameTop]) {
      for (const depth of [machineScene.leftDepth, machineScene.rightDepth]) {
        rawCorners.push(rotateForCamera(x, y, depth))
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
  ) * camera.zoom
  const rawCenterX = (rawMinX + rawMaxX) / 2
  const rawCenterY = (rawMinY + rawMaxY) / 2

  project3d = (x, y, depth) => {
    const [projectedX, projectedY] = rotateForCamera(x, y, depth)

    return [
      projection.width / 2 + (projectedX - rawCenterX) * millimetersToSvg + camera.panX,
      projection.height / 2 - (projectedY - rawCenterY) * millimetersToSvg + camera.panY
    ]
  }

  svg3d.replaceChildren()

  const frameLayer = svgElement("g", { "data-layer": "machine-frame" })
  const foamLayer = svgElement("g", { "data-layer": "foam-block" })
  const sparLayer = svgElement("g", { "data-layer": "straight-spar-rods" })
  const servoChannelLayer = svgElement("g", { "data-layer": "servo-wire-channels" })
  cutSurfaceLayer = svgElement("g", { "data-layer": "cut-surface" })
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

  activeStraightSparRods.forEach((rod, index) => {
    const leftEnd = project3d(
      rod.x + machineScene.profileOffset.x,
      rod.y + machineScene.profileOffset.y,
      machineScene.leftDepth
    )
    const rightEnd = project3d(
      rod.x + machineScene.profileOffset.x,
      rod.y + machineScene.profileOffset.y,
      machineScene.rightDepth
    )
    svgElement("line", {
      x1: leftEnd[0],
      y1: leftEnd[1],
      x2: rightEnd[0],
      y2: rightEnd[1],
      stroke: "#111827",
      "stroke-width": Math.max(3, rod.diameter * millimetersToSvg),
      "stroke-opacity": "0.78",
      "stroke-linecap": "round"
    }, sparLayer)
    svgElement("text", {
      x: leftEnd[0] + 7,
      y: leftEnd[1] - 7,
      fill: "#111827",
      "font-size": "12",
      "font-weight": "700"
    }, sparLayer).textContent = `Прут ${index + 1} Ø${rod.diameter} мм`
  })

  activeServoChannels.forEach((channel, index) => {
    const rootEnd = project3d(
      channel.rootX + machineScene.profileOffset.x,
      channel.rootY + machineScene.profileOffset.y,
      machineScene.leftDepth
    )
    const tipEnd = project3d(
      channel.tipX + machineScene.profileOffset.x,
      channel.tipY + machineScene.profileOffset.y,
      machineScene.rightDepth
    )
    const averageDiameter = (channel.rootDiameter + channel.tipDiameter) / 2
    svgElement("line", {
      x1: rootEnd[0],
      y1: rootEnd[1],
      x2: tipEnd[0],
      y2: tipEnd[1],
      stroke: "#f97316",
      "stroke-width": Math.max(3, averageDiameter * millimetersToSvg),
      "stroke-opacity": "0.62",
      "stroke-dasharray": "7 4",
      "stroke-linecap": "round"
    }, servoChannelLayer)
    svgElement("text", {
      x: rootEnd[0] + 7,
      y: rootEnd[1] + 16,
      fill: "#c2410c",
      "font-size": "12",
      "font-weight": "700"
    }, servoChannelLayer).textContent = `Канал серви ${index + 1}`
  })

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
  lastCutSurfaceIndex = 0
  const visibleCutIndex = Math.min(wireIndex, count3d - 1)
  for (let segmentIndex = 1; segmentIndex <= visibleCutIndex; segmentIndex++) {
    appendCutSurfaceSegment(segmentIndex)
  }
  lastCutSurfaceIndex = visibleCutIndex
  updateMachinePosition(wireIndex)
}

renderActiveFoamBlock = renderMachineScene
renderMachineScene()

const cameraViews = {
  iso: { yaw: -28, pitch: -18 },
  front: { yaw: 0, pitch: 0 },
  left: { yaw: -90, pitch: 0 },
  right: { yaw: 90, pitch: 0 },
  top: { yaw: 0, pitch: -90 }
}
const resetCameraView = viewName => {
  const view = cameraViews[viewName] || cameraViews.iso
  machineScene.camera.yaw = view.yaw
  machineScene.camera.pitch = view.pitch
  machineScene.camera.zoom = 1
  machineScene.camera.panX = 0
  machineScene.camera.panY = 0
  renderMachineScene()
}
let cameraDrag = null

svg3d.onpointerdown = event => {
  const pan = event.button === 2 || (event.button === 0 && event.shiftKey)
  if (event.button !== 0 && event.button !== 2) return
  cameraDrag = { x: event.clientX, y: event.clientY, pan }
  svg3d.setPointerCapture(event.pointerId)
  event.preventDefault()
}
svg3d.onpointermove = event => {
  if (!cameraDrag) return
  const deltaX = event.clientX - cameraDrag.x
  const deltaY = event.clientY - cameraDrag.y
  cameraDrag.x = event.clientX
  cameraDrag.y = event.clientY

  if (cameraDrag.pan) {
    machineScene.camera.panX += deltaX
    machineScene.camera.panY += deltaY
  } else {
    machineScene.camera.yaw += deltaX * 0.45
    machineScene.camera.pitch = Math.max(
      -89,
      Math.min(89, machineScene.camera.pitch - deltaY * 0.4)
    )
  }
  renderMachineScene()
}
svg3d.onpointerup = event => {
  cameraDrag = null
  if (svg3d.hasPointerCapture(event.pointerId)) svg3d.releasePointerCapture(event.pointerId)
}
svg3d.onpointercancel = () => { cameraDrag = null }
svg3d.oncontextmenu = event => event.preventDefault()
svg3d.onwheel = event => {
  event.preventDefault()
  const zoomFactor = Math.exp(-event.deltaY * 0.001)
  machineScene.camera.zoom = Math.max(0.25, Math.min(5, machineScene.camera.zoom * zoomFactor))
  renderMachineScene()
}
svg3d.ondblclick = () => resetCameraView('iso')
document.querySelectorAll('[data-camera-view]').forEach(button => {
  button.onclick = () => resetCameraView(button.dataset.cameraView)
})
showCutSurfaceInput.onchange = renderMachineScene

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

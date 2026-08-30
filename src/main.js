import './style.css'
import { createAssemblyFile, parseAssemblyFile } from './assembly-file.js'
import { renderAssemblyView } from './assembly-view.js'
import { createBlockPlanFile, parseBlockPlanFile } from './block-plan.js'
import {
  createBatchCutRoute,
  createBatchMach3Nc,
  createBatchSetupMapSvg,
  createMultiBlockLayouts,
  renderBatchLayoutPreview,
  renderBatchRouteOverlay
} from './batch-layout.js'
import { parseDxf, renderDxfPreview, resampleDxfContour } from './dxf.js'
import { createDxfPolyline, createPreviewModel, recoverNcProfiles } from './nc-dxf.js'
import { createFoamCutProject, parseFoamCutProject } from './project-file.js'
import {
  builtinFuselageTemplates,
  cloneFuselageTemplate,
  loadUserFuselageTemplates,
  saveUserFuselageTemplates
} from './fuselage-library.js'
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

    <div class="project-controls" data-workspace="files">
      <input type="file" id="projectFile" accept=".json,.foamcut">
      <button id="loadProject">Відкрити проєкт</button>
      <button id="saveProject" disabled>Зберегти проєкт</button>
      <span id="projectStatus">Проєкт ще не збережено</span>
    </div>

    <section class="profile-library" data-workspace="library">
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
          <h3>Бібліотека фюзеляжів</h3>
          <div class="fuselage-template-toolbar">
            <label>Готовий або власний шаблон
              <select id="fuselageTemplate"></select>
            </label>
            <button id="applyFuselageTemplate" type="button">Завантажити шаблон</button>
            <label>Назва власного шаблону
              <input id="fuselageTemplateName" type="text" placeholder="Мій фюзеляж">
            </label>
            <button id="saveFuselageTemplate" type="button">Зберегти у бібліотеці</button>
            <button id="deleteFuselageTemplate" type="button" disabled>Видалити власний</button>
          </div>
          <p id="fuselageTemplateDescription">Виберіть готову форму або збережіть власну конфігурацію.</p>
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
            <button id="fitLibraryPreview" type="button">Показати все</button>
            <button id="expandLibraryPreview" type="button">На весь екран</button>
          </div>
          <svg id="libraryPreviewSvg" viewBox="0 0 800 500" aria-label="Попередній 3D-перегляд деталі"></svg>
          <p id="libraryPreviewStatus">Змінюйте параметри — модель оновлюється автоматично</p>
          <small>Миша: ліва — орбіта · Shift + ліва або права — переміщення · колесо — масштаб</small>
        </aside>
        </div>
      </div>
    </section>

    <div class="nc-file-controls" data-workspace="files">
      <input type="file" id="ncFile" accept=".nc,.tap,.gcode,.txt">
      <button id="load">Завантажити NC</button>
    </div>
    <div class="nc-to-dxf-controls" data-workspace="files">
      <button id="downloadNcDxfLeft" disabled>Завантажити DXF X/Y</button>
      <button id="downloadNcDxfRight" disabled>Завантажити DXF A/Z</button>
      <span id="ncToDxfStatus">Відкрийте NC для відновлення профілів</span>
    </div>

    <section id="dxfProfiles" class="dxf-profiles" data-workspace="files">
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
        <div class="block-placement-controls">
          <label><input id="blockCompensation" type="checkbox"> Компенсація положення блока</label>
          <label>Режим установки
            <select id="blockPlacementMode">
              <option value="center">Фіксовані стійки — по центру</option>
              <option value="manual">Фіксовані стійки — вручну</option>
              <option value="auto">Рухомі стійки — найкоротша безпечна струна</option>
            </select>
          </label>
          <label>Від лівої каретки, мм
            <input id="blockLeftGap" type="number" min="0" step="1" value="460">
          </label>
          <label>Безпечний проміжок, мм
            <input id="blockSafeGap" type="number" min="0" step="1" value="50">
          </label>
          <p id="blockPlacementStatus">Компенсацію вимкнено — профілі передаються кареткам без перерахунку</p>
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

    <section class="trajectory-workspace" data-workspace="simulation">
      <h2>Траєкторія різання</h2>
      <svg id="trajectory"
         viewBox="0 0 800 500"
         width="800"
         height="500"
         style="border:1px solid #888">
      </svg>
      <p id="status">Виберіть NC-файл</p>
    </section>
  </div>
`

const view3d = document.getElementById('view3d')

view3d.innerHTML = `
  <h2 data-workspace="simulation">Просторовий вигляд струни</h2>
  <div class="three-d-controls" data-workspace="simulation">
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
      <button id="expandSimulationView" type="button">На весь екран</button>
      <label><input id="showCutSurface" type="checkbox" checked> Показувати вирізану поверхню</label>
    </div>
    <p class="orbit-help">Миша: ліва — орбіта; Shift + ліва або права — переміщення; коліщатко — масштаб</p>
  </div>
  <svg id="svg3d" data-workspace="simulation" width="800" height="500" style="border:1px solid #999"></svg>
  <section class="assembly-workspace" data-workspace="assembly">
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
    <div class="assembly-layout">
      <div class="assembly-view-column">
        <div class="assembly-orbit-controls">
          <button data-assembly-camera="iso">Ізометрія</button>
          <button data-assembly-camera="front">Спереду</button>
          <button data-assembly-camera="side">Збоку</button>
          <button data-assembly-camera="top">Зверху</button>
          <button id="measureAssembly" type="button">Рулетка</button>
          <button id="clearAssemblyMeasure" type="button">Очистити</button>
          <button id="smallerAssemblyMeasure" type="button">Текст −</button>
          <button id="largerAssemblyMeasure" type="button">Текст +</button>
          <button id="expandAssemblyView" type="button">На весь екран</button>
        </div>
        <p class="orbit-help">Збірка: короткий клік — вибір деталі; ліва кнопка — орбіта; Shift + ліва або права — переміщення; коліщатко — масштаб</p>
        <svg id="assemblySvg" viewBox="0 0 800 500" width="800" height="500"></svg>
        <p id="assemblyStatus">Збірка поки порожня</p>
      </div>
      <aside class="assembly-parts-panel">
        <h3>Деталі та координати</h3>
        <p id="assemblySelectionStatus">Клацніть деталь у 3D або виберіть її зі списку</p>
        <div id="assemblyPartsList" class="assembly-parts-list"></div>
      </aside>
    </div>
  </section>
  <section class="batch-layout-workspace" data-workspace="blocks">
    <h2>Менеджер блоків і розкладка деталей</h2>
    <p>Розподіл видимих секцій між будь-якою кількістю піноблоків у фізичних міліметрах.</p>
    <div class="batch-block-toolbar">
      <label>Поточний блок <select id="batchBlockSelect"></select></label>
      <button id="addBatchBlock" type="button">+ Додати блок</button>
      <button id="removeBatchBlock" type="button">Видалити блок</button>
    </div>
    <div class="batch-plan-file-controls">
      <input id="batchPlanFile" type="file" accept=".json,.foamcut-blocks">
      <button id="loadBatchPlan" type="button">Відкрити план блоків</button>
      <button id="saveBatchPlan" type="button">Зберегти план блоків</button>
      <span id="batchPlanFileStatus">План блоків ще не збережено</span>
    </div>
    <div class="batch-section-assignment-panel">
      <h3>Ручний розподіл секцій</h3>
      <p>Залиште «Автоматично» або закріпіть секцію за конкретним блоком.</p>
      <div id="batchSectionAssignments" class="batch-section-assignments"></div>
    </div>
    <div class="batch-layout-controls">
      <label>Ширина блока, мм <input id="batchBlockWidth" type="number" min="1" step="1" value="600"></label>
      <label>Висота блока, мм <input id="batchBlockHeight" type="number" min="1" step="1" value="600"></label>
      <label>Товщина вздовж струни, мм <input id="batchBlockThickness" type="number" min="1" step="1" value="100"></label>
      <label>Стовпців <input id="batchColumns" type="number" min="1" max="9" step="1" value="3"></label>
      <label>Безпечний коридор, мм <input id="batchCorridor" type="number" min="0" step="1" value="20"></label>
      <button id="buildBatchLayout" type="button">Автоматично розподілити секції</button>
      <button id="expandBatchView" type="button">На весь екран</button>
    </div>
    <p id="batchLayoutStatus">Додайте секції до збірки та натисніть «Розкласти секції»</p>
    <p class="batch-drag-help">Перетягніть секцію мишкою у потрібну комірку. Зайняті секції автоматично поміняються місцями.</p>
    <div class="batch-layout-previews">
      <div><h3>Ліва сторона X/Y</h3><svg id="batchLeftSvg"></svg></div>
      <div><h3>Права сторона A/Z</h3><svg id="batchRightSvg"></svg></div>
    </div>
    <div class="batch-nc-actions">
      <button id="simulateBatch" type="button" disabled>Перевірити весь прохід у 2D/3D</button>
      <button id="downloadBatchMap" type="button" disabled>Зберегти карту поточного блока</button>
      <button id="downloadAllBatchMaps" type="button" disabled>Зберегти всі карти</button>
      <button id="downloadBatchNc" type="button" disabled>Завантажити NC поточного блока</button>
      <button id="downloadAllBatchNc" type="button" disabled>Завантажити всі NC</button>
      <span>Швидкість береться з поля «Швидкість різання» біля профілів DXF.</span>
    </div>
    <textarea id="batchNcPreview" rows="10" readonly
      placeholder="Після безпечної розкладки тут з’явиться спільний NC/G-code"></textarea>
  </section>
`

const initializeWorkspaceTabs = () => {
  const container = document.querySelector('.container')
  const tabs = [
    { id: 'library', label: 'Бібліотека деталей' },
    { id: 'files', label: 'Файли та NC' },
    { id: 'simulation', label: 'Симуляція 2D/3D' },
    { id: 'assembly', label: 'Збірка' },
    { id: 'blocks', label: 'Блоки й розкладка' }
  ]
  const navigation = document.createElement('nav')
  navigation.className = 'workspace-tabs'
  navigation.setAttribute('role', 'tablist')
  navigation.setAttribute('aria-label', 'Робочі області FoamCut Simulator')
  const panels = document.createElement('div')
  panels.className = 'workspace-panels'
  const panelById = new Map()

  tabs.forEach(tab => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'workspace-tab'
    button.dataset.workspaceTab = tab.id
    button.setAttribute('role', 'tab')
    button.textContent = tab.label
    navigation.appendChild(button)
    const panel = document.createElement('section')
    panel.className = 'workspace-panel'
    panel.dataset.workspacePanel = tab.id
    panel.setAttribute('role', 'tabpanel')
    panel.hidden = true
    panelById.set(tab.id, panel)
    panels.appendChild(panel)
  })

  document.querySelectorAll('[data-workspace]').forEach(element => {
    panelById.get(element.dataset.workspace)?.appendChild(element)
  })
  container.append(navigation, panels)
  const libraryPanel = document.getElementById('profileLibraryPanel')
  const libraryToggle = document.getElementById('toggleProfileLibrary')
  libraryPanel.hidden = false
  libraryToggle.setAttribute('aria-expanded', 'true')
  document.getElementById('view3d').remove()

  const activate = id => {
    const selectedId = panelById.has(id) ? id : 'library'
    navigation.querySelectorAll('[data-workspace-tab]').forEach(button => {
      const selected = button.dataset.workspaceTab === selectedId
      button.classList.toggle('active', selected)
      button.setAttribute('aria-selected', String(selected))
    })
    panelById.forEach((panel, panelId) => { panel.hidden = panelId !== selectedId })
    try { localStorage.setItem('foamcut-workspace-tab', selectedId) } catch {}
    window.dispatchEvent(new Event('resize'))
  }
  navigation.addEventListener('click', event => {
    const button = event.target.closest('[data-workspace-tab]')
    if (button) activate(button.dataset.workspaceTab)
  })
  let initialTab = 'library'
  try { initialTab = localStorage.getItem('foamcut-workspace-tab') || initialTab } catch {}
  activate(initialTab)
}

initializeWorkspaceTabs()

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
const fuselageTemplateInput = document.querySelector('#fuselageTemplate')
const applyFuselageTemplateButton = document.querySelector('#applyFuselageTemplate')
const fuselageTemplateNameInput = document.querySelector('#fuselageTemplateName')
const saveFuselageTemplateButton = document.querySelector('#saveFuselageTemplate')
const deleteFuselageTemplateButton = document.querySelector('#deleteFuselageTemplate')
const fuselageTemplateDescription = document.querySelector('#fuselageTemplateDescription')
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
const fitLibraryPreviewButton = document.querySelector('#fitLibraryPreview')
const expandLibraryPreviewButton = document.querySelector('#expandLibraryPreview')
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
const blockCompensationInput = document.querySelector('#blockCompensation')
const blockPlacementModeInput = document.querySelector('#blockPlacementMode')
const blockLeftGapInput = document.querySelector('#blockLeftGap')
const blockSafeGapInput = document.querySelector('#blockSafeGap')
const blockPlacementStatus = document.querySelector('#blockPlacementStatus')
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
const expandSimulationViewButton = document.getElementById('expandSimulationView')
const addLeftWingButton = document.getElementById('addLeftWing')
const addRightWingButton = document.getElementById('addRightWing')
const addFuselagePartButton = document.getElementById('addFuselagePart')
const assemblyCandidateStatus = document.getElementById('assemblyCandidateStatus')
const assemblyPartsList = document.getElementById('assemblyPartsList')
const assemblySvg = document.getElementById('assemblySvg')
const assemblyStatus = document.getElementById('assemblyStatus')
const assemblySelectionStatus = document.getElementById('assemblySelectionStatus')
const measureAssemblyButton = document.getElementById('measureAssembly')
const clearAssemblyMeasureButton = document.getElementById('clearAssemblyMeasure')
const smallerAssemblyMeasureButton = document.getElementById('smallerAssemblyMeasure')
const largerAssemblyMeasureButton = document.getElementById('largerAssemblyMeasure')
const assemblyFileInput = document.getElementById('assemblyFile')
const loadAssemblyButton = document.getElementById('loadAssembly')
const saveAssemblyButton = document.getElementById('saveAssembly')
const assemblyFileStatus = document.getElementById('assemblyFileStatus')
const expandAssemblyViewButton = document.getElementById('expandAssemblyView')
const batchBlockWidthInput = document.getElementById('batchBlockWidth')
const batchBlockHeightInput = document.getElementById('batchBlockHeight')
const batchBlockThicknessInput = document.getElementById('batchBlockThickness')
const batchColumnsInput = document.getElementById('batchColumns')
const batchCorridorInput = document.getElementById('batchCorridor')
const batchBlockSelect = document.getElementById('batchBlockSelect')
const addBatchBlockButton = document.getElementById('addBatchBlock')
const removeBatchBlockButton = document.getElementById('removeBatchBlock')
const batchPlanFileInput = document.getElementById('batchPlanFile')
const loadBatchPlanButton = document.getElementById('loadBatchPlan')
const saveBatchPlanButton = document.getElementById('saveBatchPlan')
const batchPlanFileStatus = document.getElementById('batchPlanFileStatus')
const batchSectionAssignments = document.getElementById('batchSectionAssignments')
const buildBatchLayoutButton = document.getElementById('buildBatchLayout')
const expandBatchViewButton = document.getElementById('expandBatchView')
const batchLayoutStatus = document.getElementById('batchLayoutStatus')
const batchLeftSvg = document.getElementById('batchLeftSvg')
const batchRightSvg = document.getElementById('batchRightSvg')
const simulateBatchButton = document.getElementById('simulateBatch')
const downloadBatchMapButton = document.getElementById('downloadBatchMap')
const downloadAllBatchMapsButton = document.getElementById('downloadAllBatchMaps')
const downloadBatchNcButton = document.getElementById('downloadBatchNc')
const downloadAllBatchNcButton = document.getElementById('downloadAllBatchNc')
const batchNcPreview = document.getElementById('batchNcPreview')
let renderActiveFoamBlock = null
const preparedDxfProfiles = { left: null, right: null }
const cuttingSettings = { feedRate: 300 }
let preparedCuttingTrajectory = null
let generatedNcText = ''
let generatedBatchNcText = ''
let currentBatchSimulation = null
let nextBatchBlockId = 2
const batchBlocks = [{ id: 1, name: 'Блок 1', width: 600, height: 600, thickness: 100, columns: 3 }]
const batchAssignments = new Map()
const batchSlotAssignments = new Map()
let currentBatchPackages = []
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
let userFuselageTemplates = loadUserFuselageTemplates()
let libraryPreviewMode = 'wing'
const libraryPreviewCamera = { yaw: -35, pitch: -22, zoom: 1, panX: 0, panY: 0 }
const libraryMeasurement = { active: false, points: [], fontSize: 22 }
const assemblyMeasurement = { active: false, points: [], fontSize: 22 }
const assemblyParts = []
let nextAssemblyPartId = 1
let selectedAssemblyPartId = null
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

const expandedViewers = [
  [expandLibraryPreviewButton, document.querySelector('.library-preview-panel')],
  [expandSimulationViewButton, svg3d.closest('.workspace-panel')],
  [expandAssemblyViewButton, document.querySelector('.assembly-workspace')],
  [expandBatchViewButton, document.querySelector('.batch-layout-workspace')]
]

const closeExpandedViewers = () => {
  expandedViewers.forEach(([button, target]) => {
    target.classList.remove('viewer-expanded')
    button.textContent = 'На весь екран'
    button.setAttribute('aria-pressed', 'false')
  })
  document.body.classList.remove('viewer-expanded-open')
}

expandedViewers.forEach(([button, target]) => {
  button.setAttribute('aria-pressed', 'false')
  button.addEventListener('click', () => {
    const expand = !target.classList.contains('viewer-expanded')
    closeExpandedViewers()
    if (expand) {
      target.classList.add('viewer-expanded')
      button.textContent = 'Закрити весь екран'
      button.setAttribute('aria-pressed', 'true')
      document.body.classList.add('viewer-expanded-open')
    }
    window.dispatchEvent(new Event('resize'))
  })
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeExpandedViewers()
})

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

const allFuselageTemplates = () => [...builtinFuselageTemplates, ...userFuselageTemplates]

const selectedFuselageTemplate = () => allFuselageTemplates()
  .find(template => template.id === fuselageTemplateInput.value)

const renderFuselageTemplateOptions = (selectedId = fuselageTemplateInput.value || 'glider') => {
  fuselageTemplateInput.replaceChildren()
  const addGroup = (label, templates) => {
    const group = document.createElement('optgroup')
    group.label = label
    templates.forEach(template => {
      const option = document.createElement('option')
      option.value = template.id
      option.textContent = template.name
      group.appendChild(option)
    })
    fuselageTemplateInput.appendChild(group)
  }
  addGroup('Готові шаблони', builtinFuselageTemplates)
  if (userFuselageTemplates.length) addGroup('Мої шаблони', userFuselageTemplates)
  fuselageTemplateInput.value = allFuselageTemplates().some(template => template.id === selectedId)
    ? selectedId
    : 'glider'
  const template = selectedFuselageTemplate()
  fuselageTemplateDescription.textContent = template?.description || ''
  deleteFuselageTemplateButton.disabled = !template || template.builtin
  fuselageTemplateNameInput.value = template && !template.builtin ? template.name : ''
}

const captureCurrentFuselageTemplate = name => {
  fuselageStations = readFuselageStations()
  saveSelectedSectionSettings()
  return {
    name,
    description: `Власний шаблон «${name}»`,
    length: Math.max(1, Number(fuselageLengthInput.value) || 900),
    width: Math.max(1, Number(fuselageWidthInput.value) || 140),
    height: Math.max(1, Number(fuselageHeightInput.value) || 160),
    stations: fuselageStations.map(station => ({ ...station })),
    sectionSettings: fuselageSectionSettings.map(settings => ({ ...settings })),
    tube: {
      enabled: fuselageTubeInput.checked,
      diameter: Math.max(1, Number(fuselageTubeDiameterInput.value) || 8),
      clearance: Math.max(0, Number(fuselageTubeClearanceInput.value) || 0),
      height: Number(fuselageTubeHeightInput.value) || 0,
      sideOffset: Number(fuselageTubeSideOffsetInput.value) || 0,
      start: Math.max(0, Number(fuselageTubeStartInput.value) || 0),
      length: Math.max(1, Number(fuselageTubeLengthInput.value) || 1)
    }
  }
}

const applyFuselageTemplate = template => {
  const copy = cloneFuselageTemplate(template)
  fuselageLengthInput.value = copy.length
  fuselageWidthInput.value = copy.width
  fuselageHeightInput.value = copy.height
  fuselageStations = copy.stations.map((station, index) => ({
    ...station,
    id: station.id || `template-${index}`
  }))
  fuselageSectionSettings = fuselageStations.slice(0, -1).map((station, index) => ({
    hollow: Boolean(copy.sectionSettings?.[index]?.hollow),
    wallThickness: Math.max(1, Number(copy.sectionSettings?.[index]?.wallThickness) || 5),
    bottomThickness: Math.max(1, Number(copy.sectionSettings?.[index]?.bottomThickness) || 5)
  }))
  const tube = copy.tube || {}
  fuselageTubeInput.checked = Boolean(tube.enabled)
  fuselageTubeDiameterInput.value = tube.diameter ?? 8
  fuselageTubeClearanceInput.value = tube.clearance ?? 0.4
  fuselageTubeHeightInput.value = tube.height ?? 70
  fuselageTubeSideOffsetInput.value = tube.sideOffset ?? 0
  fuselageTubeStartInput.value = tube.start ?? 0
  fuselageTubeLengthInput.value = tube.length ?? Math.max(1, copy.length - 50)
  renderFuselageStations()
  loadSelectedSectionSettings()
  syncFuselageTubeControls()
  fuselageLibraryStatus.className = 'profile-library-valid'
  fuselageLibraryStatus.textContent = `Шаблон «${copy.name}» завантажено: ${fuselageStations.length - 1} секц.`
  scheduleLibraryPreview('fuselage')
}

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
renderFuselageTemplateOptions()

fuselageTemplateInput.addEventListener('change', () => {
  const template = selectedFuselageTemplate()
  fuselageTemplateDescription.textContent = template?.description || ''
  deleteFuselageTemplateButton.disabled = !template || template.builtin
  fuselageTemplateNameInput.value = template && !template.builtin ? template.name : ''
})

applyFuselageTemplateButton.addEventListener('click', () => {
  const template = selectedFuselageTemplate()
  if (template) applyFuselageTemplate(template)
})

saveFuselageTemplateButton.addEventListener('click', () => {
  const name = fuselageTemplateNameInput.value.trim()
  if (!name) {
    fuselageLibraryStatus.className = 'profile-library-error'
    fuselageLibraryStatus.textContent = 'Введіть назву власного шаблону'
    return
  }
  const selected = selectedFuselageTemplate()
  const existingIndex = selected && !selected.builtin
    ? userFuselageTemplates.findIndex(template => template.id === selected.id)
    : userFuselageTemplates.findIndex(template => template.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  const id = existingIndex >= 0 ? userFuselageTemplates[existingIndex].id : `user-${Date.now()}`
  const template = { id, builtin: false, ...captureCurrentFuselageTemplate(name) }
  if (existingIndex >= 0) userFuselageTemplates[existingIndex] = template
  else userFuselageTemplates.push(template)
  saveUserFuselageTemplates(userFuselageTemplates)
  renderFuselageTemplateOptions(id)
  fuselageLibraryStatus.className = 'profile-library-valid'
  fuselageLibraryStatus.textContent = `Власний шаблон «${name}» збережено у бібліотеці цього комп’ютера`
})

deleteFuselageTemplateButton.addEventListener('click', () => {
  const template = selectedFuselageTemplate()
  if (!template || template.builtin) return
  userFuselageTemplates = userFuselageTemplates.filter(item => item.id !== template.id)
  saveUserFuselageTemplates(userFuselageTemplates)
  renderFuselageTemplateOptions('glider')
  fuselageLibraryStatus.className = 'profile-library-valid'
  fuselageLibraryStatus.textContent = `Власний шаблон «${template.name}» видалено`
})

previewWingButton.addEventListener('click', () => scheduleLibraryPreview('wing'))
previewFuselageButton.addEventListener('click', () => scheduleLibraryPreview('fuselage'))
fitLibraryPreviewButton.addEventListener('click', () => {
  Object.assign(libraryPreviewCamera, { yaw: -35, pitch: -22, zoom: 1, panX: 0, panY: 0 })
  scheduleLibraryPreview()
})
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
  if (event.button !== 0 && event.button !== 2) return
  libraryPreviewDrag = {
    x: event.clientX,
    y: event.clientY,
    yaw: libraryPreviewCamera.yaw,
    pitch: libraryPreviewCamera.pitch,
    panX: libraryPreviewCamera.panX,
    panY: libraryPreviewCamera.panY,
    pan: event.button === 2 || (event.button === 0 && event.shiftKey)
  }
  libraryPreviewSvg.setPointerCapture(event.pointerId)
  event.preventDefault()
})
libraryPreviewSvg.addEventListener('pointermove', event => {
  if (!libraryPreviewDrag) return
  if (libraryPreviewDrag.pan) {
    libraryPreviewCamera.panX = libraryPreviewDrag.panX + event.clientX - libraryPreviewDrag.x
    libraryPreviewCamera.panY = libraryPreviewDrag.panY + event.clientY - libraryPreviewDrag.y
  } else {
    libraryPreviewCamera.yaw = libraryPreviewDrag.yaw + (event.clientX - libraryPreviewDrag.x) * 0.45
    libraryPreviewCamera.pitch = Math.max(-89, Math.min(89, libraryPreviewDrag.pitch - (event.clientY - libraryPreviewDrag.y) * 0.45))
  }
  scheduleLibraryPreview()
})
libraryPreviewSvg.addEventListener('pointerup', () => { libraryPreviewDrag = null })
libraryPreviewSvg.addEventListener('pointercancel', () => { libraryPreviewDrag = null })
libraryPreviewSvg.addEventListener('wheel', event => {
  event.preventDefault()
  libraryPreviewCamera.zoom = Math.max(0.3, Math.min(4, libraryPreviewCamera.zoom * Math.exp(-event.deltaY * 0.001)))
  scheduleLibraryPreview()
}, { passive: false })
libraryPreviewSvg.addEventListener('contextmenu', event => event.preventDefault())

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
  if (preparedDxfProfiles.left && preparedDxfProfiles.right) renderPreparedDxfSimulation()
  else if (preparedCuttingTrajectory) updateGeneratedNcPreview()
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
  blockCompensation: blockCompensationInput.checked,
  blockPlacementMode: blockPlacementModeInput.value,
  blockLeftGap: Number(blockLeftGapInput.value),
  blockSafeGap: Number(blockSafeGapInput.value),
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
  blockCompensationInput.checked = settings.blockCompensation === true
  if (['center', 'manual', 'auto'].includes(settings.blockPlacementMode)) {
    blockPlacementModeInput.value = settings.blockPlacementMode
  }
  if (Number.isFinite(Number(settings.blockLeftGap))) blockLeftGapInput.value = Number(settings.blockLeftGap)
  if (Number.isFinite(Number(settings.blockSafeGap))) blockSafeGapInput.value = Number(settings.blockSafeGap)
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

const calculateBlockSetup = (blockWidthOverride = Number(foamWidthInput.value)) => {
  const blockWidth = Number(blockWidthOverride)
  if (!Number.isFinite(blockWidth) || blockWidth <= 0) throw new Error('Довжина блока має бути більшою за нуль')
  const configuredSpan = Number(wireSpanInput.value)
  const safeGap = Math.max(0, Number(blockSafeGapInput.value) || 0)
  let wireSpan = Number.isFinite(configuredSpan) && configuredSpan > 0 ? configuredSpan : 1060
  let leftGap
  if (blockPlacementModeInput.value === 'auto') {
    wireSpan = blockWidth + safeGap * 2
    leftGap = safeGap
  } else if (blockPlacementModeInput.value === 'manual') {
    leftGap = Math.max(0, Number(blockLeftGapInput.value) || 0)
  } else {
    leftGap = (wireSpan - blockWidth) / 2
  }
  const rightGap = wireSpan - blockWidth - leftGap
  if (wireSpan < blockWidth || leftGap < 0 || rightGap < 0) {
    throw new Error('Блок не вміщується між каретками при заданому положенні')
  }
  return { wireSpan, blockWidth, leftGap, rightGap, mode: blockPlacementModeInput.value }
}

const projectProfilesToCarriages = (leftPoints, rightPoints, setup) => {
  const leftFactor = setup.leftGap / setup.blockWidth
  const rightFactor = setup.rightGap / setup.blockWidth
  return {
    leftPoints: leftPoints.map((left, index) => {
      const right = rightPoints[index]
      return {
        x: left.x - (right.x - left.x) * leftFactor,
        y: left.y - (right.y - left.y) * leftFactor
      }
    }),
    rightPoints: rightPoints.map((right, index) => {
      const left = leftPoints[index]
      return {
        x: right.x + (right.x - left.x) * rightFactor,
        y: right.y + (right.y - left.y) * rightFactor
      }
    })
  }
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
  if (trajectory.blockSetup) {
    lines.push(`(Block setup: wire ${formatNcNumber(trajectory.blockSetup.wireSpan)} mm, `
      + `left gap ${formatNcNumber(trajectory.blockSetup.leftGap)} mm, `
      + `block ${formatNcNumber(trajectory.blockSetup.blockWidth)} mm, `
      + `right gap ${formatNcNumber(trajectory.blockSetup.rightGap)} mm)`)
  }

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
  const useProfileOffsets = trajectory.applyProfileOffsets !== false
  const offsetX = useProfileOffsets ? Math.max(0, Number(profileLengthOffsetInput.value) || 0) : 0
  const offsetY = useProfileOffsets ? Math.max(0, Number(profileHeightOffsetInput.value) || 0) : 0
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
    if (minimum < -0.0005) errors.push(`${labels[axis]}: мінімум ${formatNcNumber(minimum)} мм нижче нуля`)
    if (maximum > limit + 0.0005) errors.push(`${labels[axis]}: максимум ${formatNcNumber(maximum)} мм перевищує ${limit} мм`)
  }

  const configuredWireSpan = Number(trajectory.blockSetup?.wireSpan ?? wireSpanInput.value)
  const wireSpan = Number.isFinite(configuredWireSpan) && configuredWireSpan > 0
    ? configuredWireSpan
    : 1060
  const foamWidth = Number(trajectory.blockSetup?.blockWidth ?? foamWidthInput.value) || 0
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
  const faceLeftPoints = buildCuttingPath(preparedDxfProfiles.left.points, effectivePassMode)
  const faceRightPoints = buildCuttingPath(preparedDxfProfiles.right.points, effectivePassMode)

  if (faceLeftPoints.length !== faceRightPoints.length) {
    preparedCuttingTrajectory = null
    updateGeneratedNcPreview()
    dxfAssignmentStatus.textContent += '; кількість точок сторін не збігається'
    return
  }
  let blockSetup = null
  let leftPoints = faceLeftPoints
  let rightPoints = faceRightPoints
  try {
    if (blockCompensationInput.checked) {
      blockSetup = calculateBlockSetup()
      const carriagePaths = projectProfilesToCarriages(faceLeftPoints, faceRightPoints, blockSetup)
      leftPoints = carriagePaths.leftPoints
      rightPoints = carriagePaths.rightPoints
      blockLeftGapInput.value = Math.round(blockSetup.leftGap * 1000) / 1000
      blockPlacementStatus.textContent = `Струна ${formatNcNumber(blockSetup.wireSpan)} мм: `
        + `лівий проміжок ${formatNcNumber(blockSetup.leftGap)} мм; блок ${formatNcNumber(blockSetup.blockWidth)} мм; `
        + `правий проміжок ${formatNcNumber(blockSetup.rightGap)} мм`
    } else {
      blockPlacementStatus.textContent = 'Компенсацію вимкнено — профілі передаються кареткам без перерахунку'
    }
  } catch (error) {
    preparedCuttingTrajectory = null
    blockPlacementStatus.textContent = `Помилка установки: ${error.message}`
    updateGeneratedNcPreview()
    return
  }

  preparedCuttingTrajectory = {
    leftPoints,
    rightPoints,
    sourceLeftPoints: preparedDxfProfiles.left.points.map(point => ({ ...point })),
    sourceRightPoints: preparedDxfProfiles.right.points.map(point => ({ ...point })),
    feedRate: cuttingSettings.feedRate,
    passMode: effectivePassMode,
    blockSetup
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

const syncAssemblySelectionUi = () => {
  let selectedPart = assemblyParts.find(part => part.id === selectedAssemblyPartId)
  if (!selectedPart) {
    selectedAssemblyPartId = null
    selectedPart = null
  }
  assemblyPartsList.querySelectorAll('.assembly-part-row').forEach(row => {
    row.classList.toggle('selected', String(selectedAssemblyPartId) === row.dataset.partId)
  })
  assemblySelectionStatus.textContent = selectedPart
    ? `${selectedPart.name}: X ${selectedPart.offsets.x} · Y ${selectedPart.offsets.y} · Z ${selectedPart.offsets.z} мм`
    : 'Клацніть деталь у 3D або виберіть її зі списку'
}

const updateAssemblySvg = () => {
  const renderedParts = assemblyParts.map(part => ({
    ...part,
    assemblySelected: part.id === selectedAssemblyPartId
  }))
  const result = renderAssemblyView(assemblySvg, renderedParts, assemblyCamera, assemblyMeasurement)
  saveAssemblyButton.disabled = assemblyParts.length === 0
  assemblyStatus.textContent = result.visibleCount
    ? `У збірці ${assemblyParts.length} деталей; показано ${result.visibleCount}. `
      + 'Виберіть потрібну деталь для симуляції та створення NC.'
    : `У збірці ${assemblyParts.length} деталей; усі деталі приховані`
  syncAssemblySelectionUi()
}

const selectAssemblyPartInWorkspace = (partId, scrollToRow = true) => {
  const part = assemblyParts.find(item => item.id === partId)
  if (!part) return
  selectedAssemblyPartId = part.id
  updateAssemblySvg()
  const row = [...assemblyPartsList.querySelectorAll('.assembly-part-row')]
    .find(element => element.dataset.partId === String(part.id))
  if (scrollToRow) row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  assemblyStatus.textContent = `${part.name} вибрано у збірці; координати показано праворуч`
}

const selectedBatchBlock = () => batchBlocks.find(block => block.id === Number(batchBlockSelect.value)) || batchBlocks[0]

function renderBatchSectionAssignments () {
  batchSectionAssignments.replaceChildren()
  const parts = assemblyParts.filter(part => part.visible && part.kind === 'fuselage')
  if (!parts.length) {
    batchSectionAssignments.textContent = 'У збірці поки немає видимих секцій фюзеляжу'
    return
  }
  parts.forEach((part, index) => {
    const row = document.createElement('label')
    row.className = 'batch-section-assignment-row'
    const name = document.createElement('span')
    name.textContent = `${index + 1}. ${part.name}`
    const select = document.createElement('select')
    const automatic = document.createElement('option')
    automatic.value = ''
    automatic.textContent = 'Автоматично'
    select.appendChild(automatic)
    batchBlocks.forEach(block => {
      const option = document.createElement('option')
      option.value = block.id
      option.textContent = block.name
      select.appendChild(option)
    })
    const assignedBlock = batchAssignments.get(part.id)
    select.value = batchBlocks.some(block => block.id === assignedBlock) ? String(assignedBlock) : ''
    select.addEventListener('change', () => {
      const blockId = Number(select.value)
      if (blockId) batchAssignments.set(part.id, blockId)
      else batchAssignments.delete(part.id)
      batchSlotAssignments.delete(part.id)
      batchPlanFileStatus.textContent = 'Ручний розподіл змінено — збережіть план блоків'
      clearBatchResult()
    })
    const locatedPackage = currentBatchPackages.find(packageData => (
      packageData.layout.items.some(item => item.part.id === part.id)
    ))
    const locatedItem = locatedPackage?.layout.items.find(item => item.part.id === part.id)
    const lockedSlot = batchSlotAssignments.get(part.id)
    const lockButton = document.createElement('button')
    lockButton.type = 'button'
    lockButton.className = 'batch-slot-lock'
    if (lockedSlot != null) {
      lockButton.textContent = `Місце ${lockedSlot + 1} ✓`
      lockButton.title = 'Відпустити закріплене місце'
    } else {
      lockButton.textContent = locatedItem ? `Закріпити місце ${locatedItem.index + 1}` : 'Закріпити місце'
      lockButton.disabled = !locatedItem
    }
    lockButton.addEventListener('click', () => {
      if (batchSlotAssignments.has(part.id)) {
        batchSlotAssignments.delete(part.id)
        batchPlanFileStatus.textContent = `${part.name}: місце відпущено`
      } else if (locatedPackage && locatedItem) {
        batchAssignments.set(part.id, locatedPackage.layout.block.id)
        batchSlotAssignments.set(part.id, locatedItem.index)
        batchPlanFileStatus.textContent = `${part.name}: закріплено у ${locatedPackage.layout.block.name}, місце ${locatedItem.index + 1}`
      }
      clearBatchResult()
    })
    row.append(name, select, lockButton)
    batchSectionAssignments.appendChild(row)
  })
}

const syncBatchBlockControls = () => {
  const block = selectedBatchBlock()
  batchBlockWidthInput.value = block.width
  batchBlockHeightInput.value = block.height
  batchBlockThicknessInput.value = block.thickness
  batchColumnsInput.value = block.columns
  removeBatchBlockButton.disabled = batchBlocks.length === 1
}

const renderBatchBlockSelect = () => {
  const selectedId = Number(batchBlockSelect.value) || batchBlocks[0].id
  batchBlockSelect.replaceChildren()
  batchBlocks.forEach((block, index) => {
    const option = document.createElement('option')
    option.value = block.id
    const packageData = currentBatchPackages.find(item => item.layout.block.id === block.id)
    option.textContent = `${block.name} — ${packageData?.layout.items.length ?? 0} секц.`
    batchBlockSelect.appendChild(option)
  })
  batchBlockSelect.value = String(batchBlocks.some(block => block.id === selectedId) ? selectedId : batchBlocks[0].id)
  syncBatchBlockControls()
  renderBatchSectionAssignments()
}

const clearBatchResult = (message = 'Параметри блоків змінено — виконайте розподіл повторно') => {
  currentBatchPackages = []
  generatedBatchNcText = ''
  currentBatchSimulation = null
  batchLeftSvg.replaceChildren()
  batchRightSvg.replaceChildren()
  batchNcPreview.value = ''
  simulateBatchButton.disabled = true
  downloadBatchMapButton.disabled = true
  downloadAllBatchMapsButton.disabled = true
  downloadBatchNcButton.disabled = true
  downloadAllBatchNcButton.disabled = true
  batchLayoutStatus.className = ''
  batchLayoutStatus.textContent = message
  renderBatchBlockSelect()
}

const createBatchPackage = layout => {
  const faceRoute = createBatchCutRoute(layout)
  let blockSetup = null
  let events = faceRoute.events
  if (blockCompensationInput.checked) {
    blockSetup = calculateBlockSetup(layout.blockThickness)
    const carriage = projectProfilesToCarriages(
      events.map(event => event.left),
      events.map(event => event.right),
      blockSetup
    )
    events = events.map((event, index) => ({
      ...event, left: carriage.leftPoints[index], right: carriage.rightPoints[index]
    }))
  }
  const feedRate = Math.max(1, Number(cutFeedRateInput.value) || 300)
  const trajectory = {
    leftPoints: events.map(event => event.left),
    rightPoints: events.map(event => event.right),
    feedRate, blockSetup, applyProfileOffsets: false
  }
  return {
    layout, faceRoute, feedRate, blockSetup,
    validation: validateMachineEnvelope(trajectory),
    nc: createBatchMach3Nc(events, feedRate, blockSetup)
  }
}

const showSelectedBatchPackage = () => {
  const packageData = currentBatchPackages.find(item => item.layout.block.id === selectedBatchBlock().id)
  batchLeftSvg.replaceChildren()
  batchRightSvg.replaceChildren()
  if (!packageData) {
    generatedBatchNcText = ''
    currentBatchSimulation = null
    batchNcPreview.value = ''
    simulateBatchButton.disabled = true
    downloadBatchMapButton.disabled = true
    downloadBatchNcButton.disabled = true
    return
  }
  const { layout, faceRoute, feedRate, validation, nc } = packageData
  renderBatchLayoutPreview(batchLeftSvg, layout, 'left')
  renderBatchLayoutPreview(batchRightSvg, layout, 'right')
  renderBatchRouteOverlay(batchLeftSvg, faceRoute, layout.blockHeight, 'left')
  renderBatchRouteOverlay(batchRightSvg, faceRoute, layout.blockHeight, 'right')
  generatedBatchNcText = nc
  currentBatchSimulation = {
    leftPoints: faceRoute.events.map(event => ({ ...event.left })),
    rightPoints: faceRoute.events.map(event => ({ ...event.right })),
    layout, feedRate
  }
  batchNcPreview.value = nc
  simulateBatchButton.disabled = false
  downloadBatchMapButton.disabled = false
  downloadBatchNcButton.disabled = !validation.valid
}

let batchLayoutDrag = null

const batchPointerPosition = (svg, event, layout) => {
  const rectangle = svg.getBoundingClientRect()
  return {
    x: (event.clientX - rectangle.left) * layout.blockWidth / rectangle.width,
    screenY: (event.clientY - rectangle.top) * layout.blockHeight / rectangle.height
  }
}

const clearBatchDropHighlight = () => {
  document.querySelectorAll('.batch-drop-target').forEach(element => element.remove())
}

const showBatchDropHighlight = (layout, slot) => {
  clearBatchDropHighlight()
  const row = Math.floor(slot / layout.columns)
  const column = slot % layout.columns
  ;[batchLeftSvg, batchRightSvg].forEach(svg => {
    const rectangle = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rectangle.classList.add('batch-drop-target')
    rectangle.setAttribute('x', column * layout.cellWidth + 2)
    rectangle.setAttribute('y', row * layout.cellHeight + 2)
    rectangle.setAttribute('width', Math.max(0, layout.cellWidth - 4))
    rectangle.setAttribute('height', Math.max(0, layout.cellHeight - 4))
    rectangle.setAttribute('pointer-events', 'none')
    svg.appendChild(rectangle)
  })
}

const batchSlotAtPointer = (svg, event, layout) => {
  const point = batchPointerPosition(svg, event, layout)
  const column = Math.max(0, Math.min(layout.columns - 1, Math.floor(point.x / layout.cellWidth)))
  const row = Math.max(0, Math.min(layout.rows - 1, Math.floor(point.screenY / layout.cellHeight)))
  return row * layout.columns + column
}

const attachBatchLayoutDragging = svg => {
  svg.addEventListener('pointerdown', event => {
    const packageData = currentBatchPackages.find(item => item.layout.block.id === selectedBatchBlock().id)
    const itemElement = event.target.closest?.('[data-batch-part-id]')
    if (!packageData || !itemElement) return
    const item = packageData.layout.items.find(candidate => String(candidate.part.id) === itemElement.dataset.batchPartId)
    if (!item) return
    batchLayoutDrag = { svg, packageData, item, targetSlot: item.index }
    svg.classList.add('batch-layout-dragging')
    svg.setPointerCapture(event.pointerId)
    showBatchDropHighlight(packageData.layout, item.index)
    event.preventDefault()
  })
  svg.addEventListener('pointermove', event => {
    if (!batchLayoutDrag || batchLayoutDrag.svg !== svg) return
    batchLayoutDrag.targetSlot = batchSlotAtPointer(svg, event, batchLayoutDrag.packageData.layout)
    showBatchDropHighlight(batchLayoutDrag.packageData.layout, batchLayoutDrag.targetSlot)
  })
  const finishDrag = event => {
    if (!batchLayoutDrag || batchLayoutDrag.svg !== svg) return
    const { packageData, item, targetSlot } = batchLayoutDrag
    const occupant = packageData.layout.items.find(candidate => candidate.index === targetSlot && candidate.part.id !== item.part.id)
    batchAssignments.set(item.part.id, packageData.layout.block.id)
    batchSlotAssignments.set(item.part.id, targetSlot)
    if (occupant) {
      batchAssignments.set(occupant.part.id, packageData.layout.block.id)
      batchSlotAssignments.set(occupant.part.id, item.index)
    }
    batchPlanFileStatus.textContent = occupant
      ? `${item.part.name} і ${occupant.part.name}: місцями ${item.index + 1} та ${targetSlot + 1} поміняно`
      : `${item.part.name}: закріплено у місці ${targetSlot + 1}`
    batchLayoutDrag = null
    svg.classList.remove('batch-layout-dragging')
    clearBatchDropHighlight()
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    buildBatchLayoutPreview()
  }
  svg.addEventListener('pointerup', finishDrag)
  svg.addEventListener('pointercancel', event => {
    batchLayoutDrag = null
    svg.classList.remove('batch-layout-dragging')
    clearBatchDropHighlight()
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
  })
}

attachBatchLayoutDragging(batchLeftSvg)
attachBatchLayoutDragging(batchRightSvg)

const buildBatchLayoutPreview = () => {
  try {
    const fuselageParts = assemblyParts.filter(part => part.visible && part.kind === 'fuselage')
    const layouts = createMultiBlockLayouts(
      fuselageParts,
      batchBlocks,
      Math.max(0, Number(batchCorridorInput.value) || 0),
      batchAssignments,
      batchSlotAssignments
    )
    currentBatchPackages = layouts.filter(layout => layout.items.length).map(createBatchPackage)
    renderBatchBlockSelect()
    showSelectedBatchPackage()
    const invalid = currentBatchPackages.filter(item => !item.validation.valid)
    downloadAllBatchMapsButton.disabled = currentBatchPackages.length === 0
    downloadAllBatchNcButton.disabled = currentBatchPackages.length === 0 || invalid.length > 0
    batchLayoutStatus.className = invalid.length ? 'batch-layout-error' : 'batch-layout-valid'
    batchLayoutStatus.textContent = `${fuselageParts.length} секцій розподілено між ${currentBatchPackages.length} із ${batchBlocks.length} блоків: `
      + currentBatchPackages.map(item => `${item.layout.block.name} — ${item.layout.items.length}`).join('; ')
      + (invalid.length ? `. NC заблоковано для: ${invalid.map(item => item.layout.block.name).join(', ')}` : '. Усі NC пройшли перевірку.')
  } catch (error) {
    clearBatchResult(`Розкладку не побудовано: ${error.message}`)
    batchLayoutStatus.className = 'batch-layout-error'
  }
}

renderBatchBlockSelect()

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
    row.dataset.partId = part.id
    row.classList.toggle('selected', part.id === selectedAssemblyPartId)
    const visibleLabel = document.createElement('label')
    const visibleInput = document.createElement('input')
    visibleInput.type = 'checkbox'
    visibleInput.checked = part.visible
    visibleInput.addEventListener('change', () => {
      part.visible = visibleInput.checked
      assemblyFileStatus.textContent = 'Збірку змінено — збережіть файл'
      updateAssemblySvg()
      renderBatchSectionAssignments()
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
    selectButton.addEventListener('click', () => {
      selectAssemblyPartInWorkspace(part.id)
      selectAssemblyPartForCutting(part)
    })
    row.appendChild(selectButton)
    assemblyPartsList.appendChild(row)
  }
  updateAssemblySvg()
  renderBatchSectionAssignments()
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
batchBlockSelect.addEventListener('change', () => {
  syncBatchBlockControls()
  showSelectedBatchPackage()
})
;[
  [batchBlockWidthInput, 'width'],
  [batchBlockHeightInput, 'height'],
  [batchBlockThicknessInput, 'thickness'],
  [batchColumnsInput, 'columns']
].forEach(([input, field]) => {
  input.addEventListener('change', () => {
    const value = Math.max(1, Number(input.value) || 1)
    selectedBatchBlock()[field] = field === 'columns' ? Math.floor(value) : value
    batchPlanFileStatus.textContent = 'План блоків змінено — збережіть його'
    clearBatchResult()
  })
})
batchCorridorInput.addEventListener('change', () => {
  batchPlanFileStatus.textContent = 'План блоків змінено — збережіть його'
  clearBatchResult()
})
addBatchBlockButton.addEventListener('click', () => {
  const source = selectedBatchBlock()
  const blockId = nextBatchBlockId++
  const block = {
    id: blockId,
    name: `Блок ${blockId}`,
    width: source.width,
    height: source.height,
    thickness: source.thickness,
    columns: source.columns
  }
  batchBlocks.push(block)
  batchPlanFileStatus.textContent = 'План блоків змінено — збережіть його'
  batchBlockSelect.value = String(block.id)
  renderBatchBlockSelect()
  batchBlockSelect.value = String(block.id)
  syncBatchBlockControls()
  clearBatchResult(`Додано ${block.name} — виконайте автоматичний розподіл`)
  batchBlockSelect.value = String(block.id)
  syncBatchBlockControls()
})
removeBatchBlockButton.addEventListener('click', () => {
  if (batchBlocks.length === 1) return
  const block = selectedBatchBlock()
  for (const [partId, blockId] of batchAssignments) {
    if (blockId === block.id) {
      batchAssignments.delete(partId)
      batchSlotAssignments.delete(partId)
    }
  }
  batchBlocks.splice(batchBlocks.indexOf(block), 1)
  batchPlanFileStatus.textContent = 'План блоків змінено — збережіть його'
  clearBatchResult(`${block.name} видалено — виконайте автоматичний розподіл`)
})
saveBatchPlanButton.addEventListener('click', () => {
  try {
    const assignmentRecords = [...batchAssignments].map(([partId, blockId]) => ({
      partId,
      blockNumber: batchBlocks.findIndex(block => block.id === blockId) + 1,
      slot: batchSlotAssignments.get(partId) ?? null
    })).filter(assignment => assignment.blockNumber > 0)
    const plan = createBlockPlanFile(batchBlocks, batchCorridorInput.value, assignmentRecords)
    const date = new Date().toISOString().slice(0, 10)
    downloadTextFile(`${JSON.stringify(plan, null, 2)}\n`, `foamcut-block-plan-${date}.foamcut-blocks.json`, 'application/json')
    batchPlanFileStatus.textContent = `План збережено: ${plan.blocks.length} блоків`
  } catch (error) {
    batchPlanFileStatus.textContent = `Не вдалося зберегти план: ${error.message}`
  }
})
loadBatchPlanButton.addEventListener('click', async () => {
  const file = batchPlanFileInput.files[0]
  if (!file) {
    batchPlanFileStatus.textContent = 'Спочатку виберіть файл плану блоків'
    return
  }
  try {
    const plan = parseBlockPlanFile(await file.text())
    batchBlocks.splice(0, batchBlocks.length, ...plan.blocks.map(block => ({
      ...block, id: nextBatchBlockId++
    })))
    batchAssignments.clear()
    batchSlotAssignments.clear()
    plan.assignments.forEach(assignment => {
      const block = batchBlocks[assignment.blockNumber - 1]
      if (block) {
        batchAssignments.set(assignment.partId, block.id)
        if (assignment.slot != null) batchSlotAssignments.set(assignment.partId, assignment.slot)
      }
    })
    batchCorridorInput.value = plan.corridor
    renderBatchBlockSelect()
    clearBatchResult(`План ${file.name} відкрито — виконується розподіл`)
    batchPlanFileStatus.textContent = `Відкрито ${file.name}: ${batchBlocks.length} блоків`
    if (assemblyParts.some(part => part.visible && part.kind === 'fuselage')) buildBatchLayoutPreview()
  } catch (error) {
    batchPlanFileStatus.textContent = `Не вдалося відкрити план: ${error.message}`
  }
})
buildBatchLayoutButton.addEventListener('click', buildBatchLayoutPreview)
simulateBatchButton.addEventListener('click', () => {
  if (!currentBatchSimulation) return
  const { layout, leftPoints, rightPoints, feedRate } = currentBatchSimulation
  foamLengthInput.value = layout.blockWidth
  foamWidthInput.value = layout.blockThickness
  foamHeightInput.value = layout.blockHeight
  profileLengthOffsetInput.value = 0
  profileHeightOffsetInput.value = 0
  activeStraightSparRods = []
  activeServoChannels = []
  renderSimulation(
    leftPoints,
    rightPoints,
    `${layout.block.name}: пакетне різання ${layout.items.length} секцій; змійка ${layout.columns}×${layout.rows}; `
      + `блок ${layout.blockWidth}×${layout.blockHeight}×${layout.blockThickness} мм; F${formatNcNumber(feedRate)} мм/хв`
  )
  batchLayoutStatus.className = 'batch-layout-valid'
  batchLayoutStatus.textContent = 'Пакетну траєкторію передано у 2D/3D. Керуйте проходом кнопками Пауза, Стоп і На початок.'
  svg.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
const batchFileNumber = block => String(batchBlocks.indexOf(block) + 1).padStart(2, '0')
const selectedBatchPackage = () => currentBatchPackages.find(item => item.layout.block.id === selectedBatchBlock().id)
const createMapForPackage = packageData => {
  const blockNumber = batchBlocks.indexOf(packageData.layout.block) + 1
  return createBatchSetupMapSvg(packageData.layout, packageData.faceRoute, {
    blockNumber,
    ncFileName: `foamcut-fuselage-block-${String(blockNumber).padStart(2, '0')}.nc`,
    blockSetup: packageData.blockSetup
  })
}
downloadBatchMapButton.addEventListener('click', () => {
  const packageData = selectedBatchPackage()
  if (!packageData) return
  const blockNumber = batchFileNumber(packageData.layout.block)
  downloadTextFile(createMapForPackage(packageData), `foamcut-block-map-${blockNumber}.svg`, 'image/svg+xml')
})
downloadAllBatchMapsButton.addEventListener('click', () => {
  currentBatchPackages.forEach((packageData, index) => {
    const blockNumber = batchFileNumber(packageData.layout.block)
    setTimeout(() => downloadTextFile(
      createMapForPackage(packageData),
      `foamcut-block-map-${blockNumber}.svg`,
      'image/svg+xml'
    ), index * 120)
  })
  batchLayoutStatus.className = 'batch-layout-valid'
  batchLayoutStatus.textContent = `Завантаження ${currentBatchPackages.length} карт встановлення розпочато`
})
downloadBatchNcButton.addEventListener('click', () => {
  if (!generatedBatchNcText) return
  const blockNumber = batchFileNumber(selectedBatchBlock())
  downloadTextFile(generatedBatchNcText, `foamcut-fuselage-block-${blockNumber}.nc`, 'text/plain')
})
downloadAllBatchNcButton.addEventListener('click', () => {
  if (!currentBatchPackages.length || currentBatchPackages.some(item => !item.validation.valid)) return
  currentBatchPackages.forEach((packageData, index) => {
    const blockNumber = String(batchBlocks.indexOf(packageData.layout.block) + 1).padStart(2, '0')
    setTimeout(() => downloadTextFile(
      packageData.nc,
      `foamcut-fuselage-block-${blockNumber}.nc`,
      'text/plain'
    ), index * 120)
  })
  batchLayoutStatus.className = 'batch-layout-valid'
  batchLayoutStatus.textContent = `Завантаження ${currentBatchPackages.length} перевірених NC-файлів розпочато`
})

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
    selectedAssemblyPartId = null
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
let assemblySuppressClick = false
assemblySvg.addEventListener('click', event => {
  if (assemblyMeasurement.active) {
    selectMeasurementPoint(assemblySvg, assemblyMeasurement, event, updateAssemblySvg)
  } else if (!assemblySuppressClick) {
    const partElement = event.target.closest?.('[data-assembly-part-id]')
    if (partElement) selectAssemblyPartInWorkspace(Number(partElement.dataset.assemblyPartId))
  }
})
let assemblyCameraDrag = null
assemblySvg.addEventListener('pointerdown', event => {
  if (assemblyMeasurement.active) return
  const pan = event.button === 2 || (event.button === 0 && event.shiftKey)
  if (event.button !== 0 && event.button !== 2) return
  assemblyCameraDrag = { x: event.clientX, y: event.clientY, pan, moved: false }
  assemblySvg.setPointerCapture(event.pointerId)
  event.preventDefault()
})
assemblySvg.addEventListener('pointermove', event => {
  if (!assemblyCameraDrag) return
  const deltaX = event.clientX - assemblyCameraDrag.x
  const deltaY = event.clientY - assemblyCameraDrag.y
  if (Math.hypot(deltaX, deltaY) > 2) assemblyCameraDrag.moved = true
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
  assemblySuppressClick = Boolean(assemblyCameraDrag?.moved)
  assemblyCameraDrag = null
  if (assemblySvg.hasPointerCapture(event.pointerId)) assemblySvg.releasePointerCapture(event.pointerId)
  setTimeout(() => { assemblySuppressClick = false }, 0)
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
wireSpanInput.addEventListener('input', renderPreparedDxfSimulation)
const syncBlockPlacementControls = () => {
  blockLeftGapInput.disabled = blockPlacementModeInput.value !== 'manual'
  blockSafeGapInput.disabled = blockPlacementModeInput.value !== 'auto'
}
;[blockCompensationInput, blockPlacementModeInput, blockLeftGapInput, blockSafeGapInput].forEach(input => {
  input.addEventListener('input', renderPreparedDxfSimulation)
  input.addEventListener('change', () => {
    syncBlockPlacementControls()
    renderPreparedDxfSimulation()
  })
})
syncBlockPlacementControls()
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

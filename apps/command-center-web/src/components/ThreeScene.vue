<template>
  <div ref="containerRef" class="three-container">
    <!-- 视角控制按钮 -->
    <div class="view-controls">
      <button class="vc-btn" :class="{ active: currentView === 'free' }" @click="setView('free')" title="自由视角">
        <span class="vc-icon">◎</span>
      </button>
      <button class="vc-btn" :class="{ active: currentView === 'top' }" @click="setView('top')" title="俯瞰">
        <span class="vc-icon">▣</span>
      </button>
      <button class="vc-btn" :class="{ active: currentView === 'side' }" @click="setView('side')" title="侧视">
        <span class="vc-icon">▯</span>
      </button>
      <button class="vc-btn" :class="{ active: currentView === 'section' }" @click="setView('section')" title="剖面">
        <span class="vc-icon">◫</span>
      </button>
    </div>
    <div class="three-overlay-hint">
      <span>拖拽旋转 · 滚轮缩放 · 右键平移</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useSensorStore } from '../stores/sensorData'
const containerRef = ref<HTMLDivElement>()
const store = useSensorStore()

const currentView = ref('free')

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number
let poolMesh: THREE.Group
let waterSurface: THREE.Mesh
let sensorMarkers: THREE.Mesh[] = []
let sensorLines: THREE.Line[] = []
let alertRing: THREE.Mesh | null = null
let heatMapTexture: THREE.CanvasTexture | null = null
let heatMapCanvas: HTMLCanvasElement
let heatMapCtx: CanvasRenderingContext2D
let aeratorBlades: THREE.Group | null = null
let feederParticles: THREE.Points | null = null
let feederParticleData: { velocity: THREE.Vector3; life: number }[] = []
let cloudParticles: THREE.Points | null = null
let cloudParticleData: { baseX: number; baseZ: number; y: number; phase: number; speed: number }[] = []
const PARTICLE_COUNT = 80
const CLOUD_COUNT = 120

const sensorUV: [number, number, string][] = [
  [-1.5, -0.8, 'DO'], [1.5, -0.8, 'pH'],
  [-1.5, 0.8, 'TEMP'], [1.5, 0.8, 'DO'],
  [0, 0, 'DO'], [-0.8, -0.3, 'TEMP'],
]

onMounted(() => {
  if (!containerRef.value) return
  initScene()
  createPoolModel()
  createSensorMarkers()
  createSensorConnectingLines()
  createLighting()
  createGrid()
  createAerator()
  createFeederParticles()
  createCloudParticles()
  createHeatMap()
  animate()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  renderer?.dispose()
  scene?.clear()
})

function initScene() {
  const w = containerRef.value!.clientWidth
  const h = containerRef.value!.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0e1622)
  scene.fog = new THREE.Fog(0x0e1622, 15, 50)

  camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 100)
  camera.position.set(8, 6, 10)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  containerRef.value!.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 4
  controls.maxDistance = 20
  controls.maxPolarAngle = Math.PI / 2 + 0.3
  controls.target.set(0, 0, 0)
  controls.update()
}

// ---- 视角切换 ----
function setView(view: string) {
  currentView.value = view
  const target = new THREE.Vector3(0, 0, 0)
  let pos: THREE.Vector3

  switch (view) {
    case 'top':
      pos = new THREE.Vector3(0, 12, 0.5)
      break
    case 'side':
      pos = new THREE.Vector3(0, 2, 8)
      break
    case 'section':
      pos = new THREE.Vector3(5, 3, 5)
      break
    default:
      pos = new THREE.Vector3(8, 6, 10)
      break
  }

  // 手动平滑过渡
  const startPos = camera.position.clone()
  const startTarget = controls.target.clone()
  const startTime = performance.now()
  const duration = 1200

  function animateView(now: number) {
    const elapsed = now - startTime
    const t = Math.min(1, elapsed / duration)
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // easeInOutQuad
    camera.position.lerpVectors(startPos, pos, ease)
    controls.target.lerpVectors(startTarget, target, ease)
    if (t < 1) {
      requestAnimationFrame(animateView)
    }
  }
  requestAnimationFrame(animateView)

  if (view === 'top') {
    controls.maxPolarAngle = 0.1
  } else {
    controls.maxPolarAngle = Math.PI / 2 + 0.3
  }
}

// ---- 光照 ----
function createLighting() {
  const ambient = new THREE.AmbientLight(0x3a4a5a, 2.5)
  scene.add(ambient)

  const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x334455, 1.5)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xccddff, 1.5)
  dirLight.position.set(5, 12, 5)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(2048, 2048)
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 50
  dirLight.shadow.camera.left = -10
  dirLight.shadow.camera.right = 10
  dirLight.shadow.camera.top = 10
  dirLight.shadow.camera.bottom = -10
  scene.add(dirLight)

  const blueLight = new THREE.PointLight(0x00d4ff, 8, 6)
  blueLight.position.set(0, 1.5, 0)
  scene.add(blueLight)

  const orangeLight = new THREE.PointLight(0xff6b35, 0, 8)
  orangeLight.name = 'alertLight'
  scene.add(orangeLight)
}

// ---- 池模型 ----
function createPoolModel() {
  poolMesh = new THREE.Group()

  const floorGeo = new THREE.BoxGeometry(5, 0.2, 3)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a4a5c, roughness: 0.35, metalness: 0.4 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.y = -1.1
  floor.receiveShadow = true
  floor.castShadow = true
  poolMesh.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x305870, roughness: 0.3, metalness: 0.35 })
  const walls: [number, number, number, number, number, number][] = [
    [-2.5, 0.4, 0, 0.15, 3, 3],
    [2.5, 0.4, 0, 0.15, 3, 3],
    [0, 0.4, -1.5, 5, 3, 0.15],
    [0, 0.4, 1.5, 5, 3, 0.15],
  ]
  for (const [x, y, z, w, h, d] of walls) {
    const geo = new THREE.BoxGeometry(w, h, d)
    const wall = new THREE.Mesh(geo, wallMaterial)
    wall.position.set(x, y, z)
    wall.receiveShadow = true
    poolMesh.add(wall)
  }

  heatMapCanvas = document.createElement('canvas')
  heatMapCanvas.width = 512
  heatMapCanvas.height = 256
  heatMapCtx = heatMapCanvas.getContext('2d')!
  heatMapTexture = new THREE.CanvasTexture(heatMapCanvas)
  heatMapTexture.wrapS = THREE.ClampToEdgeWrapping
  heatMapTexture.wrapT = THREE.ClampToEdgeWrapping

  const waterGeo = new THREE.PlaneGeometry(4.8, 2.8)
  const waterMat = new THREE.MeshPhysicalMaterial({
    map: heatMapTexture,
    color: 0xffffff,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.7,
    envMapIntensity: 0.5,
    clearcoat: 0.3,
  })
  waterSurface = new THREE.Mesh(waterGeo, waterMat)
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.y = 1.38
  waterSurface.name = 'waterSurface'
  poolMesh.add(waterSurface)

  const gridHelper = new THREE.PolarGridHelper(2.5, 32, 20, 64, 0x2a5068, 0x2a5068)
  gridHelper.position.y = -0.98
  poolMesh.add(gridHelper)

  scene.add(poolMesh)

  // 告警环
  const ringGeo = new THREE.TorusGeometry(3.2, 0.03, 16, 100)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0 })
  alertRing = new THREE.Mesh(ringGeo, ringMat)
  alertRing.rotation.x = -Math.PI / 2
  alertRing.position.y = 1.42
  alertRing.name = 'alertRing'
  scene.add(alertRing)
}

// ---- 传感器标记 + 连接线 ----
function createSensorMarkers() {
  const positions: [number, number, number][] = [
    [-1.5, 1.5, -0.8], [1.5, 1.5, -0.8],
    [-1.5, 1.5, 0.8], [1.5, 1.5, 0.8],
    [0, 1.5, 0], [-0.8, 1.5, -0.3],
  ]

  for (const [x, y, z] of positions) {
    // 传感器光球
    const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16)
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    sphere.position.set(x, y, z)
    sphere.castShadow = true
    sensorMarkers.push(sphere)
    poolMesh.add(sphere)

    // 光柱连接线
    const lineGeo = new THREE.CylinderGeometry(0.02, 0.02, y - 1.4, 4)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 })
    const line = new THREE.Mesh(lineGeo, lineMat)
    line.position.set(x, (y + 1.4) / 2, z)
    poolMesh.add(line)
  }
}

// ---- 传感器间连接线 ----
function createSensorConnectingLines() {
  const sensorPositions = [
    new THREE.Vector3(-1.5, 1.55, -0.8),
    new THREE.Vector3(1.5, 1.55, -0.8),
    new THREE.Vector3(-1.5, 1.55, 0.8),
    new THREE.Vector3(1.5, 1.55, 0.8),
    new THREE.Vector3(0, 1.55, 0),
    new THREE.Vector3(-0.8, 1.55, -0.3),
  ]

  // 环形连接
  const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 4]]

  for (const [a, b] of edges) {
    const points = [sensorPositions[a], sensorPositions[b]]
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.18,
      linewidth: 0.5,
    })
    const line = new THREE.Line(geo, mat)
    line.name = 'sensorLink'
    sensorLines.push(line)
    poolMesh.add(line)
  }
}

// ---- 增氧机(含转速联动) ----
function createAerator() {
  aeratorBlades = new THREE.Group()

  const bodyGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 16)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.25, metalness: 0.8 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.4
  body.castShadow = true
  aeratorBlades.add(body)

  // 旋转叶片 (4片，用Group包裹方便旋转)
  const bladeGroup = new THREE.Group()
  bladeGroup.name = 'bladeGroup'
  const bladeGeo = new THREE.BoxGeometry(0.6, 0.04, 0.12)
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.2, metalness: 0.9 })
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.rotation.y = (Math.PI / 4) * i
    blade.position.y = 0.85
    blade.castShadow = true
    bladeGroup.add(blade)
  }
  aeratorBlades.add(bladeGroup)

  const motorGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.3, 16)
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.2, metalness: 0.9 })
  const motor = new THREE.Mesh(motorGeo, motorMat)
  motor.position.y = 1.05
  motor.castShadow = true
  aeratorBlades.add(motor)

  aeratorBlades.position.set(2.8, 0, 0.5)
  aeratorBlades.name = 'aerator'
  scene.add(aeratorBlades)
}

// ---- 投喂粒子 ----
function createFeederParticles() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const colors = new Float32Array(PARTICLE_COUNT * 3)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 0.4
    positions[i * 3 + 1] = Math.random() * 2
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4
    colors[i * 3] = 0.8 + Math.random() * 0.2
    colors[i * 3 + 1] = 0.6 + Math.random() * 0.3
    colors[i * 3 + 2] = 0.3 + Math.random() * 0.2

    feederParticleData.push({
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.01, -0.02 - Math.random() * 0.04, (Math.random() - 0.5) * 0.01),
      life: Math.random() * 2,
    })
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.04,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  feederParticles = new THREE.Points(geometry, material)
  feederParticles.position.set(-2.2, 1.2, -0.5)
  feederParticles.name = 'feederParticles'
  scene.add(feederParticles)
}

// ---- 体积云粒子 ----
function createCloudParticles() {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(CLOUD_COUNT * 3)
  const colorsArr = new Float32Array(CLOUD_COUNT * 3)

  cloudParticleData = []

  for (let i = 0; i < CLOUD_COUNT; i++) {
    // 分布在池面上方 2-5 单位
    const baseX = (Math.random() - 0.5) * 6
    const baseZ = (Math.random() - 0.5) * 4
    const y = 2.5 + Math.random() * 3

    positions[i * 3] = baseX
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = baseZ

    colorsArr[i * 3] = 0.7 + Math.random() * 0.3
    colorsArr[i * 3 + 1] = 0.8 + Math.random() * 0.2
    colorsArr[i * 3 + 2] = 0.9 + Math.random() * 0.1

    cloudParticleData.push({
      baseX, baseZ, y,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
    })
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3))

  // 使用Sprite纹理做云雾
  const spriteCanvas = document.createElement('canvas')
  spriteCanvas.width = 32
  spriteCanvas.height = 32
  const sctx = spriteCanvas.getContext('2d')!
  const gradient = sctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)')
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)')
  gradient.addColorStop(0.6, 'rgba(200, 220, 255, 0.08)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  sctx.fillStyle = gradient
  sctx.fillRect(0, 0, 32, 32)

  const spriteTexture = new THREE.CanvasTexture(spriteCanvas)
  spriteTexture.needsUpdate = true

  const material = new THREE.PointsMaterial({
    size: 0.6,
    map: spriteTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  cloudParticles = new THREE.Points(geometry, material)
  cloudParticles.name = 'cloudParticles'
  scene.add(cloudParticles)
}

// ---- 热力图 ----
function createHeatMap() {
  drawHeatMap()
}

function drawHeatMap() {
  const ctx = heatMapCtx
  const w = heatMapCanvas.width
  const h = heatMapCanvas.height

  // 底色 - 根据浑浊度调整水体颜色
  const turbidity = getTurbidity()
  const r = Math.floor(0 + turbidity * 20)
  const g = Math.floor(51 + turbidity * 15)
  const b = Math.floor(85 - turbidity * 10)
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(0, 0, w, h)

  const readings = store.latestReadings
  if (readings.size === 0) {
    drawHeatSpot(ctx, w, h, -1.5, -0.8, 5.8, 'DO')
    drawHeatSpot(ctx, w, h, 1.5, -0.8, 7.6, 'pH')
    drawHeatSpot(ctx, w, h, -1.5, 0.8, 27.2, 'TEMP')
    drawHeatSpot(ctx, w, h, 1.5, 0.8, 5.2, 'DO')
    drawHeatSpot(ctx, w, h, 0, 0, 5.5, 'DO')
    drawHeatSpot(ctx, w, h, -0.8, -0.3, 26.8, 'TEMP')
  } else {
    for (const [_, reading] of readings) {
      const uv = sensorUV.find(([_, __, t]) => reading.type.startsWith(t)) || [0, 0, 'DO']
      drawHeatSpot(ctx, w, h, uv[0], uv[1], reading.value, reading.type)
    }
  }

  if (heatMapTexture) heatMapTexture.needsUpdate = true
}

function getTurbidity(): number {
  const nhReading = store.latestReadings.get('P01-NH3N') || store.latestReadings.get('P02-NH3N')
  if (!nhReading) return 0.3
  return Math.min(1, nhReading.value / 0.5)
}

function drawHeatSpot(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  poolX: number, poolZ: number,
  value: number, type: string,
) {
  const u = (poolX + 2.4) / 4.8
  const v = (poolZ + 1.4) / 2.8
  const cx = u * canvasW
  const cy = v * canvasH

  let color: string
  if (type === 'DO' || type === 'do') {
    if (value < 4.5) color = '255, 23, 68'
    else if (value < 5.5) color = '255, 180, 60'
    else color = '0, 220, 130'
  } else if (type === 'TEMP' || type === 'temp') {
    if (value > 28.5) color = '255, 23, 68'
    else if (value > 26) color = '0, 220, 130'
    else color = '60, 140, 255'
  } else {
    color = '0, 200, 200'
  }

  const radius = 80
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  gradient.addColorStop(0, `rgba(${color}, 0.9)`)
  gradient.addColorStop(0.4, `rgba(${color}, 0.5)`)
  gradient.addColorStop(0.7, `rgba(${color}, 0.15)`)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
}

// ---- 网格 ----
function createGrid() {
  const gridHelper = new THREE.GridHelper(20, 30, 0x2a4058, 0x12202a)
  gridHelper.position.y = -1.3
  scene.add(gridHelper)
}

// ---- 动画循环 ----
let time = 0
let heatMapTimer = 0
function animate() {
  animationId = requestAnimationFrame(animate)
  time += 0.005
  heatMapTimer += 1

  controls.update()

  // 水面微动
  if (waterSurface) {
    waterSurface.position.y = 1.38 + Math.sin(time * 3) * 0.015
  }

  // 传感器标记呼吸
  for (let i = 0; i < sensorMarkers.length; i++) {
    const scale = 1 + Math.sin(time * 4 + i) * 0.15
    sensorMarkers[i].scale.setScalar(scale)

    const mat = sensorMarkers[i].material as THREE.MeshStandardMaterial
    if (store.alertLevel === 'red') {
      mat.color.setHex(0xff1744)
      mat.emissive.setHex(0xff1744)
    } else if (store.alertLevel === 'yellow') {
      mat.color.setHex(0xff6b35)
      mat.emissive.setHex(0xff6b35)
    } else {
      mat.color.setHex(0x00d4ff)
      mat.emissive.setHex(0x00d4ff)
    }
  }

  // 传感器连接线随告警变色
  for (const line of sensorLines) {
    const mat = line.material as THREE.LineBasicMaterial
    if (store.alertLevel === 'red') {
      mat.color.setHex(0xff1744)
      mat.opacity = 0.35
    } else if (store.alertLevel === 'yellow') {
      mat.color.setHex(0xff6b35)
      mat.opacity = 0.25
    } else {
      mat.color.setHex(0x00d4ff)
      mat.opacity = 0.18
    }
  }

  // 告警环脉冲
  if (alertRing) {
    const mat = alertRing.material as THREE.MeshBasicMaterial
    const target = store.alertLevel === 'red' ? 0.9 : store.alertLevel === 'yellow' ? 0.5 : 0
    mat.opacity += (target - mat.opacity) * 0.08
    if (target > 0) {
      mat.color.setHex(store.alertLevel === 'red' ? 0xff1744 : 0xff6b35)
    }
  }

  // 增氧机旋转 — 转速联动 DO 值
  if (aeratorBlades) {
    const bladeGroup = aeratorBlades.getObjectByName('bladeGroup')
    if (bladeGroup) {
      let rpmFactor = 1.0
      const doReading = store.latestReadings.get('P01-DO')
      if (doReading) {
        rpmFactor = doReading.value < 4.5 ? 1.8 : doReading.value < 5.5 ? 1.3 : 1.0
      }
      bladeGroup.rotation.y += 0.06 * rpmFactor
    }
  }

  // 投喂粒子
  if (feederParticles && feederParticles.visible) {
    const mat = feederParticles.material as THREE.PointsMaterial
    const positions = (feederParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3
      positions[idx] += feederParticleData[i].velocity.x
      positions[idx + 1] += feederParticleData[i].velocity.y
      positions[idx + 2] += feederParticleData[i].velocity.z

      feederParticleData[i].life -= 0.005

      if (positions[idx + 1] < -0.5 || feederParticleData[i].life <= 0) {
        positions[idx] = (Math.random() - 0.5) * 0.4
        positions[idx + 1] = 1.8
        positions[idx + 2] = (Math.random() - 0.5) * 0.4
        feederParticleData[i].life = 1.5 + Math.random()
      }
    }
    (feederParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true
    mat.opacity += ((0.6 - mat.opacity) * 0.05)
  }

  // 体积云粒子漂移
  if (cloudParticles) {
    const positions = (cloudParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const idx = i * 3
      const cd = cloudParticleData[i]
      positions[idx] = cd.baseX + Math.sin(time * cd.speed + cd.phase) * 0.8
      positions[idx + 1] = cd.y + Math.cos(time * cd.speed * 0.7 + cd.phase) * 0.3
      positions[idx + 2] = cd.baseZ + Math.cos(time * cd.speed * 0.5 + cd.phase) * 0.6
    }
    (cloudParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true
  }

  // 热力图刷新
  if (heatMapTimer % 60 === 0) {
    drawHeatMap()
  }

  // 告警灯光
  const alertLight = scene.getObjectByName('alertLight') as THREE.PointLight
  if (alertLight) {
    const targetIntensity = store.alertLevel === 'red' ? 12 : store.alertLevel === 'yellow' ? 5 : 0
    alertLight.intensity += (targetIntensity - alertLight.intensity) * 0.1
    if (store.alertLevel === 'red') alertLight.color.setHex(0xff1744)
    else alertLight.color.setHex(0xff6b35)
  }

  renderer.render(scene, camera)
}

function onResize() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 100%;
  position: relative;
}
.three-container :deep(canvas) {
  display: block;
}
.three-overlay-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border-color);
  padding: 4px 14px;
  border-radius: 8px;
  pointer-events: none;
}

/* 视角控制 */
.view-controls {
  position: absolute;
  bottom: 40px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.vc-btn {
  width: 36px; height: 36px; border-radius: 8px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-secondary);
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
  font-family: inherit;
}
.vc-btn:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
.vc-btn.active {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  background: var(--accent-blue-dim);
}
.vc-icon { line-height: 1; }
</style>

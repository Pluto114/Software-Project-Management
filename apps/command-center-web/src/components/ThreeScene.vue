<template>
  <div ref="containerRef" class="three-container">
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

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number
let poolMesh: THREE.Group
let waterSurface: THREE.Mesh
let sensorMarkers: THREE.Mesh[] = []
let alertRing: THREE.Mesh | null = null
let heatMapTexture: THREE.CanvasTexture | null = null
let heatMapCanvas: HTMLCanvasElement
let heatMapCtx: CanvasRenderingContext2D
let aeratorBlades: THREE.Group | null = null
let feederParticles: THREE.Points | null = null
let feederParticleData: { velocity: THREE.Vector3; life: number }[] = []
const PARTICLE_COUNT = 80

// 传感器在池面 UV 坐标 (x: -2.4..2.4 → u: 0..1, z: -1.4..1.4 → v: 0..1)
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
  createLighting()
  createGrid()
  createAerator()
  createFeederParticles()
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
  scene.background = new THREE.Color(0x0A0A0B)
  scene.fog = new THREE.Fog(0x0A0A0B, 15, 50)

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

function createLighting() {
  const ambient = new THREE.AmbientLight(0x1a2a3a, 1.5)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xccddff, 2)
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

  const blueLight = new THREE.PointLight(0x00F2FF, 8, 6)
  blueLight.position.set(0, 1.5, 0)
  scene.add(blueLight)

  const orangeLight = new THREE.PointLight(0xFF8C00, 0, 8)
  orangeLight.name = 'alertLight'
  scene.add(orangeLight)
}

function createPoolModel() {
  poolMesh = new THREE.Group()

  const floorGeo = new THREE.BoxGeometry(5, 0.2, 3)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.3, metalness: 0.7 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.y = -1.1
  floor.receiveShadow = true
  floor.castShadow = true
  poolMesh.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.25, metalness: 0.6 })
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

  // 水面 — 使用 CanvasTexture 支持热力云图
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
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.65,
    envMapIntensity: 0.5,
    clearcoat: 0.3,
  })
  waterSurface = new THREE.Mesh(waterGeo, waterMat)
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.y = 1.38
  waterSurface.name = 'waterSurface'
  poolMesh.add(waterSurface)

  // 池底网格
  const gridHelper = new THREE.PolarGridHelper(2.5, 32, 20, 64, 0x1a3a5a, 0x1a3a5a)
  gridHelper.position.y = -0.98
  poolMesh.add(gridHelper)

  scene.add(poolMesh)

  // 告警环
  const ringGeo = new THREE.TorusGeometry(3.2, 0.03, 16, 100)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xFF8C00, transparent: true, opacity: 0 })
  alertRing = new THREE.Mesh(ringGeo, ringMat)
  alertRing.rotation.x = -Math.PI / 2
  alertRing.position.y = 1.42
  alertRing.name = 'alertRing'
  scene.add(alertRing)
}

function createSensorMarkers() {
  const positions: [number, number, number][] = [
    [-1.5, 1.5, -0.8], [1.5, 1.5, -0.8],
    [-1.5, 1.5, 0.8], [1.5, 1.5, 0.8],
    [0, 1.5, 0], [-0.8, 1.5, -0.3],
  ]

  for (const [x, y, z] of positions) {
    const sphereGeo = new THREE.SphereGeometry(0.12, 16, 16)
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x00F2FF,
      emissive: 0x00F2FF,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    sphere.position.set(x, y, z)
    sphere.castShadow = true
    sensorMarkers.push(sphere)
    poolMesh.add(sphere)

    const lineGeo = new THREE.CylinderGeometry(0.02, 0.02, y - 1.4, 4)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00F2FF, transparent: true, opacity: 0.4 })
    const line = new THREE.Mesh(lineGeo, lineMat)
    line.position.set(x, (y + 1.4) / 2, z)
    poolMesh.add(line)
  }
}

function createAerator() {
  // 增氧机放在池右侧
  aeratorBlades = new THREE.Group()

  // 主体立柱
  const bodyGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 16)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.25, metalness: 0.8 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.position.y = 0.4
  body.castShadow = true
  aeratorBlades.add(body)

  // 旋转叶片 (4 片)
  const bladeGeo = new THREE.BoxGeometry(0.6, 0.04, 0.12)
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.2, metalness: 0.9 })
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.rotation.y = (Math.PI / 4) * i
    blade.position.y = 0.85
    blade.castShadow = true
    aeratorBlades.add(blade)
  }

  // 顶部电机
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

function createHeatMap() {
  drawHeatMap()
}

function drawHeatMap() {
  const ctx = heatMapCtx
  const w = heatMapCanvas.width
  const h = heatMapCanvas.height

  // 底色 — 深蓝水体
  ctx.fillStyle = '#003355'
  ctx.fillRect(0, 0, w, h)

  // 用 store 中的传感器读数绘制热力点
  const readings = store.latestReadings
  if (readings.size === 0) {
    // 默认演示点
    drawHeatSpot(ctx, w, h, -1.5, -0.8, 5.8, 'DO')
    drawHeatSpot(ctx, w, h, 1.5, -0.8, 7.6, 'pH')
    drawHeatSpot(ctx, w, h, -1.5, 0.8, 27.2, 'TEMP')
    drawHeatSpot(ctx, w, h, 1.5, 0.8, 5.2, 'DO')
    drawHeatSpot(ctx, w, h, 0, 0, 5.5, 'DO')
    drawHeatSpot(ctx, w, h, -0.8, -0.3, 26.8, 'TEMP')
  } else {
    for (const [_, reading] of readings) {
      const sx = reading.sensorId
      // 根据 sensorId 估算池中位置 (简化映射)
      const uv = sensorUV.find(([_, __, t]) => reading.type.startsWith(t)) || [0, 0, 'DO']
      drawHeatSpot(ctx, w, h, uv[0], uv[1], reading.value, reading.type)
    }
  }

  if (heatMapTexture) heatMapTexture.needsUpdate = true
}

function drawHeatSpot(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  poolX: number, poolZ: number,
  value: number, type: string,
) {
  // 池坐标 → 画布坐标
  const u = (poolX + 2.4) / 4.8
  const v = (poolZ + 1.4) / 2.8
  const cx = u * canvasW
  const cy = v * canvasH

  let color: string
  if (type === 'DO' || type === 'do') {
    // DO: <4.5 red, 4.5-5.5 yellow, >5.5 green
    if (value < 4.5) color = '255, 68, 68'
    else if (value < 5.5) color = '255, 180, 60'
    else color = '0, 220, 130'
  } else if (type === 'TEMP' || type === 'temp') {
    // Temp: >28.5 red, 26-28.5 green, <24 blue
    if (value > 28.5) color = '255, 68, 68'
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

function createGrid() {
  const gridHelper = new THREE.GridHelper(20, 30, 0x1a2a30, 0x0d1518)
  gridHelper.position.y = -1.3
  scene.add(gridHelper)
}

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

    // 根据告警等级变色
    const mat = sensorMarkers[i].material as THREE.MeshStandardMaterial
    if (store.alertLevel === 'red') {
      mat.color.setHex(0xFF4444)
      mat.emissive.setHex(0xFF4444)
    } else if (store.alertLevel === 'yellow') {
      mat.color.setHex(0xFF8C00)
      mat.emissive.setHex(0xFF8C00)
    } else {
      mat.color.setHex(0x00F2FF)
      mat.emissive.setHex(0x00F2FF)
    }
  }

  // 告警环脉冲
  if (alertRing) {
    const mat = alertRing.material as THREE.MeshBasicMaterial
    const target = store.alertLevel === 'red' ? 0.9 : store.alertLevel === 'yellow' ? 0.5 : 0
    mat.opacity += (target - mat.opacity) * 0.08
    if (target > 0) {
      mat.color.setHex(store.alertLevel === 'red' ? 0xFF4444 : 0xFF8C00)
    }
  }

  // 增氧机旋转
  if (aeratorBlades) {
    // 叶片旋转 (模拟运转)
    const children = aeratorBlades.children
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.type === 'Mesh' && child.position.y > 0.8) {
        child.rotation.y += 0.06
      }
    }
  }

  // 投喂粒子动画 (仅在模拟投喂时可见)
  if (feederParticles && feederParticles.visible) {
    const mat = feederParticles.material as THREE.PointsMaterial
    const positions = (feederParticles.geometry as THREE.BufferGeometry).attributes.position.array as Float32Array

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3
      positions[idx] += feederParticleData[i].velocity.x
      positions[idx + 1] += feederParticleData[i].velocity.y
      positions[idx + 2] += feederParticleData[i].velocity.z

      feederParticleData[i].life -= 0.005

      // 重置死亡粒子
      if (positions[idx + 1] < -0.5 || feederParticleData[i].life <= 0) {
        positions[idx] = (Math.random() - 0.5) * 0.4
        positions[idx + 1] = 1.8
        positions[idx + 2] = (Math.random() - 0.5) * 0.4
        feederParticleData[i].life = 1.5 + Math.random()
      }
    }
    (feederParticles.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true

    // 粒子淡入淡出
    mat.opacity += ((0.6 - mat.opacity) * 0.05)
  }

  // 热力云图定期刷新 (每 60 帧 ≈ 1s)
  if (heatMapTimer % 60 === 0) {
    drawHeatMap()
  }

  // 告警灯光
  const alertLight = scene.getObjectByName('alertLight') as THREE.PointLight
  if (alertLight) {
    const targetIntensity = store.alertLevel === 'red' ? 12 : store.alertLevel === 'yellow' ? 5 : 0
    alertLight.intensity += (targetIntensity - alertLight.intensity) * 0.1
    if (store.alertLevel === 'red') alertLight.color.setHex(0xFF4444)
    else alertLight.color.setHex(0xFF8C00)
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
  color: var(--text-dim);
  background: rgba(10, 10, 11, 0.7);
  padding: 4px 14px;
  border-radius: 12px;
  pointer-events: none;
}
</style>

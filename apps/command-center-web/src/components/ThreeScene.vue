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

const containerRef = ref<HTMLDivElement>()

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId: number
let poolMesh: THREE.Group
let waterSurface: THREE.Mesh
let sensorMarkers: THREE.Mesh[] = []
let alertRing: THREE.Mesh | null = null

onMounted(() => {
  if (!containerRef.value) return
  initScene()
  createPoolModel()
  createSensorMarkers()
  createLighting()
  createGrid()
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

  // 场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0A0A0B)
  scene.fog = new THREE.Fog(0x0A0A0B, 15, 50)

  // 相机
  camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 100)
  camera.position.set(8, 6, 10)
  camera.lookAt(0, 0, 0)

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  containerRef.value!.appendChild(renderer.domElement)

  // 控制器
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
  // 环境光
  const ambient = new THREE.AmbientLight(0x1a2a3a, 1.5)
  scene.add(ambient)

  // 主方向光（模拟顶灯）
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

  // 蓝色补光（水下氛围）
  const blueLight = new THREE.PointLight(0x00F2FF, 8, 6)
  blueLight.position.set(0, 1.5, 0)
  scene.add(blueLight)

  // 橙色预警光（初始隐藏）
  const orangeLight = new THREE.PointLight(0xFF8C00, 0, 8)
  orangeLight.name = 'alertLight'
  scene.add(orangeLight)
}

function createPoolModel() {
  poolMesh = new THREE.Group()

  // 池体底面
  const floorGeo = new THREE.BoxGeometry(5, 0.2, 3)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a4a,
    roughness: 0.3,
    metalness: 0.7,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.y = -1.1
  floor.receiveShadow = true
  floor.castShadow = true
  poolMesh.add(floor)

  // 池壁
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2a3a,
    roughness: 0.25,
    metalness: 0.6,
  })
  const walls: [number, number, number, number, number, number][] = [
    [-2.5, 0.4, 0, 0.15, 3, 3],     // 左壁
    [2.5, 0.4, 0, 0.15, 3, 3],       // 右壁
    [0, 0.4, -1.5, 5, 3, 0.15],      // 前壁
    [0, 0.4, 1.5, 5, 3, 0.15],       // 后壁
  ]
  for (const [x, y, z, w, h, d] of walls) {
    const geo = new THREE.BoxGeometry(w, h, d)
    const wall = new THREE.Mesh(geo, wallMaterial)
    wall.position.set(x, y, z)
    wall.receiveShadow = true
    poolMesh.add(wall)
  }

  // 水面
  const waterGeo = new THREE.PlaneGeometry(4.8, 2.8)
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x006994,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    envMapIntensity: 0.5,
    clearcoat: 0.3,
  })
  waterSurface = new THREE.Mesh(waterGeo, waterMat)
  waterSurface.rotation.x = -Math.PI / 2
  waterSurface.position.y = 1.38
  waterSurface.name = 'waterSurface'
  poolMesh.add(waterSurface)

  // 网格线（模拟池底网格）
  const gridHelper = new THREE.PolarGridHelper(2.5, 32, 20, 64, 0x1a3a5a, 0x1a3a5a)
  gridHelper.position.y = -0.98
  poolMesh.add(gridHelper)

  scene.add(poolMesh)

  // 边界脉冲环（预警用）
  const ringGeo = new THREE.TorusGeometry(3.2, 0.03, 16, 100)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xFF8C00, transparent: true, opacity: 0 })
  alertRing = new THREE.Mesh(ringGeo, ringMat)
  alertRing.rotation.x = -Math.PI / 2
  alertRing.position.y = 1.42
  alertRing.name = 'alertRing'
  scene.add(alertRing)
}

function createSensorMarkers() {
  // 模拟 6 个传感器在池中的 3D 位置
  const positions: [number, number, number][] = [
    [-1.5, 1.5, -0.8], [1.5, 1.5, -0.8],
    [-1.5, 1.5, 0.8], [1.5, 1.5, 0.8],
    [0, 1.5, 0], [-0.8, 1.5, -0.3],
  ]

  for (const [x, y, z] of positions) {
    // 标记球
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

    // 连线（垂直连接到水面）
    const lineGeo = new THREE.CylinderGeometry(0.02, 0.02, y - 1.4, 4)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00F2FF, transparent: true, opacity: 0.4 })
    const line = new THREE.Mesh(lineGeo, lineMat)
    line.position.set(x, (y + 1.4) / 2, z)
    poolMesh.add(line)
  }
}

function createGrid() {
  const gridHelper = new THREE.GridHelper(20, 30, 0x1a2a30, 0x0d1518)
  gridHelper.position.y = -1.3
  scene.add(gridHelper)
}

// 水面波动动画
let time = 0
function animate() {
  animationId = requestAnimationFrame(animate)
  time += 0.005

  controls.update()

  // 水面微动
  if (waterSurface) {
    waterSurface.position.y = 1.38 + Math.sin(time * 3) * 0.015
  }

  // 传感器标记呼吸效果
  for (let i = 0; i < sensorMarkers.length; i++) {
    const scale = 1 + Math.sin(time * 4 + i) * 0.15
    sensorMarkers[i].scale.setScalar(scale)
  }

  // 告警环脉冲
  if (alertRing) {
    const targetOpacity = 0 // 后期通过 store 控制
    const mat = alertRing.material as THREE.MeshBasicMaterial
    mat.opacity += (targetOpacity - mat.opacity) * 0.05
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

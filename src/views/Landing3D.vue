<template>
  <div class="landing-wrapper" ref="wrapper">
    <!-- 语言切换按钮 - 固定在右上角 -->
    <div class="language-switcher-container">
      <LanguageSwitcher :isDark="true" direction="down" />
    </div>
    
    <div class="landing-container" ref="container">
      <canvas ref="canvas" class="webgl-canvas"></canvas>
      
      <!-- UI Overlay -->
      <div class="ui-overlay">
        <div class="side-text left">
          <span class="text-glow">{{ t('landing.slogan') }}</span>
          <span class="text-sub">{{ t('landing.sloganSub') }}</span>
        </div>
        
        <div class="center-content">
          <!-- Glowing Platform -->
          <div class="platform-container">
            <div class="platform-glow"></div>
            <div class="platform-ring ring-1"></div>
            <div class="platform-ring ring-2"></div>
            <div class="platform-ring ring-3"></div>
            <div class="platform-particles">
              <span v-for="i in 20" :key="i" class="particle" :style="getParticleStyle(i)"></span>
            </div>
          </div>
          
          <!-- CTA Button -->
          <button class="cta-button" @click="handleCTAClick">
            <div class="btn-glow-outer"></div>
            <div class="btn-glow-inner"></div>
            <div class="btn-glass">
              <span class="btn-text">{{ t('landing.tryItNow') }}</span>
            </div>
            <div class="btn-shine"></div>
          </button>
        </div>
        
        <div class="side-text right">
          <span class="text-glow">{{ t('landing.futureIsNow') }}</span>
          <span class="text-sub">{{ t('landing.futureIsNowSub') }}</span>
        </div>
      </div>

    </div>
    
    <!-- Section 2: Technology -->
    <div class="landing-section section-tech" ref="sectionTech">
      <canvas ref="canvasTech" class="webgl-canvas-section"></canvas>
      <div class="section-content">
        <h2 class="section-title">
          <span class="title-glow">{{ t('landing.poweredBy') }}</span>
          <span class="title-main">{{ t('landing.cuttingEdgeAI') }}</span>
        </h2>
        <p class="section-desc">{{ t('landing.techDesc') }}</p>
        <div class="tech-grid">
          <div class="tech-item">
            <div class="tech-ring"></div>
            <span>Nano BananaPro</span>
          </div>
          <div class="tech-item">
            <div class="tech-ring"></div>
            <span>Sora 2</span>
          </div>
          <div class="tech-item">
            <div class="tech-ring"></div>
            <span>Veo 3.1</span>
          </div>
          <div class="tech-item">
            <div class="tech-ring"></div>
            <span>GPT 5.2</span>
          </div>
          <div class="tech-item">
            <div class="tech-ring"></div>
            <span>Gemini 3 Pro</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Section 4: CTA -->
    <div class="landing-section section-cta" ref="sectionCta">
      <canvas ref="canvasCta" class="webgl-canvas-section"></canvas>
      <div class="section-content cta-content">
        <h2 class="section-title large">
          <span class="title-main">{{ t('landing.startYourJourney') }}</span>
        </h2>
        <p class="section-desc">{{ t('landing.joinNow') }}</p>
        <button class="cta-button-final" @click="handleCTAClick">
          <span class="btn-text-final">{{ t('landing.tryNow') }}</span>
          <span class="btn-arrow">→</span>
        </button>
      </div>
    </div>

    <!-- Login Modal -->
    <Transition name="modal-fade">
      <div v-if="showLoginModal" class="modal-overlay glass-dark" @click.self="closeModal">
        <div class="modal-container glass-modal">
          <button class="modal-close" @click="closeModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          
          <div class="modal-header">
            <div class="modal-logo-ring">
              <span class="logo-text">AI</span>
            </div>
            <h2 class="modal-title">{{ authMode === 'login' ? t('auth.welcomeBack') : t('auth.startJourney') }}</h2>
            <p class="modal-subtitle">{{ authMode === 'login' ? t('auth.loginAccount') : t('auth.registerFreePoints') }}</p>
          </div>

          <div class="auth-toggle">
            <button :class="['toggle-btn', { active: authMode === 'login' }]" @click="authMode = 'login'">{{ t('auth.login') }}</button>
            <button :class="['toggle-btn', { active: authMode === 'register' }]" @click="authMode = 'register'">{{ t('auth.register') }}</button>
            <div class="toggle-indicator" :style="{ transform: authMode === 'register' ? 'translateX(100%)' : 'translateX(0)' }"></div>
          </div>

          <form @submit.prevent="submitAuth" class="auth-form">
            <!-- 注册模式且有白名单：显示用户名和邮箱分开的输入 -->
            <div v-if="authMode === 'register' && emailConfig.has_whitelist && emailConfig.email_whitelist.length > 0" class="form-group">
              <input v-model="account" type="text" class="form-input" :placeholder="t('auth.username')" required />
            </div>

            <div v-if="authMode === 'register' && emailConfig.has_whitelist && emailConfig.email_whitelist.length > 0" class="form-group">
              <div class="email-input-group">
                <input v-model="emailPrefix" type="text" class="form-input email-prefix" :placeholder="t('auth.emailPrefix')" required />
                <span class="email-at">@</span>
                <select v-model="emailSuffix" class="form-input email-suffix" required>
                  <option value="" disabled>{{ t('auth.selectSuffix') }}</option>
                  <option v-for="domain in emailConfig.email_whitelist" :key="domain" :value="domain">
                    {{ domain }}
                  </option>
                </select>
              </div>
            </div>

            <!-- 其他模式：显示原来的邮箱/登录名输入框 -->
            <div v-if="!(authMode === 'register' && emailConfig.has_whitelist && emailConfig.email_whitelist.length > 0)" class="form-group">
              <input v-model="account" type="text" class="form-input" :placeholder="t('auth.emailOrUsername')" required />
            </div>

            <div class="form-group">
              <input v-model="password" type="password" class="form-input" :placeholder="t('auth.password')" required />
            </div>

            <!-- 邮箱验证码（注册时且需要验证时显示） -->
            <div v-if="authMode === 'register' && emailConfig.require_email_verification" class="form-group">
              <div class="code-input-group">
                <input 
                  v-model="emailCode" 
                  type="text" 
                  class="form-input code-input" 
                  :placeholder="t('auth.emailCode')"
                  maxlength="6"
                  required 
                />
                <button
                  type="button"
                  @click="sendVerificationCode"
                  :disabled="sendingCode || codeSent || !fullEmail"
                  class="code-btn"
                >
                  {{ sendingCode ? t('auth.sending') : codeSent ? `${countdown}${t('auth.secondsLater')}` : t('auth.sendCode') }}
                </button>
              </div>
              <p v-if="emailConfig.has_whitelist" class="hint-text">
                {{ t('auth.whitelistOnly') }}
              </p>
            </div>

            <div v-if="authMode === 'register'" class="form-group">
              <input v-model="inviteCode" type="text" class="form-input" :placeholder="t('auth.inviteCode')" />
            </div>
            <div v-if="authError" class="error-message">{{ authError }}</div>
            <button type="submit" class="submit-btn" :disabled="authLoading">
              <span v-if="authLoading" class="loading-spinner"></span>
              <span v-else>{{ authMode === 'login' ? t('auth.login') : t('auth.register') }}</span>
            </button>
          </form>

          <div class="modal-footer">
            <span class="footer-text">{{ authMode === 'login' ? t('auth.noAccount') : t('auth.hasAccount') }}</span>
            <button class="link-btn" @click="authMode = authMode === 'login' ? 'register' : 'login'">
              {{ authMode === 'login' ? t('auth.registerNow') : t('auth.loginNow') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Mode Selection Modal -->
    <Transition name="modal-fade">
      <div v-if="showModeModal" class="modal-overlay glass-dark" @click.self="closeModal">
        <div class="modal-container glass-modal mode-modal">
          <button class="modal-close" @click="closeModal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div class="modal-header">
            <h2 class="modal-title">{{ t('landing.selectMode') }}</h2>
            <p class="modal-subtitle">{{ t('landing.selectModeDesc') }}</p>
          </div>

          <div class="mode-options">
            <div :class="['mode-card', { selected: selectedMode === 'canvas' }]" @click="selectedMode = 'canvas'">
              <div class="mode-check" v-if="selectedMode === 'canvas'">✓</div>
              <div class="mode-icon canvas-icon">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="4" y="4" width="40" height="40" rx="4" />
                  <circle cx="14" cy="14" r="3" fill="currentColor" />
                  <circle cx="34" cy="14" r="3" fill="currentColor" />
                  <circle cx="24" cy="34" r="3" fill="currentColor" />
                  <line x1="14" y1="14" x2="34" y2="14" />
                  <line x1="34" y1="14" x2="24" y2="34" />
                  <line x1="24" y1="34" x2="14" y2="14" />
                </svg>
              </div>
              <div class="mode-content">
                <h3 class="mode-title">{{ t('landing.canvasMode') }}</h3>
                <p class="mode-desc">{{ t('landing.canvasModeDesc') }}</p>
              </div>
              <div class="mode-tag">{{ t('landing.recommended') }}</div>
            </div>

            <div :class="['mode-card', { selected: selectedMode === 'simple' }]" @click="selectedMode = 'simple'">
              <div class="mode-check" v-if="selectedMode === 'simple'">✓</div>
              <div class="mode-icon simple-icon">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="4" y="10" width="40" height="28" rx="4" />
                  <line x1="12" y1="20" x2="36" y2="20" />
                  <line x1="12" y1="28" x2="28" y2="28" />
                </svg>
              </div>
              <div class="mode-content">
                <h3 class="mode-title">{{ t('landing.simpleMode') }}</h3>
                <p class="mode-desc">{{ t('landing.simpleModeDesc') }}</p>
              </div>
            </div>
          </div>

          <button class="start-btn" @click="confirmModeSelection">
            <span class="start-btn-text">{{ t('landing.startCreating') }}</span>
            <span class="start-btn-arrow">→</span>
          </button>

          <p class="mode-hint">{{ t('landing.canSwitchLater') }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { getTenantHeaders } from '@/config/tenant'
import { getMe } from '@/api/client'
import { useI18n } from '@/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const { t } = useI18n()

const router = useRouter()
const wrapper = ref(null)
const container = ref(null)
const canvas = ref(null)
// 新 section 的 refs
const sectionTech = ref(null)
const canvasTech = ref(null)
const sectionCta = ref(null)
const canvasCta = ref(null)

// 额外场景
let scenesData = []

// Modal states
const showLoginModal = ref(false)
const showModeModal = ref(false)

// Auth states
const authMode = ref('login')
const account = ref('')
const password = ref('')
const inviteCode = ref('')
const authLoading = ref(false)
const authError = ref('')
const selectedMode = ref('canvas')

// 邮箱验证相关
const emailConfig = ref({
  require_email_verification: false,
  has_whitelist: false,
  email_whitelist: []
})
const emailCode = ref('')
const sendingCode = ref(false)
const codeSent = ref(false)
const countdown = ref(0)
const emailPrefix = ref('') // 邮箱前缀
const emailSuffix = ref('qq.com') // 邮箱后缀，默认为qq.com

// 构建完整邮箱地址
const fullEmail = computed(() => {
  if (authMode.value === 'register' && emailConfig.value.has_whitelist && emailConfig.value.email_whitelist.length > 0) {
    // 注册模式且有白名单，使用前缀+后缀
    if (emailPrefix.value && emailSuffix.value) {
      return `${emailPrefix.value}@${emailSuffix.value}`
    }
    return ''
  }
  // 其他情况使用原来的account字段
  return account.value
})

// Three.js
let scene, camera, renderer
let clock, animationId
let blackHoleGroup, particleSystem, crystalShards, energyRings
let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0

// Generate random particle style for platform
const getParticleStyle = (index) => {
  const angle = (index / 20) * 360
  const delay = Math.random() * 2
  const duration = 2 + Math.random() * 2
  return {
    '--angle': `${angle}deg`,
    '--delay': `${delay}s`,
    '--duration': `${duration}s`
  }
}

// 加载邮箱配置
async function loadEmailConfig() {
  try {
    const r = await fetch('/api/email/public-config', {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      emailConfig.value = data
      console.log('[Landing3D] 邮箱配置已加载:', data)
    }
  } catch (e) {
    console.warn('[Landing3D] 加载邮箱配置失败', e)
  }
}

// 发送验证码
async function sendVerificationCode() {
  const email = fullEmail.value
  if (!email) {
    authError.value = t('auth.pleaseEnterEmail')
    return
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    authError.value = t('auth.invalidEmail')
    return
  }

  sendingCode.value = true
  authError.value = ''
  
  try {
    const r = await fetch('/api/email/send-verification-code', {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, type: 'register' })
    })
    
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '发送失败')
    }
    
    codeSent.value = true
    
    // 开始倒计时
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        codeSent.value = false
      }
    }, 1000)
    
  } catch (e) {
    authError.value = e.message || '发送验证码失败'
  } finally {
    sendingCode.value = false
  }
}

const handleCTAClick = async () => {
  const token = localStorage.getItem('token')
  if (token) {
    const user = await getMe()
    if (user) {
      const savedMode = localStorage.getItem('userMode')
      if (savedMode) {
        navigateToMode(savedMode)
      } else {
        showModeModal.value = true
      }
      return
    }
  }
  // 打开登录弹窗时加载邮箱配置
  await loadEmailConfig()
  showLoginModal.value = true
}

const closeModal = () => {
  showLoginModal.value = false
  showModeModal.value = false
}

const submitAuth = async () => {
  authError.value = ''
  
  // 获取实际使用的邮箱地址
  const email = fullEmail.value
  
  // 注册时检查邮箱验证要求
  if (authMode.value === 'register' && emailConfig.value.require_email_verification) {
    if (!email) {
      authError.value = t('auth.pleaseSelectSuffix')
      return
    }
    if (!emailCode.value) {
      authError.value = t('auth.emailCodeRequired')
      return
    }
  }
  
  authLoading.value = true
  try {
    const url = authMode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    const payload = authMode.value === 'register'
      ? { 
          username: account.value, 
          email: email, 
          password: password.value, 
          ...(inviteCode.value ? { invite_code: inviteCode.value } : {}),
          ...(emailCode.value ? { email_code: emailCode.value } : {})
        }
      : { username: account.value, email: account.value, password: password.value }
    const r = await fetch(url, { method: 'POST', headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!r.ok) {
      const data = await r.json()
      authError.value = data.error === 'disabled' ? t('auth.accountDisabled') 
        : data.error === 'invalid_credentials' ? t('auth.invalidCredentials') 
        : data.error === 'not_found' ? t('auth.userNotFound')
        : data.error === 'invalid_email_code' ? t('auth.invalidEmailCode')
        : data.error === 'email_code_required' ? t('auth.emailCodeRequired')
        : data.error === 'email_not_whitelisted' ? t('auth.emailNotWhitelisted')
        : data.message || t('auth.operationFailed')
      return
    }
    const j = await r.json()
    localStorage.setItem('token', j.token)
    
    // 通知 App.vue 刷新用户信息
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    showLoginModal.value = false
    showModeModal.value = true
  } catch (e) {
    authError.value = t('auth.networkError')
  } finally {
    authLoading.value = false
  }
}

const navigateToMode = (mode) => {
  router.push(mode === 'canvas' ? '/canvas' : '/generate')
}

const confirmModeSelection = () => {
  localStorage.setItem('userMode', selectedMode.value)
  showModeModal.value = false
  navigateToMode(selectedMode.value)
}

// ========== THREE.JS ADVANCED EFFECTS ==========

function initScene() {
  const width = window.innerWidth
  const height = window.innerHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020208)

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000)
  camera.position.z = 600

  renderer = new THREE.WebGLRenderer({
    canvas: canvas.value,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  clock = new THREE.Clock()

  createBlackHole()
  createParticleVortex()
  createCrystalShards()
  createEnergyRings()
  createBackgroundGrid()
  createAmbientParticles()

  const ambientLight = new THREE.AmbientLight(0x111122, 0.5)
  scene.add(ambientLight)

  const pointLight1 = new THREE.PointLight(0x00ffff, 2, 800)
  pointLight1.position.set(0, 0, 100)
  scene.add(pointLight1)

  const pointLight2 = new THREE.PointLight(0x7700ff, 1.5, 600)
  pointLight2.position.set(-200, 100, 50)
  scene.add(pointLight2)

  const pointLight3 = new THREE.PointLight(0xff00aa, 1, 500)
  pointLight3.position.set(200, -100, 50)
  scene.add(pointLight3)
}

function createBlackHole() {
  blackHoleGroup = new THREE.Group()
  
  const coreGeo = new THREE.SphereGeometry(60, 64, 64)
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
        vec3 color = mix(vec3(0.0), vec3(0.0, 0.3, 0.5), fresnel * 0.3);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  blackHoleGroup.add(core)
  
  const glowGeo = new THREE.RingGeometry(65, 120, 128)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        float glow = smoothstep(1.0, 0.0, dist);
        glow *= 0.5 + 0.5 * sin(time * 2.0 + dist * 10.0);
        vec3 color = mix(vec3(0.0, 0.8, 1.0), vec3(0.5, 0.0, 1.0), dist);
        gl_FragColor = vec4(color * glow, glow * 0.6);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  blackHoleGroup.add(glow)
  
  for (let i = 0; i < 3; i++) {
    const diskGeo = new THREE.TorusGeometry(130 + i * 30, 15 - i * 3, 4, 128)
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, layer: { value: i } },
      vertexShader: `
        uniform float time;
        uniform float layer;
        varying vec2 vUv;
        varying float vDistortion;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float angle = atan(pos.y, pos.x);
          pos.z += sin(angle * 8.0 + time * 3.0 - layer) * 5.0;
          pos.z += cos(angle * 12.0 - time * 2.0 + layer * 2.0) * 3.0;
          vDistortion = pos.z * 0.1;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float layer;
        varying vec2 vUv;
        varying float vDistortion;
        void main() {
          float pulse = 0.5 + 0.5 * sin(vUv.x * 50.0 + time * 5.0 - layer * 2.0);
          vec3 color1 = vec3(0.0, 0.8, 1.0);
          vec3 color2 = vec3(0.6, 0.0, 1.0);
          vec3 color3 = vec3(1.0, 0.0, 0.5);
          vec3 color = mix(color1, color2, vUv.x);
          color = mix(color, color3, pulse * 0.3);
          float alpha = 0.4 - layer * 0.1 + vDistortion;
          gl_FragColor = vec4(color * (1.0 + pulse * 0.5), alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    const disk = new THREE.Mesh(diskGeo, diskMat)
    disk.rotation.x = Math.PI / 2 + (i - 1) * 0.1
    blackHoleGroup.add(disk)
  }
  
  scene.add(blackHoleGroup)
}

function createParticleVortex() {
  const particleCount = 5000
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const sizes = new Float32Array(particleCount)
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3
    const radius = 150 + Math.random() * 400
    const theta = Math.random() * Math.PI * 2
    const phi = (Math.random() - 0.5) * Math.PI * 0.5
    
    positions[i3] = radius * Math.cos(theta) * Math.cos(phi)
    positions[i3 + 1] = radius * Math.sin(phi) * 0.3
    positions[i3 + 2] = radius * Math.sin(theta) * Math.cos(phi)
    
    const t = Math.random()
    if (t < 0.33) {
      colors[i3] = 0; colors[i3 + 1] = 0.8 + Math.random() * 0.2; colors[i3 + 2] = 1
    } else if (t < 0.66) {
      colors[i3] = 0.5 + Math.random() * 0.3; colors[i3 + 1] = 0; colors[i3 + 2] = 1
    } else {
      colors[i3] = 1; colors[i3 + 1] = 0; colors[i3 + 2] = 0.5 + Math.random() * 0.5
    }
    
    sizes[i] = 1 + Math.random() * 3
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float pixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - 0.5);
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        gl_FragColor = vec4(vColor * 1.5, alpha * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
  
  particleSystem = new THREE.Points(geometry, material)
  scene.add(particleSystem)
}

function createCrystalShards() {
  crystalShards = new THREE.Group()
  const shardCount = 80
  const shardGeo = new THREE.OctahedronGeometry(1, 0)
  
  for (let i = 0; i < shardCount; i++) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: Math.random() > 0.5 ? 0x00ffff : 0x9900ff,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
      envMapIntensity: 2
    })
    
    const shard = new THREE.Mesh(shardGeo, mat)
    const angle = Math.random() * Math.PI * 2
    const radius = 180 + Math.random() * 200
    const height = (Math.random() - 0.5) * 150
    
    shard.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius)
    
    const scale = 5 + Math.random() * 15
    shard.scale.set(scale, scale * (1 + Math.random()), scale)
    shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    
    shard.userData = {
      originalPos: shard.position.clone(),
      rotSpeed: (Math.random() - 0.5) * 0.02,
      floatSpeed: Math.random() * 0.5 + 0.5,
      floatOffset: Math.random() * Math.PI * 2
    }
    
    crystalShards.add(shard)
  }
  
  scene.add(crystalShards)
}

function createEnergyRings() {
  energyRings = new THREE.Group()
  
  const ringGeo = new THREE.TorusGeometry(200, 3, 16, 128)
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        float glow = 0.5 + 0.5 * sin(vUv.x * 30.0 + time * 3.0);
        vec3 color = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 1.0, 1.0), glow * 0.5);
        gl_FragColor = vec4(color, 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending
  })
  const mainRing = new THREE.Mesh(ringGeo, ringMat)
  energyRings.add(mainRing)
  
  const ringParticleCount = 800
  const ringPositions = new Float32Array(ringParticleCount * 3)
  
  for (let i = 0; i < ringParticleCount; i++) {
    const angle = (i / ringParticleCount) * Math.PI * 2
    const radius = 200 + (Math.random() - 0.5) * 40
    const i3 = i * 3
    ringPositions[i3] = Math.cos(angle) * radius
    ringPositions[i3 + 1] = (Math.random() - 0.5) * 20
    ringPositions[i3 + 2] = Math.sin(angle) * radius
  }
  
  const ringParticleGeo = new THREE.BufferGeometry()
  ringParticleGeo.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3))
  
  const ringParticleMat = new THREE.PointsMaterial({
    color: 0x00ffff,
    size: 2,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  })
  
  const ringParticles = new THREE.Points(ringParticleGeo, ringParticleMat)
  energyRings.add(ringParticles)
  
  scene.add(energyRings)
}

function createBackgroundGrid() {
  const gridGroup = new THREE.Group()
  const lineMat = new THREE.LineBasicMaterial({ color: 0x1a1a3a, transparent: true, opacity: 0.3 })
  
  for (let i = -10; i <= 10; i++) {
    const points = []
    points.push(new THREE.Vector3(-800, i * 80 - 200, -500))
    points.push(new THREE.Vector3(800, i * 80 - 200, -500))
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geo, lineMat)
    gridGroup.add(line)
  }
  
  for (let i = -10; i <= 10; i++) {
    const points = []
    points.push(new THREE.Vector3(i * 80, -1000, -500))
    points.push(new THREE.Vector3(i * 80 * 0.5, 1000, 500))
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geo, lineMat)
    gridGroup.add(line)
  }
  
  scene.add(gridGroup)
}

function createAmbientParticles() {
  const count = 1000
  const positions = new Float32Array(count * 3)
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    positions[i3] = (Math.random() - 0.5) * 1500
    positions[i3 + 1] = (Math.random() - 0.5) * 1000
    positions[i3 + 2] = (Math.random() - 0.5) * 800
  }
  
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  
  const mat = new THREE.PointsMaterial({ color: 0x6666aa, size: 1, transparent: true, opacity: 0.4 })
  const particles = new THREE.Points(geo, mat)
  scene.add(particles)
}

function animate() {
  animationId = requestAnimationFrame(animate)

  const time = clock.getElapsedTime()
  
  mouseX += (targetMouseX - mouseX) * 0.05
  mouseY += (targetMouseY - mouseY) * 0.05
  
  camera.position.x = mouseX * 0.3
  camera.position.y = -mouseY * 0.2
  camera.position.z = 600
  camera.lookAt(0, 0, 0)
  
  if (blackHoleGroup) {
    blackHoleGroup.rotation.z = time * 0.1
    blackHoleGroup.children.forEach(child => {
      if (child.material && child.material.uniforms) {
        child.material.uniforms.time.value = time
      }
    })
  }
  
  if (particleSystem) {
    particleSystem.material.uniforms.time.value = time
    const positions = particleSystem.geometry.attributes.position.array
    
    for (let i = 0; i < positions.length / 3; i++) {
      const i3 = i * 3
      let x = positions[i3]
      let y = positions[i3 + 1]
      let z = positions[i3 + 2]
      
      const dist = Math.sqrt(x * x + y * y + z * z)
      const angle = Math.atan2(z, x)
      const newAngle = angle + 0.01 * (200 / dist)
      const radius = Math.sqrt(x * x + z * z)
      const pull = Math.min(1.5, 100 / (dist + 10))
      const newRadius = radius - pull
      
      if (newRadius < 60 || dist < 70) {
        const spawnAngle = Math.random() * Math.PI * 2
        const spawnRadius = 300 + Math.random() * 200
        positions[i3] = Math.cos(spawnAngle) * spawnRadius
        positions[i3 + 1] = (Math.random() - 0.5) * 100
        positions[i3 + 2] = Math.sin(spawnAngle) * spawnRadius
      } else {
        positions[i3] = Math.cos(newAngle) * newRadius
        positions[i3 + 1] = y * 0.99 + Math.sin(time + i) * 0.2
        positions[i3 + 2] = Math.sin(newAngle) * newRadius
      }
    }
    particleSystem.geometry.attributes.position.needsUpdate = true
  }
  
  if (crystalShards) {
    crystalShards.children.forEach((shard, i) => {
      const data = shard.userData
      shard.rotation.x += data.rotSpeed
      shard.rotation.y += data.rotSpeed * 0.7
      shard.position.y = data.originalPos.y + Math.sin(time * data.floatSpeed + data.floatOffset) * 10
      const orbitAngle = time * 0.1 + i * 0.1
      const orbitRadius = data.originalPos.length()
      shard.position.x = Math.cos(orbitAngle) * orbitRadius * 0.98 + data.originalPos.x * 0.02
      shard.position.z = Math.sin(orbitAngle) * orbitRadius * 0.98 + data.originalPos.z * 0.02
    })
  }
  
  if (energyRings) {
    energyRings.rotation.z = -time * 0.15
    energyRings.children[0].material.uniforms.time.value = time
  }
  
  renderer.render(scene, camera)
  
  // 更新次要场景
  animateSecondaryScenes(time)
}

function onMouseMove(e) {
  targetMouseX = (e.clientX - window.innerWidth / 2) * 0.5
  targetMouseY = (e.clientY - window.innerHeight / 2) * 0.5
}

function onResize() {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  
  // 更新次要场景
  scenesData.forEach(data => {
    data.camera.aspect = width / height
    data.camera.updateProjectionMatrix()
    data.renderer.setSize(width, height)
  })
}

// 创建次要场景（用于滚动section）
function initSecondaryScenes() {
  // Tech Section Scene - 粒子网格
  if (canvasTech.value) {
    const sceneData = createParticleGridScene(canvasTech.value)
    scenesData.push(sceneData)
  }
  
  // CTA Section Scene - 漩涡效果
  if (canvasCta.value) {
    const sceneData = createVortexScene(canvasCta.value)
    scenesData.push(sceneData)
  }
}

// 粒子网格场景
function createParticleGridScene(canvasEl) {
  const width = window.innerWidth
  const height = window.innerHeight
  
  const sceneLocal = new THREE.Scene()
  sceneLocal.background = new THREE.Color(0x020208)
  
  const cameraLocal = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000)
  cameraLocal.position.z = 500
  
  const rendererLocal = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true })
  rendererLocal.setSize(width, height)
  rendererLocal.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  
  // 创建网格粒子
  const gridSize = 20
  const spacing = 50
  const particles = []
  const positions = []
  const colors = []
  
  for (let x = -gridSize; x <= gridSize; x++) {
    for (let y = -gridSize; y <= gridSize; y++) {
      positions.push(x * spacing, y * spacing, 0)
      const c = new THREE.Color()
      c.setHSL(0.5 + Math.random() * 0.2, 0.8, 0.5)
      colors.push(c.r, c.g, c.b)
    }
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  
  const material = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  })
  
  const points = new THREE.Points(geometry, material)
  sceneLocal.add(points)
  
  return { scene: sceneLocal, camera: cameraLocal, renderer: rendererLocal, objects: [points], type: 'grid' }
}

// 简约大气的光环场景 - 更充实的视觉效果
function createVortexScene(canvasEl) {
  const width = window.innerWidth
  const height = window.innerHeight
  
  const sceneLocal = new THREE.Scene()
  sceneLocal.background = new THREE.Color(0x020208)
  
  const cameraLocal = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000)
  cameraLocal.position.z = 500
  
  const rendererLocal = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true })
  rendererLocal.setSize(width, height)
  rendererLocal.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  
  const allObjects = []
  
  // 扩大的同心圆环 - 覆盖更大范围
  for (let r = 0; r < 6; r++) {
    const radius = 100 + r * 100
    const ringGeo = new THREE.RingGeometry(radius - 1.5, radius + 1.5, 128)
    const ringMat = new THREE.MeshBasicMaterial({
      color: r % 2 === 0 ? 0x00ffff : 0x7700ff,
      transparent: true,
      opacity: 0.12 - r * 0.015,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    sceneLocal.add(ring)
    allObjects.push(ring)
  }
  
  // 水平粒子带 - 横跨整个屏幕
  const bandCount = 2000
  const bandPositions = new Float32Array(bandCount * 3)
  const bandColors = new Float32Array(bandCount * 3)
  
  for (let i = 0; i < bandCount; i++) {
    const i3 = i * 3
    bandPositions[i3] = (Math.random() - 0.5) * 1600
    bandPositions[i3 + 1] = (Math.random() - 0.5) * 120
    bandPositions[i3 + 2] = (Math.random() - 0.5) * 400
    
    const t = (bandPositions[i3] + 800) / 1600
    const color = new THREE.Color().setHSL(0.5 + t * 0.3, 0.6, 0.5)
    bandColors[i3] = color.r
    bandColors[i3 + 1] = color.g
    bandColors[i3 + 2] = color.b
  }
  
  const bandGeo = new THREE.BufferGeometry()
  bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPositions, 3))
  bandGeo.setAttribute('color', new THREE.BufferAttribute(bandColors, 3))
  
  const bandMat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending
  })
  
  const band = new THREE.Points(bandGeo, bandMat)
  sceneLocal.add(band)
  allObjects.push(band)
  
  // 中心柔和光晕 - 更大
  const glowGeo = new THREE.CircleGeometry(180, 64)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        float alpha = smoothstep(1.0, 0.0, dist) * 0.15;
        vec3 color = mix(vec3(0.0, 1.0, 1.0), vec3(0.5, 0.0, 1.0), dist);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  glow.rotation.x = Math.PI / 2
  sceneLocal.add(glow)
  allObjects.push(glow)
  
  // 背景星点 - 更多更均匀分布
  const starCount = 600
  const starPositions = new Float32Array(starCount * 3)
  const starColors = new Float32Array(starCount * 3)
  
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3
    starPositions[i3] = (Math.random() - 0.5) * 1600
    starPositions[i3 + 1] = (Math.random() - 0.5) * 900
    starPositions[i3 + 2] = (Math.random() - 0.5) * 400 - 100
    
    const brightness = 0.3 + Math.random() * 0.4
    starColors[i3] = brightness * 0.4
    starColors[i3 + 1] = brightness * 0.6
    starColors[i3 + 2] = brightness
  }
  
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
  
  const starMat = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  })
  
  const stars = new THREE.Points(starGeo, starMat)
  sceneLocal.add(stars)
  allObjects.push(stars)
  
  return { scene: sceneLocal, camera: cameraLocal, renderer: rendererLocal, objects: allObjects, type: 'vortex' }
}

// 更新次要场景动画
function animateSecondaryScenes(time) {
  scenesData.forEach(data => {
    if (data.type === 'grid') {
      const positions = data.objects[0].geometry.attributes.position.array
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 2] = Math.sin(time * 2 + positions[i] * 0.02 + positions[i + 1] * 0.02) * 30
      }
      data.objects[0].geometry.attributes.position.needsUpdate = true
      data.objects[0].rotation.z = time * 0.1
    } else if (data.type === 'vortex') {
      // 同心圆环 - 缓慢旋转 (索引 0-5)
      for (let i = 0; i < 6; i++) {
        if (data.objects[i]) {
          data.objects[i].rotation.z = time * 0.08 * (i % 2 === 0 ? 1 : -1)
        }
      }
      // 水平粒子带 - 轻微波动 (索引 6)
      if (data.objects[6]) {
        data.objects[6].rotation.y = time * 0.05
      }
      // 中心光晕 - 柔和脉动 (索引 7)
      if (data.objects[7] && data.objects[7].material.uniforms) {
        data.objects[7].material.uniforms.time.value = time
        data.objects[7].scale.setScalar(1 + Math.sin(time) * 0.08)
      }
      // 背景星点 - 缓慢漂移 (索引 8)
      if (data.objects[8]) {
        data.objects[8].rotation.y = time * 0.015
      }
    }
    
    data.renderer.render(data.scene, data.camera)
  })
}

onMounted(() => {
  initScene()
  // 延迟初始化次要场景，确保DOM已渲染
  setTimeout(() => {
    initSecondaryScenes()
  }, 100)
  animate()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  if (renderer) renderer.dispose()
  
  // 清理次要场景
  scenesData.forEach(data => {
    if (data.renderer) data.renderer.dispose()
  })
  scenesData = []
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Orbitron:wght@400;700;900&display=swap');

.landing-wrapper {
  min-height: 100vh;
  background: #020208;
  overflow-x: hidden;
  overflow-y: auto;
  scroll-behavior: smooth;
  position: relative;
}

/* 语言切换器容器 - 固定在右上角 */
.language-switcher-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 100;
}

.landing-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* Section 通用样式 */
.landing-section {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.webgl-canvas-section {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.section-content {
  position: relative;
  z-index: 10;
  text-align: center;
  padding: 40px;
  max-width: 1200px;
}

.section-title {
  margin: 0 0 20px 0;
  font-family: 'Orbitron', sans-serif;
}

.section-title .title-glow {
  display: block;
  font-size: 14px;
  font-weight: 400;
  color: rgba(0, 255, 255, 0.8);
  letter-spacing: 8px;
  text-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
  margin-bottom: 10px;
}

.section-title .title-main {
  display: block;
  font-size: 48px;
  font-weight: 900;
  background: linear-gradient(135deg, #ffffff 0%, #00ffff 50%, #9900ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 4px;
}

.section-title.large .title-main {
  font-size: 56px;
}

.section-desc {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 40px 0;
  letter-spacing: 2px;
}

/* Tech Section */
.section-tech {
  background: linear-gradient(180deg, #030310 0%, #020208 100%);
}

.tech-grid {
  display: flex;
  gap: 50px;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 900px;
  margin: 0 auto;
}

.tech-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.tech-ring {
  width: 80px;
  height: 80px;
  border: 2px solid rgba(0, 255, 255, 0.3);
  border-radius: 50%;
  position: relative;
  animation: techPulse 2s ease-in-out infinite;
}

.tech-ring::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(153, 0, 255, 0.4);
  border-radius: 50%;
}

.tech-ring::after {
  content: '';
  position: absolute;
  inset: 20px;
  background: radial-gradient(circle, rgba(0, 255, 255, 0.3) 0%, transparent 70%);
  border-radius: 50%;
}

@keyframes techPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
}

.tech-item span {
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 1px;
}

/* CTA Section */
.section-cta {
  background: #020208;
}

.cta-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cta-button-final {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 50px;
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(153, 0, 255, 0.2));
  border: 2px solid rgba(0, 255, 255, 0.5);
  border-radius: 60px;
  cursor: pointer;
  transition: all 0.4s ease;
  position: relative;
  overflow: hidden;
}

.cta-button-final::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.4), rgba(153, 0, 255, 0.4));
  opacity: 0;
  transition: opacity 0.4s ease;
}

.cta-button-final:hover::before {
  opacity: 1;
}

.cta-button-final:hover {
  transform: scale(1.05);
  box-shadow: 0 0 60px rgba(0, 255, 255, 0.3);
}

.btn-text-final {
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  position: relative;
  z-index: 1;
  letter-spacing: 2px;
}

.btn-arrow {
  font-size: 24px;
  color: #00ffff;
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease;
}

.cta-button-final:hover .btn-arrow {
  transform: translateX(8px);
}

.webgl-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none;
  display: flex;
  justify-content: center;
  align-items: center;
}

.side-text {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'Orbitron', sans-serif;
}

.side-text.left {
  left: 3%;
  text-align: right;
  padding-right: 20px;
  border-right: 1px solid rgba(0, 255, 255, 0.3);
}

.side-text.right {
  right: 3%;
  text-align: left;
  padding-left: 20px;
  border-left: 1px solid rgba(0, 255, 255, 0.3);
}

.text-glow {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.4);
  letter-spacing: 3px;
}

.text-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 2px;
}

.center-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
}

/* ===== Glowing Platform ===== */
.platform-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  height: 400px;
  pointer-events: none;
}

.platform-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 300px;
  height: 300px;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse at center, 
    rgba(0, 255, 255, 0.15) 0%, 
    rgba(100, 0, 255, 0.1) 30%,
    transparent 70%
  );
  filter: blur(30px);
  animation: platformPulse 3s ease-in-out infinite;
}

@keyframes platformPulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
}

.platform-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border-radius: 50%;
  border: 1px solid;
  transform: translate(-50%, -50%);
}

.ring-1 {
  width: 200px;
  height: 200px;
  border-color: rgba(0, 255, 255, 0.3);
  animation: ringRotate 20s linear infinite;
}

.ring-2 {
  width: 260px;
  height: 260px;
  border-color: rgba(100, 0, 255, 0.2);
  animation: ringRotate 30s linear infinite reverse;
}

.ring-3 {
  width: 320px;
  height: 320px;
  border-color: rgba(0, 255, 255, 0.1);
  border-style: dashed;
  animation: ringRotate 40s linear infinite;
}

@keyframes ringRotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

.platform-particles {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  transform: translate(-50%, -50%);
}

.particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  background: #00ffff;
  border-radius: 50%;
  box-shadow: 0 0 6px #00ffff, 0 0 12px #00ffff;
  animation: particleFloat var(--duration) ease-in-out infinite;
  animation-delay: var(--delay);
  transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-120px);
}

@keyframes particleFloat {
  0%, 100% { 
    opacity: 0.3;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-100px) scale(0.5);
  }
  50% { 
    opacity: 1;
    transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-140px) scale(1);
  }
}

/* ===== CTA Button ===== */
.cta-button {
  position: relative;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  z-index: 10;
}

.btn-glow-outer {
  position: absolute;
  inset: -20px;
  background: radial-gradient(ellipse at center, 
    rgba(0, 255, 255, 0.3) 0%, 
    rgba(100, 0, 255, 0.2) 40%,
    transparent 70%
  );
  filter: blur(20px);
  opacity: 0.8;
  animation: glowPulse 2s ease-in-out infinite;
  pointer-events: none;
}

.btn-glow-inner {
  position: absolute;
  inset: -4px;
  background: linear-gradient(135deg, 
    rgba(0, 255, 255, 0.6), 
    rgba(100, 0, 255, 0.6),
    rgba(255, 0, 150, 0.4),
    rgba(0, 255, 255, 0.6)
  );
  background-size: 300% 300%;
  clip-path: polygon(12% 0, 100% 0, 100% 65%, 88% 100%, 0 100%, 0 35%);
  animation: borderGradient 4s ease infinite;
  pointer-events: none;
}

@keyframes borderGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

.btn-glass {
  position: relative;
  padding: 22px 70px;
  background: linear-gradient(135deg, 
    rgba(0, 20, 40, 0.9) 0%, 
    rgba(10, 10, 30, 0.95) 50%,
    rgba(20, 5, 40, 0.9) 100%
  );
  clip-path: polygon(12% 0, 100% 0, 100% 65%, 88% 100%, 0 100%, 0 35%);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.btn-text {
  font-family: 'Cinzel', serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 4px;
  background: linear-gradient(to right, #ffffff, #aaddff, #ffffff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 8px rgba(150, 200, 255, 0.5));
}

.btn-shine {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, 
    transparent 0%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 100%
  );
  clip-path: polygon(12% 0, 100% 0, 100% 65%, 88% 100%, 0 100%, 0 35%);
  animation: shine 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes shine {
  0% { left: -100%; }
  50%, 100% { left: 200%; }
}

.cta-button:hover .btn-glass {
  background: linear-gradient(135deg, 
    rgba(0, 30, 60, 0.95) 0%, 
    rgba(20, 10, 50, 0.98) 50%,
    rgba(30, 5, 60, 0.95) 100%
  );
}

.cta-button:hover .btn-text {
  filter: drop-shadow(0 0 15px rgba(0, 255, 255, 0.8));
}

.cta-button:hover .btn-glow-outer {
  opacity: 1;
  filter: blur(25px);
}

.cta-button:active {
  transform: scale(0.98);
}


/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-dark {
  background: rgba(2, 2, 8, 0.7);
  backdrop-filter: blur(12px);
}

.modal-container {
  position: relative;
  width: 90%;
  max-width: 400px;
  border-radius: 20px;
  padding: 36px;
}

.glass-modal {
  background: rgba(15, 15, 35, 0.75);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(0, 255, 255, 0.2);
  box-shadow: 
    0 0 60px rgba(0, 255, 255, 0.08),
    0 0 100px rgba(119, 0, 255, 0.05),
    inset 0 0 80px rgba(0, 255, 255, 0.02);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #00ffff;
}

.modal-header {
  text-align: center;
  margin-bottom: 28px;
}

.modal-logo-ring {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border: 2px solid rgba(0, 255, 255, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ringPulse 2s ease-in-out infinite;
}

@keyframes ringPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 255, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(0, 255, 255, 0); }
}

.logo-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #00ffff, #7700ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.modal-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
}

.modal-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.auth-toggle {
  display: flex;
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 24px;
}

.toggle-btn {
  flex: 1;
  padding: 10px 16px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.3s ease;
  position: relative;
  z-index: 2;
}

.toggle-btn.active {
  color: #fff;
}

.toggle-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(119, 0, 255, 0.2));
  border-radius: 8px;
  transition: transform 0.3s ease;
  z-index: 1;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-input {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  color: #fff;
  font-size: 14px;
  transition: all 0.3s ease;
  width: 100%;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: rgba(0, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.05);
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.email-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.email-prefix {
  flex: 2;
  min-width: 0;
}

.email-at {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 600;
}

.email-suffix {
  flex: 1;
  min-width: 120px;
  background: rgba(255, 255, 255, 0.08) !important;
  color: #ffffff !important;
  font-weight: 500;
}

.email-suffix option {
  background: rgba(20, 20, 40, 0.98);
  color: #ffffff;
  padding: 8px;
}

.code-input-group {
  display: flex;
  gap: 8px;
}

.code-input {
  flex: 1;
}

.code-btn {
  padding: 14px 16px;
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 10px;
  color: #00ffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  min-width: 100px;
}

.code-btn:hover:not(:disabled) {
  background: rgba(0, 255, 255, 0.2);
  border-color: rgba(0, 255, 255, 0.5);
}

.code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint-text {
  font-size: 11px;
  color: rgba(255, 180, 0, 0.7);
  margin: 6px 0 0 0;
  text-align: center;
}

.error-message {
  padding: 10px 14px;
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.2);
  border-radius: 8px;
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
}

.submit-btn {
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.7), rgba(119, 0, 255, 0.7));
  border: none;
  border-radius: 10px;
  padding: 14px 24px;
  color: #fff;
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 255, 255, 0.25);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-footer {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
}

.footer-text {
  color: rgba(255, 255, 255, 0.4);
}

.link-btn {
  background: none;
  border: none;
  color: #00ffff;
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  margin-left: 4px;
}

.link-btn:hover {
  text-decoration: underline;
}

/* Mode Modal */
.mode-modal {
  max-width: 480px;
}

.mode-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.mode-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 18px 20px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.mode-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(0, 255, 255, 0.2);
}

.mode-card.selected {
  background: rgba(0, 255, 255, 0.05);
  border-color: rgba(0, 255, 255, 0.4);
}

.mode-check {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #00ffff, #7700ff);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
}

.mode-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.3s ease;
}

.mode-card.selected .mode-icon {
  color: #00ffff;
}

.mode-content {
  flex: 1;
}

.mode-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px 0;
}

.mode-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

.mode-tag {
  position: absolute;
  top: -8px;
  right: 16px;
  padding: 3px 10px;
  background: linear-gradient(135deg, #00ffff, #7700ff);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.start-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.15), rgba(119, 0, 255, 0.15));
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 12px;
  padding: 16px 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  overflow: hidden;
  position: relative;
}

.start-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(119, 0, 255, 0.3));
  opacity: 0;
  transition: opacity 0.3s ease;
}

.start-btn:hover::before {
  opacity: 1;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 255, 255, 0.2);
}

.start-btn-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  position: relative;
  z-index: 1;
}

.start-btn-arrow {
  font-size: 18px;
  color: #00ffff;
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease;
}

.start-btn:hover .start-btn-arrow {
  transform: translateX(4px);
}

.mode-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 16px;
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-container,
.modal-fade-leave-to .modal-container {
  transform: scale(0.95) translateY(10px);
}

@media (max-width: 640px) {
  .side-text { display: none; }
  .modal-container { padding: 28px 20px; margin: 16px; }
  .btn-text { font-size: 20px; letter-spacing: 2px; }
  .btn-glass { padding: 18px 50px; }
  .platform-container { width: 300px; height: 300px; }
  .ring-1 { width: 150px; height: 150px; }
  .ring-2 { width: 200px; height: 200px; }
  .ring-3 { width: 250px; height: 250px; }
  
  /* 新section响应式 */
  .section-title .title-main { font-size: 28px; letter-spacing: 2px; }
  .section-title.large .title-main { font-size: 32px; }
  .section-title .title-glow { font-size: 11px; letter-spacing: 4px; }
  .section-desc { font-size: 14px; }
  .tech-grid { gap: 24px 16px; }
  .tech-ring { width: 50px; height: 50px; }
  .tech-item span { font-size: 10px; }
  .tech-item { min-width: 80px; }
  .cta-button-final { padding: 16px 36px; }
  .btn-text-final { font-size: 15px; }
}
</style>

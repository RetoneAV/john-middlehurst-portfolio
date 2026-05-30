import { createWGSLFlowParticles } from './WGSLFlowParticles.js'
const DEFAULT_HOLD_SECONDS = 6.5
const DEFAULT_MORPH_SECONDS = 4.8
const TEXT_SINGLE_FONT_SIZE = 184
const TEXT_STACKED_FONT_SIZE = 150
const TEXT_DEPTH = 0.34
const TREFOIL_Z_ROTATION = Math.PI / 2
const GOLDEN_ANGLE = 2.399963229728653
const TAU = Math.PI * 2
export const DEFAULT_TARGET_CONFIGS = [
  { kind: 'sphere',  label: 'Sphere',  enabled: true, text: '',     fontSize: TEXT_SINGLE_FONT_SIZE },
  { kind: 'tetra',   label: 'Tetra',   enabled: true, text: '',     fontSize: TEXT_SINGLE_FONT_SIZE },
  { kind: 'trefoil', label: 'Trefoil', enabled: true, text: '',     fontSize: TEXT_SINGLE_FONT_SIZE },
  { kind: 'text',    label: 'Text 1',  enabled: true, text: 'TSL',     fontSize: TEXT_SINGLE_FONT_SIZE },
  { kind: 'text',    label: 'Text 2',  enabled: true, text: 'GL|SL',   fontSize: TEXT_STACKED_FONT_SIZE },
]
function parseTextLines(text) {
  if (Array.isArray(text)) return text.filter((s) => typeof s === 'string' && s.length > 0)
  if (typeof text !== 'string') return ['?']
  const lines = text.split(/[\n|]/).map((s) => s).filter((s) => s.length > 0)
  return lines.length > 0 ? lines : ['?']
}
function normaliseTargetConfig(config, index) {
  const kind = config?.kind ?? 'sphere'
  const isText = kind === 'text'
  return {
    kind,
    label: config?.label ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${index + 1}`,
    enabled: config?.enabled !== false,
    text: isText ? (config?.text ?? 'TEXT') : '',
    fontSize:
      isText
        ? (typeof config?.fontSize === 'number'
            ? config.fontSize
            : parseTextLines(config?.text).length > 1
              ? TEXT_STACKED_FONT_SIZE
              : TEXT_SINGLE_FONT_SIZE)
        : TEXT_SINGLE_FONT_SIZE,
  }
}
export class MorphFlowParticles {
  constructor(renderer, options = {}) {
    Object.defineProperty(this, 'mesh', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'holdSeconds', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'morphSeconds', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'particles', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'size', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'count', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'targets', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    Object.defineProperty(this, 'destinationData', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0,
    })
    this.size = options.size ?? 64
    this.count = this.size * this.size
    this.holdSeconds = options.holdSeconds ?? DEFAULT_HOLD_SECONDS
    this.morphSeconds = options.morphSeconds ?? DEFAULT_MORPH_SECONDS
    const rawConfigs = options.targets ?? DEFAULT_TARGET_CONFIGS
    this.targetConfigs = rawConfigs.map((c, i) => normaliseTargetConfig(c, i))
    this.targets = this.targetConfigs.map((c) => this.buildTarget(c))
    this._activeIndices = []
    this._recomputeActive()
    this.destinationData = new Float32Array(this.count * 4)
    this.particles = createWGSLFlowParticles(renderer, {
      mode: 'cloud3d',
      size: this.size,
    })
    this.mesh = this.particles.mesh
    this.updateDestination(0)
  }
  /**
   * Replace the entire targets cycle with a new config array. Re-rasterises
   * any text targets immediately. Cheap unless you have many text targets.
   */
  setTargets(configs) {
    this.targetConfigs = configs.map((c, i) => normaliseTargetConfig(c, i))
    this.targets = this.targetConfigs.map((c) => this.buildTarget(c))
    this._recomputeActive()
  }
  /**
   * Patch a single target config (e.g. flip enabled, change text, change
   * fontSize). Only rebuilds the target buffer if content-bearing fields
   * actually changed.
   */
  setTargetConfig(index, partial) {
    if (index < 0 || index >= this.targetConfigs.length) return
    const prev = this.targetConfigs[index]
    const merged = normaliseTargetConfig({ ...prev, ...partial }, index)
    const needsRebuild =
      prev.kind !== merged.kind ||
      prev.text !== merged.text ||
      prev.fontSize !== merged.fontSize
    this.targetConfigs[index] = merged
    if (needsRebuild) {
      this.targets[index] = this.buildTarget(merged)
    }
    if (prev.enabled !== merged.enabled) {
      this._recomputeActive()
    }
  }
  /**
   * Update the particle palette uniforms on the underlying WGSL particle
   * system. Fields are optional: pass only what you want to change.
   */
  setColorParams({ primary, secondary, mix, saturation } = {}) {
    const p = this.particles
    if (!p) return
    if (primary && p.colorPrimaryNode) {
      p.colorPrimaryNode.value.setRGB(primary.r, primary.g, primary.b)
    }
    if (secondary && p.colorSecondaryNode) {
      p.colorSecondaryNode.value.setRGB(secondary.r, secondary.g, secondary.b)
    }
    if (typeof mix === 'number' && p.colorMixNode) {
      p.colorMixNode.value = Math.max(0, Math.min(1, mix))
    }
    if (typeof saturation === 'number' && p.particleSaturationNode) {
      p.particleSaturationNode.value = Math.max(0, saturation)
    }
  }
  _recomputeActive() {
    this._activeIndices = this.targetConfigs
      .map((c, i) => (c.enabled ? i : -1))
      .filter((i) => i >= 0)
  }
  buildTarget(config) {
    switch (config.kind) {
      case 'sphere':
        return this.createSphereTarget()
      case 'tetra':
        return this.createTetraTarget()
      case 'trefoil':
        return this.createTrefoilTarget()
      case 'text':
        return this.createTextTarget(config.text, config.fontSize)
      default:
        return this.createSphereTarget()
    }
  }
  step(params, timeSeconds) {
    this.updateDestination(timeSeconds)
    this.particles.step(params)
  }
  reset() {
    this.particles.reset()
    this.updateDestination(0)
  }
  dispose() {
    this.particles.dispose()
  }
  updateDestination(timeSeconds) {
    const active = this._activeIndices
    const total = active.length
    if (total === 0) return // freeze whatever destination was last set
    const holdSeconds = Math.max(0.1, this.holdSeconds)
    const morphSeconds = Math.max(0.1, this.morphSeconds)
    const segmentSeconds = holdSeconds + morphSeconds
    const cycleSeconds = segmentSeconds * total
    const phaseSeconds = positiveModulo(timeSeconds, cycleSeconds)
    const fromActive = Math.floor(phaseSeconds / segmentSeconds)
    const toActive = total === 1 ? fromActive : (fromActive + 1) % total
    const localSeconds = phaseSeconds - fromActive * segmentSeconds
    const progress =
      localSeconds <= holdSeconds || total === 1
        ? 0
        : Math.min(1, Math.max(0, (localSeconds - holdSeconds) / morphSeconds))
    const eased = easeInOutCubic(progress)
    const from = this.targets[active[fromActive]]
    const to = this.targets[active[toActive]]
    const data = this.destinationData
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lerp(from[i], to[i], eased)
      data[i + 1] = lerp(from[i + 1], to[i + 1], eased)
      data[i + 2] = lerp(from[i + 2], to[i + 2], eased)
      data[i + 3] = lerp(from[i + 3], to[i + 3], eased)
    }
    this.particles.setDestinationData(data)
  }
  createSphereTarget() {
    const data = new Float32Array(this.count * 4)
    const radius = 1.7
    for (let i = 0; i < this.count; i += 1) {
      const yNorm = 1 - 2 * ((i + 0.5) / this.count)
      const ring = Math.sqrt(Math.max(0, 1 - yNorm * yNorm))
      const theta = i * GOLDEN_ANGLE
      const offset = i * 4
      data[offset] = Math.cos(theta) * ring * radius
      data[offset + 1] = yNorm * radius
      data[offset + 2] = Math.sin(theta) * ring * radius
      data[offset + 3] = 0.82
    }
    return data
  }
  createTetraTarget() {
    const data = new Float32Array(this.count * 4)
    const random = mulberry32(0xced1ce)
    const top = [0, 1.78, 0]
    const bottom = [0, -1.78, 0]
    const ringRadius = 1.78
    const ring = [0, 1, 2].map((index) => {
      const angle = -Math.PI / 2 + (index / 3) * TAU
      return [Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius]
    })
    const faces = [
      [top, ring[0], ring[1]],
      [top, ring[1], ring[2]],
      [top, ring[2], ring[0]],
      [bottom, ring[1], ring[0]],
      [bottom, ring[2], ring[1]],
      [bottom, ring[0], ring[2]],
    ]
    for (let i = 0; i < this.count; i += 1) {
      const face = faces[i % faces.length]
      const point = sampleTriangle(face[0], face[1], face[2], random(), random())
      const offset = i * 4
      data[offset] = point[0]
      data[offset + 1] = point[1]
      data[offset + 2] = point[2]
      data[offset + 3] = 0.95
    }
    return data
  }
  createTrefoilTarget() {
    const data = new Float32Array(this.count * 4)
    const random = mulberry32(0x7eefe011)
    const scale = 0.85
    for (let i = 0; i < this.count; i += 1) {
      const t = (i / this.count) * TAU
      const tubeAngle = random() * TAU
      const tubeRadius = Math.sqrt(random()) * 0.26 * scale
      const offset = i * 4
      const x = Math.sin(t) + 2 * Math.sin(2 * t)
      const y = Math.cos(t) - 2 * Math.cos(2 * t)
      const z = -Math.sin(3 * t)
      const baseX = x * 0.62 * scale + Math.cos(tubeAngle) * tubeRadius
      const baseY = y * 0.62 * scale + Math.sin(tubeAngle) * tubeRadius
      const rotated = rotateZ(baseX, baseY, TREFOIL_Z_ROTATION)
      data[offset] = rotated[0]
      data[offset + 1] = rotated[1]
      data[offset + 2] = z * 0.62 * scale + (random() - 0.5) * 0.3 * scale
      data[offset + 3] = 0.9
    }
    return data
  }
  createTextTarget(text, fontSizeOverride) {
    const canvas = document.createElement('canvas')
    const width = 768
    const height = 256
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return this.createSphereTarget()
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const lines = parseTextLines(text)
    const defaultFontSize = lines.length > 1 ? TEXT_STACKED_FONT_SIZE : TEXT_SINGLE_FONT_SIZE
    const fontSize =
      typeof fontSizeOverride === 'number' && fontSizeOverride > 0
        ? Math.max(20, Math.min(360, fontSizeOverride))
        : defaultFontSize
    const lineHeight = fontSize * 0.74
    const letterSpacing = lines.length > 1 ? -10 : -14
    ctx.font = `850 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
    for (let i = 0; i < lines.length; i += 1) {
      const y = height / 2 + (i - (lines.length - 1) / 2) * lineHeight + 2
      drawTrackedText(ctx, lines[i], width / 2, y, letterSpacing)
    }
    const pixels = ctx.getImageData(0, 0, width, height).data
    const points = []
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (pixels[(y * width + x) * 4 + 3] > 32) {
          points.push({ x, y })
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
    }
    const textCenterX = points.length > 0 ? (minX + maxX) / 2 : width / 2
    const textCenterY = points.length > 0 ? (minY + maxY) / 2 : height / 2
    const data = new Float32Array(this.count * 4)
    const random = mulberry32(hashString(lines.join('/')))
    for (let i = 0; i < this.count; i += 1) {
      const point = points[Math.floor(random() * points.length)] ?? {
        x: textCenterX,
        y: textCenterY,
      }
      const offset = i * 4
      data[offset] = (point.x - textCenterX) / 76 + (random() - 0.5) * 0.035
      data[offset + 1] = -(point.y - textCenterY) / 76 + (random() - 0.5) * 0.035
      data[offset + 2] = (random() - 0.5) * TEXT_DEPTH
      data[offset + 3] = 1.08
    }
    return data
  }
}
function drawTrackedText(ctx, text, centerX, y, letterSpacing) {
  const chars = [...text]
  const textWidth =
    chars.reduce((width, char) => width + ctx.measureText(char).width, 0) +
    Math.max(0, chars.length - 1) * letterSpacing
  let x = centerX - textWidth / 2
  for (const char of chars) {
    ctx.fillText(char, x, y)
    x += ctx.measureText(char).width + letterSpacing
  }
}
function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor
}
function rotateZ(x, y, angle) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}
function lerp(a, b, t) {
  return a + (b - a) * t
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
function sampleTriangle(a, b, c, r1, r2) {
  const sr1 = Math.sqrt(r1)
  const wa = 1 - sr1
  const wb = sr1 * (1 - r2)
  const wc = sr1 * r2
  return [
    a[0] * wa + b[0] * wb + c[0] * wc,
    a[1] * wa + b[1] * wb + c[1] * wc,
    a[2] * wa + b[2] * wb + c[2] * wc,
  ]
}
function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

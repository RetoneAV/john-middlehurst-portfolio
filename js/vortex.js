/* ============================================================
   Vortex effect — fullscreen fragment shader.
   ------------------------------------------------------------
   A smoke/fluid vortex receding into the distance in orange,
   purple and blue. The mouse cursor:
     * locally warps the flow field (disrupting the vortex)
     * leaves a bright warm glow at its position
     * draws a soft trail along its velocity
   ============================================================ */
import * as THREE from "three";

const VORTEX_VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const VORTEX_FRAG = /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform vec2  uMouse;      // -1..1, screen-normalized
    uniform vec2  uMouseVel;   // per-second, in normalized units
    uniform float uMouseGlow;  // 0..~1.5, decays smoothly
    uniform float uOpacity;    // crossfade

    // --- 2D value noise ---
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.07 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      // Aspect-corrected centered UV: 0,0 at center
      vec2 uv = vUv - 0.5;
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      uv.x *= aspect;

      // Mouse in the same aspect-corrected space
      vec2 mUv = uMouse * 0.5;
      mUv.x *= aspect;

      // --- Mouse disturbance: warp the field around the cursor ---
      vec2 toMouse = uv - mUv;
      float mDist = length(toMouse);
      float warpAmp = exp(-mDist * 3.2) * (0.18 + uMouseGlow * 0.22);
      // Mix of inward pull + tangential swirl
      vec2 tangent = vec2(-toMouse.y, toMouse.x);
      vec2 warp = (-toMouse * 0.7 + tangent * 1.4) * warpAmp;
      vec2 wUv = uv + warp;

      // --- Polar from warped uv ---
      float r = length(wUv);
      float theta = atan(wUv.y, wUv.x);

      // Depth coordinate: 1/r maps center to "infinity"
      float depth = 0.5 / max(r, 0.045);

      // Differential rotation: faster spin closer to center
      float rotation = uTime * 0.35 + depth * 0.28;
      float spinTheta = theta + rotation;

      // --- Smoke noise sampled in (theta, depth) space ---
      // Flow inward over time (decrement on depth axis)
      vec2 nCoord = vec2(spinTheta * 0.55, depth - uTime * 0.55);

      // Domain warp for fluid turbulence
      vec2 q = vec2(fbm(nCoord * 1.25 + 0.3),
                    fbm(nCoord * 1.25 + 5.7));
      float n = fbm(nCoord + q * 1.45);

      // Radial streaks ("speed lines" rushing inward)
      float streak = fbm(vec2(spinTheta * 5.0, depth * 0.6 - uTime * 1.4));
      n = mix(n, streak, 0.32);

      // --- Palette: orange, purple, blue ---
      vec3 cBlue   = vec3(0.10, 0.28, 0.95);
      vec3 cPurple = vec3(0.58, 0.18, 0.88);
      vec3 cOrange = vec3(1.00, 0.46, 0.10);

      vec3 col = mix(cBlue, cPurple, smoothstep(0.30, 0.60, n));
      col = mix(col, cOrange, smoothstep(0.62, 0.88, n));

      // Brightness donut: dim at center, peak around mid-ring, fade at edges
      float profile = smoothstep(0.0, 0.18, r) * (1.0 - smoothstep(0.78, 1.45, r));
      float bright  = profile * (0.42 + n * 1.05);
      col *= bright;

      // Soft warm core halo so the eye of the vortex glows orange-ish
      col += cOrange * 0.55 * exp(-r * 4.2);

      // Subtle blue rim flare further out
      col += cBlue * 0.12 * smoothstep(0.6, 1.0, r) * (0.5 + n * 0.5);

      // Mouse glow / halo / velocity trail removed — the cursor only
      // disrupts the flow field now (see the warp computed above).

      // Vignette
      col *= 1.0 - smoothstep(0.55, 1.55, length(uv) * 1.02);

      // Gentle tone curve
      col = pow(max(col, 0.0), vec3(0.95));

      gl_FragColor = vec4(col, uOpacity);
    }
  `;

export class VortexEffect {
  constructor(renderer) {
      this.renderer = renderer;

      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const geo = new THREE.PlaneGeometry(2, 2);

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uTime:       { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uMouse:      { value: new THREE.Vector2(0, 0) },
          uMouseVel:   { value: new THREE.Vector2(0, 0) },
          uMouseGlow:  { value: 0 },
          uOpacity:    { value: 1 },
        },
        vertexShader: VORTEX_VERT,
        fragmentShader: VORTEX_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);

      this.time = 0;
      this.mouseTarget = new THREE.Vector2(0, 0);
      this.mouse = new THREE.Vector2(0, 0);
      this._prevMouse = new THREE.Vector2(0, 0);
      this.mouseVel = new THREE.Vector2(0, 0);
      this.glow = 0;
      this.opacity = 1;
    }

    setMouse(x, y) {
      this.mouseTarget.set(x, y);
    }

    setOpacity(o) {
      this.opacity = o;
    }

    setSize(w, h) {
      this.material.uniforms.uResolution.value.set(w, h);
    }

    update(dt) {
      dt = Math.max(1e-4, Math.min(dt, 1 / 30));
      this.time += dt;

      // Smooth mouse (lerp)
      this._prevMouse.copy(this.mouse);
      this.mouse.lerp(this.mouseTarget, 0.18);

      // Velocity in per-second units of normalized screen space
      this.mouseVel.subVectors(this.mouse, this._prevMouse).multiplyScalar(1 / dt);

      // Glow follows velocity, decaying when still
      const speedNorm = Math.min(this.mouseVel.length() * 0.4, 3);
      this.glow = this.glow * 0.90 + speedNorm * 0.35;
      this.glow = Math.min(this.glow, 1.5);

      const u = this.material.uniforms;
      u.uTime.value      = this.time;
      u.uMouse.value.copy(this.mouse);
      u.uMouseVel.value.copy(this.mouseVel);
      u.uMouseGlow.value = this.glow;
      u.uOpacity.value   = this.opacity;
    }

    render() {
      this.renderer.render(this.scene, this.camera);
    }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

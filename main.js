// ES Modules imports
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const container = document.getElementById('globe-container');
const EARTH_RADIUS = 5;
const BASE_EARTH_Y_ROTATION = THREE.MathUtils.degToRad(-90);
const UTC_NOON_PHASE_OFFSET = -Math.PI / 2; // Greenwich faces sun at 12:00 UTC

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 0.08);
scene.add(ambientLight);

const sunlight = new THREE.DirectionalLight(0xffffff, 2.0);
sunlight.position.set(10, 0, 0);
scene.add(sunlight);
scene.add(sunlight.target);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true; // gentle spin even if UTC changes are slow
controls.autoRotateSpeed = 0.2;
controls.minDistance = 6;
controls.maxDistance = 15;

// Sun direction vector sent to shader (world space +X)
const lightDirectionVector = new THREE.Vector3(1, 0, 0).normalize();

// Textures
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
const dayTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
const nightTexture = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
const specularMap = loader.load('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg');
dayTexture.colorSpace = THREE.SRGBColorSpace;
nightTexture.colorSpace = THREE.SRGBColorSpace;
specularMap.colorSpace = THREE.NoColorSpace;

// Earth (custom shader with day/night + specular)
const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
const earthMaterial = new THREE.ShaderMaterial({
  uniforms: {
    dayTexture: { value: dayTexture },
    nightTexture: { value: nightTexture },
    specularMap: { value: specularMap },
    lightDirection: { value: lightDirectionVector },
    dayBrightness: { value: 1.6 },
    nightBrightness: { value: 0.0 },
    nightBase: { value: 0.30 }
  },
  transparent: false,
  depthWrite: true,
  depthTest: true,
  vertexShader: `
    varying vec2 vUv;
    varying float nDotL;
    varying vec3 vNormalWorld;
    uniform vec3 lightDirection; // world space
    void main() {
      vUv = uv;
      vNormalWorld = normalize(mat3(modelMatrix) * normal);
      nDotL = dot(vNormalWorld, normalize(lightDirection));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform sampler2D specularMap;
    uniform float dayBrightness;
    uniform float nightBrightness;
    uniform float nightBase; // dim albedo on night side from day texture
    varying vec2 vUv;
    varying float nDotL; // [-1,1]
    varying vec3 vNormalWorld;
    void main() {
      vec3 dayColor = texture2D(dayTexture, vUv).rgb;
      vec3 nightColor = texture2D(nightTexture, vUv).rgb;
      float specMask = texture2D(specularMap, vUv).r; // oceans brighter in specular map

      // Smooth twilight band (~4 degrees)
      float dayFactor = smoothstep(0.0, 0.07, nDotL);
      float nightFactor = 1.0 - dayFactor;

      // Simple specular highlight on oceans (Blinn-Phong-like, fake view = +Z)
      vec3 L = normalize(vec3(1.0, 0.0, 0.0));
      vec3 V = normalize(vec3(0.0, 0.0, 1.0));
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(vNormalWorld, H), 0.0), 80.0) * specMask * max(nDotL, 0.0);

      vec3 dayLit = min(dayColor * dayBrightness, vec3(1.0));
      // Use darkened day albedo for night hemisphere so landmasses are visible
      vec3 nightAlbedo = dayColor * nightBase;
      vec3 nightLit = nightAlbedo; // do not re-introduce city lights
      vec3 base = mix(nightLit, dayLit, dayFactor);
      vec3 color = base + vec3(spec);
      gl_FragColor = vec4(color, 1.0);
    }
  `
});
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
earth.rotation.order = 'YXZ';
earth.rotation.y = BASE_EARTH_Y_ROTATION;
scene.add(earth);

// Time helpers
function getEarthRotationAngleUTC() {
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const milliseconds = now.getUTCMilliseconds();
  const totalHours = hours + minutes / 60 + seconds / 3600 + milliseconds / 3600000;
  return (totalHours % 24) * (Math.PI * 2 / 24);
}

// Sun alignment: keep light at +X in world; Earth rotates against it by UTC
sunlight.position.set(10, 0, 0);
sunlight.target.position.set(0, 0, 0);
sunlight.target.updateMatrixWorld();

// Animate
function animate() {
  requestAnimationFrame(animate);
  const utcAngle = getEarthRotationAngleUTC();
  earth.rotation.y = BASE_EARTH_Y_ROTATION + utcAngle + UTC_NOON_PHASE_OFFSET;
  earthMaterial.uniforms.lightDirection.value.copy(lightDirectionVector);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Provinces time overlay
const PROVINCES = [
  { name: 'Istanbul', tz: 'Europe/Istanbul' },
  { name: 'Ankara', tz: 'Europe/Istanbul' },
  { name: 'Izmir', tz: 'Europe/Istanbul' },
  { name: 'London', tz: 'Europe/London' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'Shanghai', tz: 'Asia/Shanghai' },
  { name: 'Los Angeles', tz: 'America/Los_Angeles' },
  { name: 'Berlin (Germany)', tz: "Europe/Berlin" },
  { name: 'Rome (Italy)', tz: "Europe/Rome" },
  { name: 'Tehran (Iran)', tz: "Asia/Tehran" },
  { name: 'Lisbon (Portugal)', tz: "Europe/Lisbon" },
  { name: 'Brasília (Brazil)', tz: "America/Sao_Paulo" }
];

const timeListEl = document.getElementById('time-list');
function updateTimeOverlay() {
  if (!timeListEl) return;
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  let html = '';
  for (const p of PROVINCES) {
    const fmt = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: p.tz });
    const time = fmt.format(new Date());
    html += `<div class="time-row"><span class="time-label">${p.name}</span><span class="time-clock">${time}</span></div>`;
  }
  timeListEl.innerHTML = html;
}
updateTimeOverlay();
setInterval(updateTimeOverlay, 1000);

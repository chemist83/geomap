// --- TEMEL AYARLAR VE DEĞİŞKENLER ---
const scene = new THREE.Scene();
const container = document.getElementById('globe-container');
const width = window.innerWidth;
const height = window.innerHeight;
const EARTH_RADIUS = 5;
let isUserInteracting = false; 
let earth; 

// --- KAMERA VE RENDERER KURULUMU ---
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
container.appendChild(renderer.domElement);

// --- IŞIKLANDIRMA (Gündüz/Gece Efekti İçin) ---
const sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
sunlight.position.set(1, 0, 0); 
scene.add(sunlight);
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
scene.add(ambientLight);

// --- KONTROLLER (OrbitControls) ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Kullanıcı etkileşimini yönetme (Dönüşü durdur/başlat)
controls.addEventListener('start', () => {
    isUserInteracting = true;
});
controls.addEventListener('end', () => {
    setTimeout(() => {
        isUserInteracting = false;
    }, 1000); 
});

// --- DÜNYA KÜRESİ OLUŞTURMA (Shader ile) ---
function createEarth() {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const loader = new THREE.TextureLoader();
    
    // Dokuların düzgün yüklendiğinden emin olun (Yerel Sunucu Gerekir!)
    const dayTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    const nightTexture = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            dayTexture: { value: dayTexture },
            nightTexture: { value: nightTexture },
            lightDirection: { value: new THREE.Vector3(1, 0, 0).normalize() } 
        },
        vertexShader: `
            varying vec2 vUv;
            varying float intensity;
            uniform vec3 lightDirection;
            void main() {
                vUv = uv;
                intensity = dot(normalize(normal), lightDirection);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            varying vec2 vUv;
            varying float intensity;
            void main() {
                vec4 dayColor = texture2D(dayTexture, vUv);
                vec4 nightColor = texture2D(nightTexture, vUv);
                
                float darkness = 1.0 - smoothstep(-0.2, 0.2, intensity);
                float dayLight = 1.0 - darkness;
                
                vec4 finalColor = mix(dayColor, nightColor, darkness * 0.8);
                
                gl_FragColor = finalColor * dayLight;
                gl_FragColor.a = 1.0;
            }
        `
    });
    
    const earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.rotation.order = "YXZ"; 
    scene.add(earthMesh);
    return earthMesh;
}

// --- DİNAMİK ROTASYON MANTIĞI (UTC'ye göre) ---

function getGMTRotationAngle() {
    const now = new Date();
    // UTC saatini al (Gündüz/Gece döngüsünün temelini oluşturur)
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    
    // Toplam 24 saate göre oranı bul (0.0 - 1.0)
    const totalHours = hours + (minutes / 60) + (seconds / 3600);
    const rotationRatio = totalHours / 24; 
    
    // Radyan cinsinden hedef açı
    const angle = rotationRatio * Math.PI * 2; 

    // Başlangıç ofseti: Harita dokusundaki 0 boylamının 00:00'da karanlık tarafta olmasını sağlar
    const textureOffset = THREE.MathUtils.degToRad(-90); 
    
    // Negatif değer, doğru coğrafi dönüş yönünü sağlar
    return -(angle + textureOffset); 
}

// --- ANİMASYON DÖNGÜSÜ ---
function animate() {
    requestAnimationFrame(animate);

    // Otomatik dönüş: Sadece kullanıcı kontrol etmiyorsa çalışır
    if (!isUserInteracting && earth) {
        const targetRotation = getGMTRotationAngle(); 
        
        // Yumuşak geçiş (Interpolation) ile hedef pozisyona kilitlen
        // Hata giderme: Fazla dönmeyi engellemek için açılar arasındaki farkı kullan.
        
        let delta = targetRotation - earth.rotation.y;
        
        // Açılar 360 derecede dönerken geçişi yumuşatmak için
        if (delta > Math.PI) delta -= (Math.PI * 2);
        if (delta < -Math.PI) delta += (Math.PI * 2);

        // Mevcut pozisyonu hedefe doğru taşı
        earth.rotation.y += delta * 0.05; 
    }

    controls.update(); 
    renderer.render(scene, camera);
}


// --- BAŞLATMA ---
function init() {
    earth = createEarth();
    animate();
}
init();

// --- YENİDEN BOYUTLAMA ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

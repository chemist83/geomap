// --- TEMEL AYARLAR VE DEĞİŞKENLER ---
const scene = new THREE.Scene();
const container = document.getElementById('globe-container');
const width = window.innerWidth;
const height = window.innerHeight;
const EARTH_RADIUS = 5;
let isUserInteracting = false; 
let earth; 

// Işık Yönü Vektörü (Shader'a gönderilen uniform)
const lightDirectionVector = new THREE.Vector3(1, 0, 0).normalize();

// --- KAMERA VE RENDERER KURULUMU ---
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
container.appendChild(renderer.domElement);

// --- IŞIKLANDIRMA ---
const sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
sunlight.position.set(2, 0, 0); 
scene.add(sunlight);
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
scene.add(ambientLight);

// --- KONTROLLER (OrbitControls) ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Kullanıcı etkileşimini yönetme
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
    
    // Harici dokular yükleniyor (Yerel sunucu gereklidir!)
    const dayTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    const nightTexture = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            dayTexture: { value: dayTexture },
            nightTexture: { value: nightTexture },
            lightDirection: { value: lightDirectionVector } 
        },
        vertexShader: `
            varying vec2 vUv;
            varying float intensity;
            uniform vec3 lightDirection;
            void main() {
                vUv = uv;
                // Işık Yönünü model matrisi ile çarp (Dünyanın kendi dönüşünü hesaba katmak için)
                vec3 transformedNormal = normalize(normalMatrix * normal);
                intensity = dot(transformedNormal, lightDirection);
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
    
    // Dünyanın başlangıç ofsetini sabitle (Haritayı ortalamak için)
    earthMesh.rotation.y = THREE.MathUtils.degToRad(-90); 
    
    scene.add(earthMesh);
    return earthMesh;
}

// --- UTC ROTASYON AÇISI HESAPLAMA (OFSET DÜZELTİLDİ) ---

function getGMTRotationAngle() {
    const now = new Date();
    
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    const milliseconds = now.getUTCMilliseconds();

    const totalHours = hours + (minutes / 60) + (seconds / 3600) + (milliseconds / 3600000);
    const rotationRatio = totalHours / 24; 
    
    const angle = rotationRatio * Math.PI * 2; 
    
    // **KRİTİK DÜZELTME:** Haritayı UTC saatine tam olarak hizalamak için gerekli ofset.
    // Bu değer (yaklaşık 120 derece), 0 boylamının 00:00 UTC'de tam karanlıkta olmasını sağlar.
    const HARITA_HIZALAMA_OFSETI = THREE.MathUtils.degToRad(120); 

    return angle + HARITA_HIZALAMA_OFSETI; 
}

// --- GÜNCEL SAAT LİSTESİ MANTIĞI (Aynı kalır) ---

const TIMEZONES = [
    { name: "İstanbul (Türkiye)", timezone: "Europe/Istanbul" },
    { name: "Londra (GMT)", timezone: "Europe/London" },
    { name: "New York (EST)", timezone: "America/New_York" },
    { name: "Şanghay (Pekin)", timezone: "Asia/Shanghai" },
    { name: "Los Angeles (PST)", timezone: "America/Los_Angeles" }
];

const timeListElement = document.getElementById('time-list');

function updateClockList() {
    let html = '';
    const options = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false 
    };
    
    TIMEZONES.forEach(city => {
        const formatter = new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: city.timezone });
        const timeString = formatter.format(new Date());
        
        html += `
            <div class="clock-item">
                <span>${city.name}:</span>
                <span class="clock-time">${timeString}</span>
            </div>
        `;
    });
    
    timeListElement.innerHTML = html;
}

// Saati her saniye güncelle
setInterval(updateClockList, 1000);

// --- ANİMASYON DÖNGÜSÜ (Işık Yönü Rotasyonu) ---
function animate() {
    requestAnimationFrame(animate);

    // Kilit Nokta: Otomatik dönüş ve Işık Senkronizasyonu
    if (earth) {
        controls.update(); 
        
        if (!isUserInteracting) {
            // Işık Yönünü UTC saatine göre döndür
            const targetLightAngle = getGMTRotationAngle(); 
            
            // Işık vektörünü Y ekseni etrafında döndür (Negatif açı, doğru dönüş yönü için)
            lightDirectionVector.x = Math.cos(-targetLightAngle);
            lightDirectionVector.z = Math.sin(-targetLightAngle);
            
            // Shader'a gönderilen vektörün güncellendiğini bildir
            earth.material.uniforms.lightDirection.value = lightDirectionVector;
        }
    }
    
    renderer.render(scene, camera);
}


// --- BAŞLATMA ---
function init() {
    earth = createEarth();
    updateClockList();
    animate();
}
init();

// --- YENİDEN BOYUTLAMA ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

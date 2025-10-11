// --- TEMEL AYARLAR ---
const scene = new THREE.Scene();
const container = document.getElementById('globe-container');
const width = window.innerWidth;
const height = window.innerHeight;
const EARTH_RADIUS = 5;

// --- KAMERA VE RENDERER KURULUMU ---
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
container.appendChild(renderer.domElement);

// CSS2DRenderer (HTML popup'ları için)
const CSSRenderer = new THREE.CSS2DRenderer();
CSSRenderer.setSize(width, height);
CSSRenderer.domElement.style.position = 'absolute';
CSSRenderer.domElement.style.top = '0px';
container.appendChild(CSSRenderer.domElement); 

// --- IŞIKLANDIRMA (Dinamik Aydınlatma için) ---
// Güneşi temsil eden ışık kaynağı, pozisyonu sabit kalır, dünya döner.
const sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
sunlight.position.set(1, 0, 0); // Güneş X ekseninde sabit
scene.add(sunlight);
// Ortam Işığı (Gece tarafının tamamen karanlık olmaması için)
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); 
scene.add(ambientLight);

// --- KONTROLLER ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- DÜNYA KÜRESİ OLUŞTURMA (Shader Malzemesi ile) ---
function createEarth() {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const loader = new THREE.TextureLoader();
    
    // Yüksek çözünürlüklü Gündüz ve Gece dokuları
    const dayTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    const nightTexture = loader.load('https://threejs.org/examples/textures/planets/earth_lights_2048.png');
    
    // Gündüz/Gece ayrımını ve gece şehir ışıklarını gösteren özel Shader
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
                // Işık açısını hesapla (Lambertian aydınlatma)
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
                
                // Aydınlık/Karanlık geçişini yumuşat (terminatör çizgisi)
                float darkness = 1.0 - smoothstep(-0.2, 0.2, intensity);
                float dayLight = 1.0 - darkness;
                
                // Gündüz ve Gece dokularını birleştir
                vec4 finalColor = mix(dayColor, nightColor, darkness * 0.8);
                
                // Final rengini aydınlık şiddeti ile çarp ve uygula
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

// --- MERİDYEN VE PARALELLERİ OLUŞTURMA (IZGARA) ---
function createGraticules() {
    const graticuleRadius = EARTH_RADIUS * 1.005;
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ffff,
        transparent: true, 
        opacity: 0.4 
    });

    // Paraleller (Enlem Çizgileri - 20 derecelik aralıklar)
    for (let lat = -80; lat <= 80; lat += 20) { 
        const latRad = THREE.MathUtils.degToRad(lat);
        const radiusAtLat = graticuleRadius * Math.cos(latRad);
        const y = graticuleRadius * Math.sin(latRad);

        const points = [];
        for (let lon = 0; lon <= 360; lon += 5) {
            const lonRad = THREE.MathUtils.degToRad(lon);
            const x = radiusAtLat * Math.cos(lonRad);
            const z = radiusAtLat * Math.sin(lonRad);
            points.push(new THREE.Vector3(x, y, z));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        scene.add(line);
    }

    // Meridyenler (Boylam Çizgileri - 30 derecelik aralıklar)
    for (let lon = 0; lon < 360; lon += 30) { 
        const points = [];
        const lonRad = THREE.MathUtils.degToRad(lon);

        for (let lat = -90; lat <= 90; lat += 2) {
            const latRad = THREE.MathUtils.degToRad(lat);
            const x = graticuleRadius * Math.cos(latRad) * Math.cos(lonRad);
            const y = graticuleRadius * Math.sin(latRad);
            const z = graticuleRadius * Math.cos(latRad) * Math.sin(lonRad);

            points.push(new THREE.Vector3(x, y, z));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial.clone());
        scene.add(line);
    }
}

// --- SAAT DİLİMİ VE ETKİLEŞİM SİSTEMİ ---
const TIMEZONE_MERIDIANS = [
    { name: "GMT (Londra)", lon: 0, timezone: "Europe/London" },
    { name: "Orta Avrupa (Paris)", lon: 15, timezone: "Europe/Paris" },
    { name: "Türkiye (İstanbul)", lon: 30, timezone: "Europe/Istanbul" },
    { name: "Dubai", lon: 60, timezone: "Asia/Dubai" },
    { name: "Yeni Delhi", lon: 75, timezone: "Asia/Kolkata" },
    { name: "Pekin", lon: 120, timezone: "Asia/Shanghai" },
    { name: "Tokyo", lon: 135, timezone: "Asia/Tokyo" },
    { name: "Sidney", lon: 150, timezone: "Australia/Sydney" },
    { name: "New York", lon: -75, timezone: "America/New_York" },
    { name: "Chicago", lon: -90, timezone: "America/Chicago" },
    { name: "Los Angeles", lon: -120, timezone: "America/Los_Angeles" },
    { name: "Rio de Janeiro", lon: -45, timezone: "America/Sao_Paulo" }
];

const clockMarkers = []; 
let activePopup = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function latLonToXYZ(lat, lon, radius) {
    const latRad = THREE.MathUtils.degToRad(lat);
    const lonRad = THREE.MathUtils.degToRad(lon);
    
    const x = radius * Math.cos(latRad) * Math.cos(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.sin(lonRad);
    
    return new THREE.Vector3(x, y, z);
}

function createClockMarkers() {
    const markerGroup = new THREE.Group();
    const markerSize = EARTH_RADIUS * 0.03;
    const markerGeometry = new THREE.SphereGeometry(markerSize, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    TIMEZONE_MERIDIANS.forEach(tz => {
        const position = latLonToXYZ(0, tz.lon, EARTH_RADIUS * 1.002);
        
        // 1. 3D Mesh Noktası
        const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial.clone());
        markerMesh.position.copy(position);
        markerMesh.userData = { 
            name: tz.name, 
            timezone: tz.timezone, 
            isMarker: true,
            htmlElement: null 
        };
        markerGroup.add(markerMesh);
        clockMarkers.push(markerMesh);

        // 2. HTML Popup (CSS2DObject)
        const popupDiv = document.createElement('div');
        popupDiv.className = 'clock-popup';
        popupDiv.innerHTML = `
            <div class="name">${tz.name}</div>
            <div class="time-display" id="time-${tz.timezone.replace('/', '-')}">--:--:--</div>
        `;
        popupDiv.style.display = 'none';

        const label = new THREE.CSS2DObject(popupDiv);
        label.position.copy(position);
        label.position.add(new THREE.Vector3(0, markerSize * 4, 0));
        
        markerMesh.userData.htmlElement = popupDiv;
        markerGroup.add(label);
    });

    scene.add(markerGroup);
}

function updateTime(timezone) {
    const options = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false, 
        timeZone: timezone 
    };
    const formatter = new Intl.DateTimeFormat('tr-TR', options);
    const timeString = formatter.format(new Date());
    
    const timeElement = document.getElementById(`time-${timezone.replace('/', '-')}`);
    if (timeElement) {
        timeElement.textContent = timeString;
    }
}

function updateAllVisibleTimes() {
    if (activePopup) {
        const markerData = TIMEZONE_MERIDIANS.find(tz => {
            const id = `time-${tz.timezone.replace('/', '-')}`;
            return activePopup.querySelector(`#${id}`) !== null;
        });
        if (markerData) {
             updateTime(markerData.timezone);
        }
    }
}
setInterval(updateAllVisibleTimes, 1000);

function onMarkerClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clockMarkers);

    if (intersects.length > 0) {
        const marker = intersects[0].object;
        const popup = marker.userData.htmlElement;

        if (activePopup && activePopup !== popup) {
            activePopup.style.display = 'none';
        }

        if (popup.style.display === 'none') {
            popup.style.display = 'block';
            activePopup = popup;
            updateTime(marker.userData.timezone);
        } else {
            popup.style.display = 'none';
            activePopup = null;
        }
    } else {
        if (activePopup) {
            activePopup.style.display = 'none';
            activePopup = null;
        }
    }
}
window.addEventListener('click', onMarkerClick, false);

// --- DİNAMİK ROTASYON MANTIĞI ---

function getGMTRotationAngle() {
    const now = new Date();
    
    // UTC saatini al
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    
    const totalHours = hours + (minutes / 60) + (seconds / 3600);
    
    // Toplam dönüş açısı (Radyan)
    const angle = (totalHours / 24) * Math.PI * 2; 

    // Three.js dokusunun başlangıç pozisyonunu Güneş'e göre ayarlamak için ofset (yaklaşık -90 derece)
    // Bu, 0 boylamının (GMT) 00:00'da karanlık tarafta (Güneş'in tam karşısında) olmasını sağlar.
    const textureOffset = THREE.MathUtils.degToRad(-90); 
    
    return angle + textureOffset; 
}

// --- ANİMASYON DÖNGÜSÜ ---
function animate() {
    requestAnimationFrame(animate);

    // DÜNYA, GÜNCEL UTC SAATİNE GÖRE DÖNÜYOR
    const currentRotation = getGMTRotationAngle();
    earth.rotation.y = -currentRotation; 

    controls.update(); 
    renderer.render(scene, camera);
    CSSRenderer.render(scene, camera);
}


// --- BAŞLATMA VE BOYUTLAMA ---
const earth = createEarth();
createGraticules();
createClockMarkers();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    CSSRenderer.setSize(window.innerWidth, window.innerHeight);
});

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

// --- IŞIKLANDIRMA ---
const ambientLight = new THREE.AmbientLight(0x404040, 3);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 5, 10);
scene.add(directionalLight);

// --- KONTROLLER ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- DÜNYA KÜRESİ OLUŞTURMA ---
function createEarth() {
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const loader = new THREE.TextureLoader();
    
    // Yüksek çözünürlüklü doku kullanılır
    const earthTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    
    const material = new THREE.MeshPhongMaterial({
        map: earthTexture,
        shininess: 5,
    });
    
    const earthMesh = new THREE.Mesh(geometry, material);
    scene.add(earthMesh);
    return earthMesh;
}

// --- MERİDYEN VE PARALELLERİ OLUŞTURMA (IZGARA) ---
function createGraticules() {
    const graticuleRadius = EARTH_RADIUS * 1.005; // Küreden biraz dışarıda
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ffff, // Turkuaz
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
            // Küresel -> Kartezyen (X-Z düzlemi Ekvator, Y ekseni Kutup)
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

const clockMarkers = []; // Raycasting için noktaları tutar
let activePopup = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Küresel koordinatları Kartezyen koordinatlara çevirir
function latLonToXYZ(lat, lon, radius) {
    const latRad = THREE.MathUtils.degToRad(lat);
    const lonRad = THREE.MathUtils.degToRad(lon);
    
    const x = radius * Math.cos(latRad) * Math.cos(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.sin(lonRad);
    
    return new THREE.Vector3(x, y, z);
}

// Saat noktalarını (mesh) ve HTML popup'ları (CSS2DObject) oluşturur
function createClockMarkers() {
    const markerGroup = new THREE.Group();
    const markerSize = EARTH_RADIUS * 0.03;
    const markerGeometry = new THREE.SphereGeometry(markerSize, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Kırmızı nokta

    TIMEZONE_MERIDIANS.forEach(tz => {
        // Noktayı Ekvator (0 Enlem) üzerine yerleştir
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
        
        // Popup'ı noktanın biraz üzerine konumlandır
        label.position.add(new THREE.Vector3(0, markerSize * 4, 0));
        
        markerMesh.userData.htmlElement = popupDiv;
        
        markerGroup.add(label);
    });

    scene.add(markerGroup);
}

// Belirtilen saat dilimindeki güncel saati günceller
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

// Açık olan tüm popup'ların saatlerini her saniye günceller
function updateAllVisibleTimes() {
    // Sadece aktif (görünür) popup'ları güncelleyerek performansı koruruz
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

// Tıklama olayını işler (Raycasting)
function onMarkerClick(event) {
    // 1. Fare pozisyonunu normalize et (-1'den 1'e)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // 2. Raycaster'ı güncelle
    raycaster.setFromCamera(mouse, camera);

    // 3. Çarpan nesneleri bul
    const intersects = raycaster.intersectObjects(clockMarkers);

    if (intersects.length > 0) {
        const marker = intersects[0].object;
        const popup = marker.userData.htmlElement;

        // Daha önce açık olan popup'ı kapat
        if (activePopup && activePopup !== popup) {
            activePopup.style.display = 'none';
        }

        // Tıklanan popup'ı aç/kapat
        if (popup.style.display === 'none') {
            popup.style.display = 'block';
            activePopup = popup;
            updateTime(marker.userData.timezone); // Saati ilk kez ve hemen güncelle
        } else {
            popup.style.display = 'none';
            activePopup = null;
        }
    } else {
        // Hiçbir yere tıklanmadıysa, açık olanı kapat
        if (activePopup) {
            activePopup.style.display = 'none';
            activePopup = null;
        }
    }
}
window.addEventListener('click', onMarkerClick, false);


// --- ANİMASYON DÖNGÜSÜ ---
function animate() {
    requestAnimationFrame(animate);

    // Küreyi yavaşça döndürme
    earth.rotation.y += 0.001;

    controls.update(); 
    renderer.render(scene, camera);
    CSSRenderer.render(scene, camera); // HTML popup'larını da render et!
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

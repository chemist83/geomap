// Temel Ayarlar
const scene = new THREE.Scene();
const container = document.getElementById('globe-container');
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Kamera ve Renderer Kurulumu
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 10; // Küreyi net görmek için geriye çekiyoruz

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
container.appendChild(renderer.domElement);

// Işık Ekleme
const ambientLight = new THREE.AmbientLight(0x404040, 3); // Genel ışık
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// Kontrolleri Ekleme (Fare ile döndürme ve yakınlaştırma için)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.minDistance = 6;
controls.maxDistance = 15;
controls.enableDamping = true; // Daha akıcı hareket
controls.dampingFactor = 0.05;

const EARTH_RADIUS = 5;

// 2. Dünya Küresi Oluşturma
function createEarth() {
    // Küre geometrisi (yarıçap, segment sayısı)
    const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);

    // Dünya dokusu (Kendi doku dosyanızı eklemelisiniz!)
    // Örnek doku: 'textures/earth_map.jpg' gibi
    const loader = new THREE.TextureLoader();
    const earthTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    
    // Malzeme oluşturma
    const material = new THREE.MeshPhongMaterial({
        map: earthTexture,
        // İsteğe bağlı olarak parlaklık ve kabartma haritaları eklenebilir
        // specularMap: loader.load('textures/earth_spec.jpg'),
        // bumpMap: loader.load('textures/earth_bump.jpg'),
        // bumpScale: 0.05
    });
    
    const earthMesh = new THREE.Mesh(geometry, material);
    scene.add(earthMesh);
    return earthMesh;
}

// 3. Meridyenler ve Paralelleri Oluşturma (Izgara)
function createGraticules() {
    // Çizgilerin küreden biraz dışarıda olması için yarıçapı artırıyoruz
    const graticuleRadius = EARTH_RADIUS * 1.005; 
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ffff, // Meridyen/Paralel rengi (Turkuaz)
        transparent: true, 
        opacity: 0.5 
    });

    // --- Paraleller (Enlem Çizgileri) ---
    for (let lat = -80; lat <= 80; lat += 20) { // 20 derecelik aralıklarla
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

    // --- Meridyenler (Boylam Çizgileri) ---
    for (let lon = 0; lon < 360; lon += 30) { // 30 derecelik aralıklarla
        const points = [];
        const lonRad = THREE.MathUtils.degToRad(lon);

        for (let lat = -90; lat <= 90; lat += 2) {
            const latRad = THREE.MathUtils.degToRad(lat);

            // Küresel -> Kartezyen koordinat formülü
            const x = graticuleRadius * Math.cos(latRad) * Math.cos(lonRad);
            const y = graticuleRadius * Math.sin(latRad);
            const z = graticuleRadius * Math.cos(latRad) * Math.sin(lonRad);

            points.push(new THREE.Vector3(x, y, z));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        scene.add(line);
    }
}

// 4. Animasyon Döngüsü
function animate() {
    requestAnimationFrame(animate);

    // Küreyi yavaşça döndürelim (isteğe bağlı)
    earth.rotation.y += 0.001;

    controls.update(); // OrbitControls güncellemesi
    renderer.render(scene, camera);
}

// Başlatma
const earth = createEarth();
createGraticules();
animate();

// Pencere Boyutu Değiştiğinde Yeniden Boyutlandırma
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══════════════════════════════════════════════════════════════════════════
//  KURS — Astronauta 3D interactivo (Three.js, todo auto-alojado por la CSP)
//  • Flota y gira solo cuando está en reposo.
//  • Se puede arrastrar para girarlo (OrbitControls, solo rotación).
//  • Tiene "pensamientos" que aparecen solos y al tocarlo.
//  • Se pausa cuando no está en pantalla o la pestaña está oculta (batería).
//  • Si WebGL falla o el modelo no carga, se queda el logo de respaldo.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const MODELO_URL = '/images/Astronauta%20v1.glb';

// Frases que "piensa" el astronauta (aparecen solas y al tocarlo)
const PENSAMIENTOS = [
  '¿Sabías que tu web puede estar lista en 24 h? 🚀',
  'Psst… hay 7 días gratis para nuevos. 🎁',
  '¿Te ayudo a despegar tu negocio? 🛸',
  'Explorando el futuro digital… 🌌',
  'Yape, Plin o transferencia: tú eliges. 💳',
  'Una web bonita vende más. ✨',
  '¿Vamos a marcar tu rumbo? 🧭',
  'Hecho en Perú, para el mundo. 🇵🇪',
  '¿Tienes una idea? Cuéntamela. 💡',
  'Pago único, sin mensualidades. 😎'
];

const mount = document.getElementById('astronauta-3d');
if (mount) arrancar(mount);

function soportaWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function arrancar(mount) {
  if (!soportaWebGL()) return;   // se queda el fallback (logo)

  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ancho = mount.clientWidth || 360;
  let alto  = mount.clientHeight || 360;

  const escena = new THREE.Scene();

  const camara = new THREE.PerspectiveCamera(38, ancho / alto, 0.1, 100);
  camara.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.classList.add('astronauta-canvas');
  mount.appendChild(renderer.domElement);

  // Entorno para que el material de vidrio/volumen del casco se vea bien
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Luces
  const amb = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
  escena.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  escena.add(key);
  const rim = new THREE.DirectionalLight(0x99aaff, 1.2);
  rim.position.set(-4, 2, -3);
  escena.add(rim);

  // Grupo contenedor: aplicamos el "flotar" aquí sin pelear con los controles
  const grupo = new THREE.Group();
  escena.add(grupo);

  // Controles: solo rotar (sin zoom ni desplazamiento)
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableZoom = false;
  controles.enablePan = false;
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.rotateSpeed = 0.7;
  controles.autoRotate = !reduce;
  controles.autoRotateSpeed = 1.1;
  controles.minPolarAngle = Math.PI * 0.28;
  controles.maxPolarAngle = Math.PI * 0.72;

  // Al interactuar, se detiene el giro automático y se reanuda tras un rato
  let reanudar = null;
  controles.addEventListener('start', function () {
    controles.autoRotate = false;
    mount.classList.add('astronauta-agarrando');
    if (reanudar) clearTimeout(reanudar);
  });
  controles.addEventListener('end', function () {
    mount.classList.remove('astronauta-agarrando');
    if (reduce) return;
    if (reanudar) clearTimeout(reanudar);
    reanudar = setTimeout(function () { controles.autoRotate = true; }, 2500);
  });

  // Estado de carga
  mount.classList.add('astronauta-cargando');

  const loader = new GLTFLoader();
  loader.load(MODELO_URL, function (gltf) {
    const modelo = gltf.scene;

    // Centrar y escalar el modelo a un tamaño estándar
    const caja = new THREE.Box3().setFromObject(modelo);
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    const escala = 3.2 / Math.max(tam.x, tam.y, tam.z);
    modelo.scale.setScalar(escala);
    modelo.position.sub(centro.multiplyScalar(escala));

    grupo.add(modelo);
    controles.target.set(0, 0, 0);
    controles.update();

    mount.classList.remove('astronauta-cargando');
    mount.classList.add('astronauta-listo');   // oculta el fallback via CSS

    prepararInteraccion(mount, renderer.domElement);
    bucle();
    setTimeout(function () { pensar(mount, '¡Arrástrame para girarme! 👆', 4200); }, 1400);
    programarPensamientos(mount);
  },
  undefined,
  function (err) {
    console.error('astronauta: no se pudo cargar el modelo', err);
    mount.classList.remove('astronauta-cargando');
    // se queda visible el fallback (logo)
  });

  // ── Animación (flotar + giro) ──
  const reloj = new THREE.Clock();
  let visible = true, activo = true, rafId = null;

  function bucle() {
    rafId = requestAnimationFrame(bucle);
    if (!visible || !activo) return;
    const t = reloj.getElapsedTime();
    if (!reduce) {
      grupo.position.y = Math.sin(t * 1.1) * 0.12;      // flotar arriba/abajo
      grupo.rotation.z = Math.sin(t * 0.6) * 0.03;      // balanceo sutil
    }
    controles.update();
    renderer.render(escena, camara);
  }

  // ── Pausar cuando no se ve o la pestaña está oculta (batería) ──
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) {
      visible = ents[0].isIntersecting;
    }, { threshold: 0.05 }).observe(mount);
  }
  document.addEventListener('visibilitychange', function () {
    activo = !document.hidden;
  });

  // ── Redimensionar ──
  function ajustar() {
    ancho = mount.clientWidth || ancho;
    alto = mount.clientHeight || alto;
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    renderer.setSize(ancho, alto);
  }
  if ('ResizeObserver' in window) new ResizeObserver(ajustar).observe(mount);
  else window.addEventListener('resize', ajustar);

  // Liberar contexto WebGL si la página se descarta
  window.addEventListener('pagehide', function () {
    if (rafId) cancelAnimationFrame(rafId);
    renderer.dispose();
  });
}

// Distingue un "toque" (mostrar pensamiento) de un "arrastre" (rotar)
function prepararInteraccion(mount, canvas) {
  let x0 = 0, y0 = 0, movido = false;
  canvas.addEventListener('pointerdown', function (e) {
    x0 = e.clientX; y0 = e.clientY; movido = false;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (Math.abs(e.clientX - x0) > 6 || Math.abs(e.clientY - y0) > 6) movido = true;
  });
  canvas.addEventListener('pointerup', function () {
    if (!movido) pensar(mount, PENSAMIENTOS[Math.floor(Math.random() * PENSAMIENTOS.length)], 3600);
  });
}

// Pensamientos automáticos cada cierto tiempo, solo si el astronauta se ve
function programarPensamientos(mount) {
  function siguiente() {
    const espera = 7000 + Math.random() * 6000;
    setTimeout(function () {
      if (!document.hidden && enPantalla(mount)) {
        pensar(mount, PENSAMIENTOS[Math.floor(Math.random() * PENSAMIENTOS.length)], 3400);
      }
      siguiente();
    }, espera);
  }
  siguiente();
}

function enPantalla(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < (window.innerHeight || 0);
}

let burbujaTimer = null;
function pensar(mount, texto, ms) {
  let b = mount.querySelector('.astro-thought');
  if (!b) {
    b = document.createElement('div');
    b.className = 'astro-thought';
    mount.appendChild(b);
  }
  b.textContent = texto;
  // reinicia la animación de entrada
  b.classList.remove('visible');
  void b.offsetWidth;
  b.classList.add('visible');
  if (burbujaTimer) clearTimeout(burbujaTimer);
  burbujaTimer = setTimeout(function () { b.classList.remove('visible'); }, ms || 3400);
}

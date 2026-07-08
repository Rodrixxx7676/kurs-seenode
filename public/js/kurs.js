// ═══════════════════════════════════════════════════════════════════════════
//  KURS — Lógica de frontend (port de los componentes Blazor a JS vanilla)
//  Cada bloque se activa solo si la página contiene sus elementos.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Estrellas de fondo (port de StarField.razor, misma aritmética) ────────
  const starsLayer = document.querySelector('.stars-layer');
  if (starsLayer) {
    const count = 260;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const top   = (i * 37.3 + 11.7) % 100;
      const left  = (i * 61.7 + 5.3)  % 100;
      const size  = 0.8 + (i % 8) * 0.22;
      const delay = (i * 0.19) % 7;
      const dur   = 3 + (i % 6);

      const star = document.createElement('span');
      star.className = 'star';
      star.style.cssText =
        'top:' + top.toFixed(2) + '%;left:' + left.toFixed(2) + '%;' +
        'width:' + size.toFixed(2) + 'px;height:' + size.toFixed(2) + 'px;' +
        'animation-delay:' + delay.toFixed(2) + 's;animation-duration:' + dur.toFixed(0) + 's';
      frag.appendChild(star);
    }
    starsLayer.appendChild(frag);
  }

  // ── Año dinámico del footer ────────────────────────────────────────────────
  document.querySelectorAll('.footer-year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // ── Registro de actividad (para expirar sesión por inactividad) ──────────
  const ACTIVIDAD_KEY = 'kurs_actividad';
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (e) {
    document.addEventListener(e, function () {
      localStorage.setItem(ACTIVIDAD_KEY, Date.now().toString());
    }, { passive: true });
  });

  // ── Banner de cookies (port de CookieBanner) ──────────────────────────────
  const cookieBanner = document.getElementById('cookieBanner');
  if (cookieBanner && !localStorage.getItem('kurs_cookies')) {
    cookieBanner.style.display = '';
    setTimeout(function () { cookieBanner.classList.add('show'); }, 800);

    function decidir(valor) {
      localStorage.setItem('kurs_cookies', valor);
      cookieBanner.classList.remove('show');
      setTimeout(function () { cookieBanner.style.display = 'none'; }, 450);
    }
    document.getElementById('cookieAccept').addEventListener('click', function () { decidir('accepted'); });
    document.getElementById('cookieReject').addEventListener('click', function () { decidir('rejected'); });
  }

  // ── Contadores animados (port del timer de PagePrincipal.cs) ─────────────
  const statNumbers = document.querySelectorAll('.stat-number[data-target]');
  if (statNumbers.length) {
    const TOTAL_STEPS = 80, FRAME_MS = 18, START_DELAY = 600;
    let step = 0;
    setTimeout(function () {
      const timer = setInterval(function () {
        step++;
        const t = step / TOTAL_STEPS;
        const ease = 1 - Math.pow(1 - t, 3);   // ease-out cúbico
        statNumbers.forEach(function (el) {
          el.textContent = Math.floor(parseInt(el.dataset.target, 10) * ease);
        });
        if (step >= TOTAL_STEPS) clearInterval(timer);
      }, FRAME_MS);
    }, START_DELAY);
  }

  // ── Mostrar/ocultar contraseña ────────────────────────────────────────────
  document.querySelectorAll('.toggle-pw').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const input = btn.parentElement.querySelector('input');
      const icon  = btn.querySelector('i');
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      icon.className = visible ? 'ti ti-eye' : 'ti ti-eye-off';
    });
  });

  // ── Helpers comunes ───────────────────────────────────────────────────────
  const $ = function (id) { return document.getElementById(id); };
  const emailValido = function (v) { return v.includes('@') && v.includes('.'); };

  // Enviar con Enter: cualquier input dentro del contenedor dispara el botón
  function enviarConEnter(contenedor, btn) {
    contenedor.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
      });
    });
  }

  // ── Sesión de usuario (mismas reglas que AuthService: expiración + 30 min inactividad) ──
  function sesionActiva() {
    const token = localStorage.getItem('kurs_token');
    if (!token) return null;

    const expira = localStorage.getItem('kurs_expira');
    if (expira && Date.now() >= Date.parse(expira)) { cerrarSesion(false); return null; }

    const act = parseInt(localStorage.getItem('kurs_actividad') || '0', 10);
    if (act && Date.now() - act > 30 * 60_000) { cerrarSesion(false); return null; }

    try { return JSON.parse(localStorage.getItem('kurs_user')); } catch { return null; }
  }

  function cerrarSesion(recargar) {
    ['kurs_token', 'kurs_user', 'kurs_expira', 'kurs_actividad'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    if (recargar) window.location.href = '/';
  }

  // Navbar según sesión: saluda al usuario y ofrece cerrar sesión
  const navAuth = document.querySelector('.nav-auth');
  if (navAuth) {
    const usuario = sesionActiva();
    if (usuario && usuario.nombre) {
      const primerNombre = usuario.nombre.split(' ')[0];
      navAuth.innerHTML =
        '<span class="nav-user"><i class="ti ti-user-circle"></i><span>' + primerNombre + '</span></span>' +
        '<a href="#" class="btn-login" id="logoutBtn"><i class="ti ti-logout"></i> Cerrar sesión</a>';
      document.getElementById('logoutBtn').addEventListener('click', function (e) {
        e.preventDefault();
        cerrarSesion(true);
      });
    }
  }

  // ── Menú móvil (hamburguesa) ──────────────────────────────────────────────
  const navbar = document.querySelector('.navbar');
  if (navbar && navbar.querySelector('.nav-links')) {
    const toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Abrir menú');
    toggle.innerHTML = '<i class="ti ti-menu-2"></i>';
    toggle.addEventListener('click', function () {
      const abierto = navbar.classList.toggle('open');
      toggle.innerHTML = abierto ? '<i class="ti ti-x"></i>' : '<i class="ti ti-menu-2"></i>';
    });
    (navAuth || navbar).appendChild(toggle);
  }

  // ── Fondo del navbar al hacer scroll (el CSS .navbar.scrolled ya existía) ──
  if (navbar) {
    const alScroll = function () {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    };
    document.addEventListener('scroll', alScroll, { passive: true });
    alScroll();
  }

  function setCargando(btn, cargando, textoCarga, htmlNormal) {
    btn.disabled = cargando;
    btn.innerHTML = cargando
      ? '<i class="ti ti-loader-2 spin"></i><span>' + textoCarga + '</span>'
      : htmlNormal;
  }

  // ═════════════ LOGIN (port de Login.cs + AuthService) ═════════════
  const loginBtn = $('loginBtn');
  if (loginBtn) {
    const htmlNormal = loginBtn.innerHTML;
    loginBtn.addEventListener('click', async function () {
      const error = $('loginError');
      error.style.display = 'none';

      const email = $('email').value.trim();
      const password = $('password').value;

      if (!email || !emailValido(email)) {
        error.textContent = 'Ingresa un correo electrónico válido.';
        error.style.display = ''; return;
      }
      if (!password || password.length < 6) {
        error.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        error.style.display = ''; return;
      }

      setCargando(loginBtn, true, 'Ingresando...', htmlNormal);
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        });

        if (resp.ok) {
          const data = await resp.json();
          localStorage.setItem('kurs_token', data.token);
          localStorage.setItem('kurs_expira', data.expira);
          localStorage.setItem('kurs_user',
            JSON.stringify({ nombre: data.nombre, email: data.email, nivel: data.nivel }));
          window.location.href = '/';
          return;
        }

        if (resp.status === 401) {
          error.textContent = 'Correo o contraseña incorrectos.';
        } else if (resp.status === 429) {
          const data = await resp.json().catch(function () { return {}; });
          error.textContent = data.mensaje || 'Demasiados intentos. Espera un momento.';
        } else {
          error.textContent = 'Error al iniciar sesión. Inténtalo de nuevo.';
        }
        error.style.display = '';
      } catch {
        error.textContent = 'No se pudo conectar con el servidor.';
        error.style.display = '';
      } finally {
        setCargando(loginBtn, false, '', htmlNormal);
      }
    });
    enviarConEnter(document.querySelector('.login-fields'), loginBtn);
  }

  // ═════════════ REGISTRO (port de Registro.cs) ═════════════
  const registroBtn = $('registroBtn');
  if (registroBtn) {
    const htmlNormal = registroBtn.innerHTML;
    const pw = $('password');
    const reglas = $('pwRules');

    // Reglas de contraseña en vivo (igual que el Razor)
    const tieneMayuscula = function (v) { return /[A-Z]/.test(v); };
    const tieneNumero    = function (v) { return /\d/.test(v); };
    const tieneEspecial  = function (v) { return /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(v); };
    const pwSegura = function (v) {
      return v.length >= 7 && tieneMayuscula(v) && tieneNumero(v) && tieneEspecial(v);
    };

    pw.addEventListener('input', function () {
      const v = pw.value;
      reglas.style.display = v ? '' : 'none';
      [['ruleLen', v.length >= 7], ['ruleMayus', tieneMayuscula(v)],
       ['ruleNum', tieneNumero(v)], ['ruleEsp', tieneEspecial(v)]].forEach(function (par) {
        const el = $(par[0]);
        el.className = 'pw-rule ' + (par[1] ? 'ok' : 'fail');
        el.querySelector('i').className = 'ti ' + (par[1] ? 'ti-circle-check' : 'ti-circle-x');
      });
    });

    registroBtn.addEventListener('click', async function () {
      const error = $('registroError');
      error.style.display = 'none';

      const nombre = $('nombre').value.trim();
      const empresa = $('empresa').value.trim();
      const email = $('email').value.trim();
      const password = pw.value;
      const confirm = $('confirm').value;

      if (!nombre) { error.textContent = 'Ingresa tu nombre completo.'; error.style.display = ''; return; }
      if (!email || !emailValido(email)) {
        error.textContent = 'Ingresa un correo electrónico válido.'; error.style.display = ''; return;
      }
      if (!pwSegura(password)) {
        error.textContent = 'La contraseña debe tener mínimo 7 caracteres, una mayúscula, un número y un carácter especial.';
        error.style.display = ''; return;
      }
      if (password !== confirm) {
        error.textContent = 'Las contraseñas no coinciden.'; error.style.display = ''; return;
      }

      setCargando(registroBtn, true, 'Creando cuenta...', htmlNormal);
      try {
        const resp = await fetch('/api/auth/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre, email: email, password: password, empresa: empresa || null })
        });

        if (resp.ok) {
          registroBtn.style.display = 'none';
          $('registroOk').style.display = '';
          setTimeout(function () { window.location.href = '/login'; }, 1500);
          return;
        }

        error.textContent = resp.status === 409
          ? 'Ya existe una cuenta con ese correo.'
          : 'Error al crear la cuenta. Inténtalo de nuevo.';
        error.style.display = '';
      } catch {
        error.textContent = 'No se pudo conectar con el servidor.';
        error.style.display = '';
      } finally {
        if (registroBtn.style.display !== 'none') setCargando(registroBtn, false, '', htmlNormal);
      }
    });
    enviarConEnter(document.querySelector('.login-fields'), registroBtn);
  }

  // ═════════════ CONTACTO (port de Contacto.cs) ═════════════
  const contactoBtn = $('contactoBtn');
  if (contactoBtn) {
    const htmlNormal = contactoBtn.innerHTML;
    contactoBtn.addEventListener('click', async function () {
      const error = $('contactoError');
      error.style.display = 'none';

      const nombre = $('nombre').value.trim();
      const email = $('email').value.trim();
      const asunto = $('asunto').value.trim();
      const mensaje = $('mensaje').value.trim();

      if (!nombre || !email || !asunto || !mensaje) {
        error.textContent = 'Por favor completa todos los campos antes de enviar.';
        error.style.display = ''; return;
      }
      if (!emailValido(email)) {
        error.textContent = 'Ingresa un correo electrónico válido.';
        error.style.display = ''; return;
      }

      setCargando(contactoBtn, true, 'Enviando...', htmlNormal);
      try {
        const resp = await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre, email: email, asunto: asunto, mensaje: mensaje })
        });

        if (resp.ok) {
          $('contactoForm').style.display = 'none';
          $('contactoOk').style.display = '';
        } else {
          error.textContent = 'Ocurrió un problema al enviar. Inténtalo de nuevo.';
          error.style.display = '';
        }
      } catch {
        error.textContent = 'No se pudo conectar con el servidor. Revisa tu conexión.';
        error.style.display = '';
      } finally {
        setCargando(contactoBtn, false, '', htmlNormal);
      }
    });
    enviarConEnter($('contactoForm'), contactoBtn);
  }

  // ═════════════ PROVEEDORES ═════════════
  // Guarda la solicitud vía POST /api/proveedores (tabla PROVEEDORES).
  const provBtn = $('provBtn');
  if (provBtn) {
    const htmlNormal = provBtn.innerHTML;
    provBtn.addEventListener('click', async function () {
      const error = $('provError');
      error.style.display = 'none';

      const razonSocial = $('razonSocial').value.trim();
      const ruc = $('ruc').value.trim();
      const representante = $('representante').value.trim();
      const email = $('provEmail').value.trim();
      const telefono = $('telefono').value.trim();
      const categoria = $('categoria').value;
      const descripcion = $('descripcion').value.trim();
      const web = $('web').value.trim();

      function fallo(msg) { error.textContent = msg; error.style.display = ''; }

      if (!razonSocial) return fallo('Ingresa la razón social.');
      if (ruc.length !== 11) return fallo('El RUC debe tener 11 dígitos.');
      if (!representante) return fallo('Ingresa el nombre del representante legal.');
      if (!email || !emailValido(email)) return fallo('Ingresa un correo corporativo válido.');
      if (!telefono) return fallo('Ingresa un teléfono de contacto.');
      if (!categoria) return fallo('Selecciona una categoría.');

      setCargando(provBtn, true, 'Enviando...', htmlNormal);
      try {
        const resp = await fetch('/api/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razonSocial: razonSocial, ruc: ruc, representante: representante,
            email: email, telefono: telefono, categoria: categoria,
            descripcion: descripcion, web: web
          })
        });

        if (resp.ok) {
          $('provForm').style.display = 'none';
          $('provOk').style.display = '';
        } else {
          const data = await resp.json().catch(function () { return {}; });
          fallo(data.mensaje || 'Ocurrió un problema al enviar. Inténtalo de nuevo.');
        }
      } catch {
        fallo('No se pudo conectar con el servidor. Inténtalo de nuevo.');
      } finally {
        setCargando(provBtn, false, '', htmlNormal);
      }
    });
    enviarConEnter($('provForm'), provBtn);
  }
})();

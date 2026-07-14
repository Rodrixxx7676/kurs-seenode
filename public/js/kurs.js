// ═══════════════════════════════════════════════════════════════════════════
//  KURS — Lógica de frontend (port de los componentes Blazor a JS vanilla)
//  Cada bloque se activa solo si la página contiene sus elementos.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Pantalla de carga ──────────────────────────────────────────────────────
  // Se oculta cuando la página terminó de cargar. El estado de error a los
  // 10 s vive en CSS puro (por si este archivo nunca llegara a ejecutarse).
  const splash = document.getElementById('cargaSplash');
  if (splash) {
    const ocultarSplash = function () {
      splash.classList.add('carga-oculta');
      setTimeout(function () { splash.remove(); }, 500);
    };
    if (document.readyState === 'complete') {
      ocultarSplash();
    } else {
      window.addEventListener('load', ocultarSplash);
      // red de seguridad: si un recurso externo (fuente, ícono) se demora,
      // no retener al usuario — el DOM ya está listo a esta altura
      setTimeout(ocultarSplash, 8000);
    }
  }

  // ── reCAPTCHA v3 ────────────────────────────────────────────────────────────
  // Carga el script de Google solo si hay clave configurada en el servidor.
  let recaptchaSiteKey = null;
  const recaptchaLista = fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      recaptchaSiteKey = cfg.recaptchaSiteKey || null;
      if (!recaptchaSiteKey) return;
      return new Promise(function (resolve) {
        const s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=' + recaptchaSiteKey;
        s.onload = resolve;
        s.onerror = function () { recaptchaSiteKey = null; resolve(); };
        document.head.appendChild(s);
      });
    })
    .catch(function () { recaptchaSiteKey = null; });

  // Devuelve el token para una acción, o null si reCAPTCHA no está activo.
  async function recaptchaToken(accion) {
    await recaptchaLista;
    if (!recaptchaSiteKey || !window.grecaptcha) return null;
    try {
      return await new Promise(function (resolve) {
        window.grecaptcha.ready(function () {
          window.grecaptcha.execute(recaptchaSiteKey, { action: accion })
            .then(resolve).catch(function () { resolve(null); });
        });
      });
    } catch { return null; }
  }

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

  // ── Contadores animados: arrancan cuando la sección entra en pantalla ─────
  const statNumbers = document.querySelectorAll('.stat-number[data-target]');
  if (statNumbers.length) {
    let animado = false;
    function animarContadores() {
      if (animado) return;
      animado = true;
      const TOTAL_STEPS = 80, FRAME_MS = 18;
      let step = 0;
      const timer = setInterval(function () {
        step++;
        const t = step / TOTAL_STEPS;
        const ease = 1 - Math.pow(1 - t, 3);   // ease-out cúbico
        statNumbers.forEach(function (el) {
          el.textContent = Math.floor(parseInt(el.dataset.target, 10) * ease);
        });
        if (step >= TOTAL_STEPS) clearInterval(timer);
      }, FRAME_MS);
    }

    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(function (entradas) {
        if (entradas.some(function (e) { return e.isIntersecting; })) {
          animarContadores();
          obs.disconnect();
        }
      }, { threshold: 0.3 });
      obs.observe(document.querySelector('.stats'));
    } else {
      setTimeout(animarContadores, 600);   // navegadores antiguos
    }
  }

  // ── Botón flotante de WhatsApp (en todo el sitio salvo el panel admin) ────
  if (!document.querySelector('.admin-wrap')) {
    const wsp = document.createElement('a');
    wsp.href = 'https://wa.me/51949238917?text=' +
      encodeURIComponent('¡Hola KURS! Quiero información sobre sus servicios.');
    wsp.className = 'wsp-flotante';
    wsp.target = '_blank';
    wsp.rel = 'noopener';
    wsp.setAttribute('aria-label', 'Escríbenos por WhatsApp');
    wsp.innerHTML = '<i class="ti ti-brand-whatsapp"></i>';
    document.body.appendChild(wsp);
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

  // ── Estados de carga y error para paneles de datos ────────────────────────
  function estadoCargando(el) {
    el.innerHTML = '<div class="datos-cargando"><span class="mini-spinner"></span> Cargando...</div>';
  }
  function estadoError(el, reintentar) {
    el.innerHTML = '<div class="datos-error"><i class="ti ti-plug-connected-x"></i>' +
      '<p>Ups, no pudimos cargar esta información.</p>' +
      '<button class="btn-send cuenta-btn-sm"><i class="ti ti-refresh"></i> Reintentar</button></div>';
    el.querySelector('button').addEventListener('click', reintentar);
  }

  // ── Sesión de usuario ────────────────────────────────────────────────────
  // El token vive en una cookie httpOnly (invisible para JavaScript);
  // localStorage solo guarda datos de UI: nombre, expiración y actividad.
  function sesionActiva() {
    const usuario = localStorage.getItem('kurs_user');
    if (!usuario) return null;

    const expira = localStorage.getItem('kurs_expira');
    if (expira && Date.now() >= Date.parse(expira)) { cerrarSesion(false); return null; }

    const act = parseInt(localStorage.getItem('kurs_actividad') || '0', 10);
    if (act && Date.now() - act > 30 * 60_000) { cerrarSesion(false); return null; }

    try { return JSON.parse(usuario); } catch { return null; }
  }

  function cerrarSesion(recargar) {
    // borra la cookie httpOnly en el servidor (fire-and-forget)
    fetch('/api/auth/logout', { method: 'POST' }).catch(function () {});
    ['kurs_token', 'kurs_user', 'kurs_expira', 'kurs_actividad', 'kurs_ultimo'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    if (recargar) window.location.href = '/';
  }

  function guardarSesion(data) {
    localStorage.setItem('kurs_expira', data.expira);
    localStorage.setItem('kurs_user',
      JSON.stringify({ nombre: data.nombre, email: data.email, nivel: data.nivel }));
    localStorage.setItem('kurs_actividad', Date.now().toString());
    if (data.ultimoAcceso) localStorage.setItem('kurs_ultimo', data.ultimoAcceso);
    else localStorage.removeItem('kurs_ultimo');
  }

  // Navbar según sesión: saluda al usuario, enlaza a "Mi cuenta" y ofrece cerrar sesión
  const navAuth = document.querySelector('.nav-auth');
  if (navAuth) {
    const usuario = sesionActiva();
    if (usuario && usuario.nombre) {
      const primerNombre = usuario.nombre.split(' ')[0];
      navAuth.innerHTML =
        '<a href="/cuenta" class="nav-user"><i class="ti ti-user-circle"></i><span>' + primerNombre + '</span></a>' +
        '<a href="#" class="btn-login" id="logoutBtn"><i class="ti ti-logout"></i> Cerrar sesión</a>';
      document.getElementById('logoutBtn').addEventListener('click', function (e) {
        e.preventDefault();
        cerrarSesion(true);
      });
      iniciarVigilanteInactividad();
    }
  }

  // ── Cierre automático por inactividad (30 min) con aviso 1 min antes ────────
  const INACTIVO_MS = 30 * 60_000;
  const AVISO_MS = 60_000;   // avisa 60 s antes de cerrar
  function iniciarVigilanteInactividad() {
    let avisoMostrado = false;
    let modal = null;

    function marcarActividad() {
      localStorage.setItem('kurs_actividad', Date.now().toString());
      if (avisoMostrado && modal) { modal.remove(); modal = null; avisoMostrado = false; }
    }
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (e) {
      document.addEventListener(e, marcarActividad, { passive: true });
    });

    setInterval(function () {
      const act = parseInt(localStorage.getItem('kurs_actividad') || '0', 10);
      if (!localStorage.getItem('kurs_user')) return;
      const inactivo = Date.now() - act;

      if (inactivo >= INACTIVO_MS) { cerrarSesion(true); return; }

      if (inactivo >= INACTIVO_MS - AVISO_MS && !avisoMostrado) {
        avisoMostrado = true;
        modal = document.createElement('div');
        modal.className = 'sesion-aviso glass-bubble';
        modal.innerHTML =
          '<i class="ti ti-clock-exclamation"></i>' +
          '<div><strong>¿Sigues ahí?</strong>' +
          '<p>Tu sesión se cerrará pronto por inactividad.</p></div>' +
          '<button class="glass-bubble-btn" id="seguirActivo">Seguir conectado</button>';
        document.body.appendChild(modal);
        document.getElementById('seguirActivo').addEventListener('click', marcarActividad);
      }
    }, 5_000);
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
          guardarSesion(data);
          window.location.href = '/cuenta';
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
        const captcha = await recaptchaToken('registro');
        const resp = await fetch('/api/auth/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre, email: email, password: password, empresa: empresa || null, recaptchaToken: captcha })
        });

        if (resp.ok) {
          registroBtn.style.display = 'none';
          $('registroOk').style.display = '';
          // Auto-login: el cliente entra directo a su panel sin reescribir credenciales
          try {
            const loginResp = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email, password: password })
            });
            if (loginResp.ok) {
              guardarSesion(await loginResp.json());
              setTimeout(function () { window.location.href = '/cuenta'; }, 1200);
              return;
            }
          } catch { /* si falla, cae al login manual */ }
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
        const captcha = await recaptchaToken('contacto');
        const resp = await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: nombre, email: email, asunto: asunto, mensaje: mensaje, recaptchaToken: captcha })
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
            descripcion: descripcion, web: web, recaptchaToken: await recaptchaToken('proveedores')
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

  // ═════════════ MI CUENTA (/cuenta) ═════════════
  // :not(.admin-wrap) → el panel de admin reutiliza clases pero tiene su propio bloque
  const cuentaWrap = document.querySelector('.cuenta-wrap:not(.admin-wrap)');
  if (cuentaWrap) {
    const usuario = sesionActiva();
    if (!usuario) { window.location.href = '/login'; return; }

    // fetch autenticado; si el token caducó (401) cierra sesión
    async function api(url, opciones) {
      opciones = opciones || {};
      opciones.headers = Object.assign(
        { 'Content-Type': 'application/json' },   // la sesión viaja en la cookie httpOnly
        opciones.headers || {});
      // máximo 10 s de espera: si el servidor no responde, se muestra el error
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        opciones.signal = AbortSignal.timeout(10_000);
      }
      const resp = await fetch(url, opciones);
      if (resp.status === 401) { cerrarSesion(true); throw new Error('sesión expirada'); }
      return resp;
    }

    // Enlace de administración solo si el nivel es 4
    if (parseInt(usuario.nivel, 10) >= 4 && $('tabAdmin')) $('tabAdmin').style.display = '';

    $('cuentaLogout').addEventListener('click', function (e) { e.preventDefault(); cerrarSesion(true); });

    // Pestañas
    document.querySelectorAll('.cuenta-tab[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.cuenta-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.cuenta-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        $('panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // ── Cargar perfil ──
    api('/api/cuenta').then(function (r) { return r.json(); }).then(function (c) {
      $('cuentaNombre').textContent = c.nombre;
      $('cuentaEmail').textContent = c.email + (c.empresa ? ' · ' + c.empresa : '');
      $('perfNombre').value = c.nombre || '';
      $('perfEmpresa').value = c.empresa || '';
      $('perfTelefono').value = c.telefono || '';
      $('perfEmail').value = c.email || '';

      // Avatar con iniciales del nombre
      const iniciales = c.nombre.trim().split(/\s+/).slice(0, 2)
        .map(function (p) { return p[0]; }).join('').toUpperCase();
      document.querySelector('.cuenta-avatar').innerHTML = '<span>' + iniciales + '</span>';

      // Cliente desde + último acceso (seguridad visible para el usuario)
      const desde = new Date(c.fechaRegistro).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      const ultimo = localStorage.getItem('kurs_ultimo');
      $('cuentaMeta').textContent = 'Cliente desde ' + desde +
        (ultimo ? ' · Último acceso: ' + new Date(ultimo).toLocaleString('es-PE',
          { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
    }).catch(function () {});

    // ── Guardar perfil ──
    const guardarBtn = $('guardarPerfil');
    const guardarHtml = guardarBtn.innerHTML;
    guardarBtn.addEventListener('click', async function () {
      const err = $('perfilError'), ok = $('perfilOk');
      err.style.display = 'none'; ok.style.display = 'none';
      const nombre = $('perfNombre').value.trim();
      if (!nombre) { err.textContent = 'El nombre es obligatorio.'; err.style.display = ''; return; }

      setCargando(guardarBtn, true, 'Guardando...', guardarHtml);
      try {
        const resp = await api('/api/cuenta', {
          method: 'PUT',
          body: JSON.stringify({
            nombre: nombre,
            empresa: $('perfEmpresa').value.trim(),
            telefono: $('perfTelefono').value.trim()
          })
        });
        const data = await resp.json();
        if (resp.ok) {
          ok.querySelector('span').textContent = data.mensaje;
          ok.style.display = '';
          $('cuentaNombre').textContent = nombre;
          // refleja el nuevo nombre en el saludo del navbar guardado
          const u = JSON.parse(localStorage.getItem('kurs_user') || '{}');
          u.nombre = nombre; localStorage.setItem('kurs_user', JSON.stringify(u));
        } else { err.textContent = data.mensaje; err.style.display = ''; }
      } catch { err.textContent = 'No se pudo conectar con el servidor.'; err.style.display = ''; }
      finally { setCargando(guardarBtn, false, '', guardarHtml); }
    });

    // ── Cambiar contraseña ──
    const pwBtn = $('cambiarPw');
    const pwHtml = pwBtn.innerHTML;
    pwBtn.addEventListener('click', async function () {
      const err = $('pwError'), ok = $('pwOk');
      err.style.display = 'none'; ok.style.display = 'none';
      const actual = $('pwActual').value, nueva = $('pwNueva').value, confirm = $('pwConfirm').value;

      if (!actual || !nueva) { err.textContent = 'Completa todos los campos.'; err.style.display = ''; return; }
      if (nueva.length < 7) { err.textContent = 'La nueva contraseña debe tener al menos 7 caracteres.'; err.style.display = ''; return; }
      if (nueva !== confirm) { err.textContent = 'Las contraseñas nuevas no coinciden.'; err.style.display = ''; return; }

      setCargando(pwBtn, true, 'Actualizando...', pwHtml);
      try {
        const resp = await api('/api/cuenta/password', {
          method: 'PUT',
          body: JSON.stringify({ actual: actual, nueva: nueva })
        });
        const data = await resp.json();
        if (resp.ok) {
          ok.querySelector('span').textContent = data.mensaje;
          ok.style.display = '';
          $('pwActual').value = $('pwNueva').value = $('pwConfirm').value = '';
        } else { err.textContent = data.mensaje; err.style.display = ''; }
      } catch { err.textContent = 'No se pudo conectar con el servidor.'; err.style.display = ''; }
      finally { setCargando(pwBtn, false, '', pwHtml); }
    });

    // ── Proyectos: listar ──
    const listaEl = $('proyectosLista');
    const ESTADOS = {
      solicitado:  { txt: 'Solicitado',  clase: 'estado-solicitado' },
      en_progreso: { txt: 'En progreso', clase: 'estado-progreso' },
      entregado:   { txt: 'Entregado',   clase: 'estado-entregado' },
      cancelado:   { txt: 'Cancelado',   clase: 'estado-cancelado' }
    };
    function cargarProyectos() {
      estadoCargando(listaEl);
      api('/api/cuenta/proyectos').then(function (r) { return r.json(); }).then(function (proyectos) {
        if (!proyectos.length) {
          listaEl.innerHTML = '<div class="proyectos-vacio"><i class="ti ti-rocket"></i>' +
            '<p>Aún no tienes proyectos. ¡Solicita el primero y empecemos a construir!</p></div>';
          return;
        }
        listaEl.innerHTML = proyectos.map(function (p) {
          const e = ESTADOS[p.estado] || { txt: p.estado, clase: '' };
          const fecha = new Date(p.fechaSolicitud).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
          return '<div class="proyecto-item glass-bubble">' +
            '<div class="proyecto-item-top">' +
              '<h3>' + escapar(p.titulo) + '</h3>' +
              '<span class="proyecto-estado ' + e.clase + '">' + e.txt + '</span>' +
            '</div>' +
            '<p class="proyecto-tipo"><i class="ti ti-category"></i> ' + escapar(p.tipo) +
              (p.presupuesto ? ' · <i class="ti ti-coin"></i> ' + escapar(p.presupuesto) : '') + '</p>' +
            '<p class="proyecto-desc">' + escapar(p.descripcion) + '</p>' +
            (p.notaAdmin
              ? '<div class="proyecto-nota"><i class="ti ti-message-2"></i>' +
                '<div><strong>Nota del equipo KURS</strong><p>' + escapar(p.notaAdmin) + '</p></div></div>'
              : '') +
            '<p class="proyecto-fecha"><i class="ti ti-calendar"></i> Solicitado el ' + fecha +
              (p.estado === 'solicitado'
                ? ' · <a href="#" class="proyecto-cancelar" data-cancelar="' + p.id + '">Cancelar solicitud</a>'
                : '') + '</p>' +
          '</div>';
        }).join('');

        listaEl.querySelectorAll('[data-cancelar]').forEach(function (enlace) {
          enlace.addEventListener('click', async function (e) {
            e.preventDefault();
            if (!window.confirm('¿Seguro que quieres cancelar esta solicitud?')) return;
            try {
              await api('/api/cuenta/proyectos/' + enlace.dataset.cancelar + '/cancelar', { method: 'PUT' });
              cargarProyectos();
            } catch {}
          });
        });
      }).catch(function () { estadoError(listaEl, cargarProyectos); });
    }
    function escapar(s) {
      const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
    }
    cargarProyectos();

    // ── Descargar mis datos (portabilidad) ──
    $('descargarDatos').addEventListener('click', async function () {
      try {
        const resp = await api('/api/cuenta/datos');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kurs-mis-datos.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {}
    });

    // ── Eliminar cuenta (con confirmación de contraseña) ──
    const eliminarBtn = $('eliminarCuenta');
    const eliminarHtml = eliminarBtn.innerHTML;
    eliminarBtn.addEventListener('click', async function () {
      const err = $('eliminarError');
      err.style.display = 'none';
      const password = $('pwEliminar').value;
      if (!password) { err.textContent = 'Ingresa tu contraseña para confirmar.'; err.style.display = ''; return; }
      if (!window.confirm('Esta acción desactivará tu cuenta y cerrará tu sesión. ¿Continuar?')) return;

      setCargando(eliminarBtn, true, 'Eliminando...', eliminarHtml);
      try {
        const resp = await api('/api/cuenta', {
          method: 'DELETE',
          body: JSON.stringify({ password: password })
        });
        const data = await resp.json();
        if (resp.ok) { cerrarSesion(true); return; }
        err.textContent = data.mensaje; err.style.display = '';
      } catch { err.textContent = 'No se pudo conectar con el servidor.'; err.style.display = ''; }
      finally { setCargando(eliminarBtn, false, '', eliminarHtml); }
    });

    // ── Proyectos: mostrar/ocultar formulario ──
    const proyForm = $('proyectoForm');
    $('nuevoProyectoBtn').addEventListener('click', function () {
      proyForm.style.display = proyForm.style.display === 'none' ? '' : 'none';
    });
    $('cancelarProyecto').addEventListener('click', function () { proyForm.style.display = 'none'; });

    // ── Proyectos: enviar solicitud ──
    const envProyBtn = $('enviarProyecto');
    const envProyHtml = envProyBtn.innerHTML;
    envProyBtn.addEventListener('click', async function () {
      const err = $('proyectoError');
      err.style.display = 'none';
      const titulo = $('pTitulo').value.trim();
      const tipo = $('pTipo').value;
      const descripcion = $('pDescripcion').value.trim();
      const presupuesto = $('pPresupuesto').value.trim();

      if (!titulo) { err.textContent = 'Ponle un título a tu proyecto.'; err.style.display = ''; return; }
      if (!tipo) { err.textContent = 'Selecciona el tipo de proyecto.'; err.style.display = ''; return; }
      if (!descripcion) { err.textContent = 'Cuéntanos qué necesitas.'; err.style.display = ''; return; }

      setCargando(envProyBtn, true, 'Enviando...', envProyHtml);
      try {
        const resp = await api('/api/cuenta/proyectos', {
          method: 'POST',
          body: JSON.stringify({ titulo: titulo, tipo: tipo, descripcion: descripcion, presupuesto: presupuesto })
        });
        const data = await resp.json();
        if (resp.ok) {
          $('pTitulo').value = ''; $('pTipo').value = ''; $('pDescripcion').value = ''; $('pPresupuesto').value = '';
          proyForm.style.display = 'none';
          cargarProyectos();
        } else { err.textContent = data.mensaje; err.style.display = ''; }
      } catch { err.textContent = 'No se pudo conectar con el servidor.'; err.style.display = ''; }
      finally { setCargando(envProyBtn, false, '', envProyHtml); }
    });
  }

  // ═════════════ PANEL DE ADMINISTRACIÓN (/admin) ═════════════
  const adminWrap = document.querySelector('.admin-wrap');
  if (adminWrap) {
    const usuario = sesionActiva();
    if (!usuario) { window.location.href = '/login'; return; }
    if (parseInt(usuario.nivel, 10) < 4) { window.location.href = '/cuenta'; return; }

    async function api(url, opciones) {
      opciones = opciones || {};
      opciones.headers = Object.assign(
        { 'Content-Type': 'application/json' },   // la sesión viaja en la cookie httpOnly
        opciones.headers || {});
      // máximo 10 s de espera: si el servidor no responde, se muestra el error
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        opciones.signal = AbortSignal.timeout(10_000);
      }
      const resp = await fetch(url, opciones);
      if (resp.status === 401) { cerrarSesion(true); throw new Error('sesión expirada'); }
      if (resp.status === 403) { window.location.href = '/cuenta'; throw new Error('sin permiso'); }
      return resp;
    }
    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function fecha(f) { return new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); }

    $('adminEmail').textContent = usuario.email;

    // Pestañas
    document.querySelectorAll('.cuenta-tab[data-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.cuenta-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.cuenta-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        $('panel-' + tab.dataset.tab).classList.add('active');
      });
    });

    // ── Tarjetas de resumen ──
    function cargarResumen() {
      api('/api/admin/resumen').then(function (r) { return r.json(); }).then(function (s) {
        $('adminStats').innerHTML = [
          { i: 'ti-rocket',          n: s.proyectosNuevos,       t: 'Proyectos nuevos',     sub: s.proyectos + ' en total' },
          { i: 'ti-mail',            n: s.mensajesNoLeidos,      t: 'Mensajes sin leer',    sub: s.mensajes + ' en total' },
          { i: 'ti-truck-delivery',  n: s.proveedoresPendientes, t: 'Proveedores por revisar', sub: s.proveedores + ' en total' },
          { i: 'ti-users',           n: s.clientes,              t: 'Clientes activos',     sub: '' }
        ].map(function (c) {
          return '<div class="admin-stat glass-bubble"><i class="ti ' + c.i + '"></i>' +
            '<div><span class="admin-stat-num">' + c.n + '</span>' +
            '<p class="admin-stat-txt">' + c.t + '</p>' +
            (c.sub ? '<p class="admin-stat-sub">' + c.sub + '</p>' : '') + '</div></div>';
        }).join('');
      }).catch(function () {});
    }
    cargarResumen();

    // ── Proyectos ──
    const ESTADOS_PROY = ['solicitado', 'en_progreso', 'entregado', 'cancelado'];
    const ETIQ_PROY = { solicitado: 'Solicitado', en_progreso: 'En progreso', entregado: 'Entregado', cancelado: 'Cancelado' };
    const CLASE_PROY = { solicitado: 'estado-solicitado', en_progreso: 'estado-progreso', entregado: 'estado-entregado', cancelado: 'estado-cancelado' };
    function cargarAdminProyectos() {
      estadoCargando($('adminProyectos'));
      api('/api/admin/proyectos').then(function (r) { return r.json(); }).then(function (lista) {
        if (!lista.length) { $('adminProyectos').innerHTML = vacio('No hay proyectos solicitados.'); return; }
        $('adminProyectos').innerHTML = lista.map(function (p) {
          return '<div class="admin-item glass-bubble">' +
            '<div class="admin-item-top"><h3>' + esc(p.titulo) + '</h3>' +
              '<span class="proyecto-estado ' + (CLASE_PROY[p.estado] || '') + '">' + (ETIQ_PROY[p.estado] || p.estado) + '</span></div>' +
            '<p class="admin-item-meta"><i class="ti ti-user"></i> ' + esc(p.clienteNombre) + ' · ' + esc(p.clienteEmail) + '</p>' +
            '<p class="admin-item-meta"><i class="ti ti-category"></i> ' + esc(p.tipo) +
              (p.presupuesto ? ' · <i class="ti ti-coin"></i> ' + esc(p.presupuesto) : '') +
              ' · <i class="ti ti-calendar"></i> ' + fecha(p.fechaSolicitud) + '</p>' +
            '<p class="admin-item-desc">' + esc(p.descripcion) + '</p>' +
            '<div class="admin-item-acciones">' +
              '<label>Estado:</label>' +
              selectEstado('proy', p.id, p.estado, ESTADOS_PROY, ETIQ_PROY) +
            '</div>' +
            '<div class="admin-nota">' +
              '<textarea data-nota="' + p.id + '" maxlength="1000" rows="2" ' +
                'placeholder="Nota para el cliente (la verá en su cuenta)...">' + esc(p.notaAdmin || '') + '</textarea>' +
              '<button class="btn-send cuenta-btn-sm" data-guardarnota="' + p.id + '">' +
                '<i class="ti ti-message-2"></i> Guardar nota</button>' +
            '</div></div>';
        }).join('');
        conectarSelects('proy', '/api/admin/proyectos/', cargarAdminProyectos);

        document.querySelectorAll('[data-guardarnota]').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            const area = document.querySelector('textarea[data-nota="' + btn.dataset.guardarnota + '"]');
            btn.disabled = true;
            const original = btn.innerHTML;
            try {
              await api('/api/admin/proyectos/' + btn.dataset.guardarnota + '/nota', {
                method: 'PUT', body: JSON.stringify({ nota: area.value })
              });
              btn.innerHTML = '<i class="ti ti-check"></i> Guardada';
              setTimeout(function () { btn.innerHTML = original; btn.disabled = false; }, 1500);
            } catch { btn.disabled = false; }
          });
        });
      }).catch(function () { estadoError($('adminProyectos'), cargarAdminProyectos); });
    }

    // ── Mensajes ──
    function cargarAdminMensajes() {
      estadoCargando($('adminMensajes'));
      api('/api/contacto').then(function (r) { return r.json(); }).then(function (lista) {
        if (!lista.length) { $('adminMensajes').innerHTML = vacio('No hay mensajes.'); return; }
        $('adminMensajes').innerHTML = lista.map(function (m) {
          return '<div class="admin-item glass-bubble' + (m.leido ? ' admin-item-leido' : '') + '">' +
            '<div class="admin-item-top"><h3>' + esc(m.asunto) + '</h3>' +
              (m.leido ? '<span class="proyecto-estado estado-entregado">Leído</span>'
                       : '<span class="proyecto-estado estado-solicitado">Nuevo</span>') + '</div>' +
            '<p class="admin-item-meta"><i class="ti ti-user"></i> ' + esc(m.nombre) + ' · ' +
              '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' +
              ' · <i class="ti ti-calendar"></i> ' + fecha(m.fechaEnvio) + '</p>' +
            '<p class="admin-item-desc">' + esc(m.mensaje) + '</p>' +
            (m.leido ? '' : '<div class="admin-item-acciones">' +
              '<button class="btn-send cuenta-btn-sm" data-leido="' + m.id + '"><i class="ti ti-check"></i> Marcar como leído</button></div>') +
          '</div>';
        }).join('');
        document.querySelectorAll('[data-leido]').forEach(function (b) {
          b.addEventListener('click', async function () {
            b.disabled = true;
            try { await api('/api/contacto/' + b.dataset.leido + '/leido', { method: 'PUT' }); cargarAdminMensajes(); cargarResumen(); } catch {}
          });
        });
      }).catch(function () { estadoError($('adminMensajes'), cargarAdminMensajes); });
    }

    // ── Proveedores ──
    const ESTADOS_PROV = ['pendiente', 'aprobado', 'rechazado'];
    const ETIQ_PROV = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };
    const CLASE_PROV = { pendiente: 'estado-solicitado', aprobado: 'estado-entregado', rechazado: 'estado-cancelado' };
    function cargarAdminProveedores() {
      estadoCargando($('adminProveedores'));
      api('/api/proveedores').then(function (r) { return r.json(); }).then(function (lista) {
        if (!lista.length) { $('adminProveedores').innerHTML = vacio('No hay solicitudes de proveedores.'); return; }
        $('adminProveedores').innerHTML = lista.map(function (p) {
          return '<div class="admin-item glass-bubble">' +
            '<div class="admin-item-top"><h3>' + esc(p.razonSocial) + '</h3>' +
              '<span class="proyecto-estado ' + (CLASE_PROV[p.estado] || '') + '">' + (ETIQ_PROV[p.estado] || p.estado) + '</span></div>' +
            '<p class="admin-item-meta"><i class="ti ti-id-badge"></i> RUC ' + esc(p.ruc) +
              ' · <i class="ti ti-user"></i> ' + esc(p.representante) + '</p>' +
            '<p class="admin-item-meta"><i class="ti ti-mail"></i> ' + esc(p.email) +
              ' · <i class="ti ti-phone"></i> ' + esc(p.telefono) +
              ' · <i class="ti ti-category"></i> ' + esc(p.categoria) + '</p>' +
            (p.descripcion ? '<p class="admin-item-desc">' + esc(p.descripcion) + '</p>' : '') +
            (p.web ? '<p class="admin-item-meta"><i class="ti ti-world"></i> <a href="' + esc(p.web) + '" target="_blank" rel="noopener">' + esc(p.web) + '</a></p>' : '') +
            '<div class="admin-item-acciones"><label>Estado:</label>' +
              selectEstado('prov', p.id, p.estado, ESTADOS_PROV, ETIQ_PROV) + '</div>' +
          '</div>';
        }).join('');
        conectarSelects('prov', '/api/admin/proveedores/', cargarAdminProveedores);
      }).catch(function () { estadoError($('adminProveedores'), cargarAdminProveedores); });
    }

    // ── Clientes ──
    function cargarAdminClientes() {
      estadoCargando($('adminClientes'));
      api('/api/clientes').then(function (r) { return r.json(); }).then(function (lista) {
        if (!lista.length) { $('adminClientes').innerHTML = vacio('No hay clientes.'); return; }
        const NIVELES = { 1: 'Visitante', 2: 'Cliente', 3: 'Colaborador', 4: 'Administrador' };
        $('adminClientes').innerHTML = lista.map(function (c) {
          return '<div class="admin-item glass-bubble">' +
            '<div class="admin-item-top"><h3>' + esc(c.nombre) + '</h3>' +
              '<span class="proyecto-estado ' + (c.nivel >= 4 ? 'estado-progreso' : 'estado-solicitado') + '">' + (NIVELES[c.nivel] || c.nivel) + '</span></div>' +
            '<p class="admin-item-meta"><i class="ti ti-mail"></i> ' + esc(c.email) +
              (c.empresa ? ' · <i class="ti ti-building"></i> ' + esc(c.empresa) : '') +
              (c.telefono ? ' · <i class="ti ti-phone"></i> ' + esc(c.telefono) : '') + '</p>' +
            '<p class="admin-item-meta"><i class="ti ti-calendar"></i> Registrado el ' + fecha(c.fechaRegistro) + '</p>' +
          '</div>';
        }).join('');
      }).catch(function () { estadoError($('adminClientes'), cargarAdminClientes); });
    }

    // Helpers de renderizado compartidos
    function vacio(txt) { return '<div class="proyectos-vacio"><i class="ti ti-inbox"></i><p>' + txt + '</p></div>'; }
    function selectEstado(pref, id, actual, estados, etiquetas) {
      return '<select class="admin-estado-select" data-' + pref + '="' + id + '">' +
        estados.map(function (e) {
          return '<option value="' + e + '"' + (e === actual ? ' selected' : '') + '>' + etiquetas[e] + '</option>';
        }).join('') + '</select>';
    }
    function conectarSelects(pref, base, recargar) {
      document.querySelectorAll('[data-' + pref + ']').forEach(function (sel) {
        sel.addEventListener('change', async function () {
          sel.disabled = true;
          try {
            await api(base + sel.dataset[pref] + '/estado', {
              method: 'PUT', body: JSON.stringify({ estado: sel.value })
            });
            recargar(); cargarResumen();
          } catch { sel.disabled = false; }
        });
      });
    }

    cargarAdminProyectos();
    cargarAdminMensajes();
    cargarAdminProveedores();
    cargarAdminClientes();
  }
})();

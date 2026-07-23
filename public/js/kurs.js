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

  // ── Chatbot / asistente en la página (en todo el sitio salvo el panel admin) ──
  // Asistente autónomo (sin backend): responde por palabras clave y deriva a
  // WhatsApp (+51 997 315 880), donde el bot de n8n continúa la conversación.
  if (!document.querySelector('.admin-wrap')) montarChatbot();

  // ── Botón "volver arriba" (aparece al bajar; esquina inferior izquierda) ──
  (function () {
    const subir = document.createElement('button');
    subir.className = 'subir-btn';
    subir.setAttribute('aria-label', 'Volver arriba');
    subir.innerHTML = '<i class="ti ti-arrow-up"></i>';
    subir.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(subir);

    // Visibilidad: listener de scroll (respuesta inmediata) + un temporizador
    // de respaldo que corrige el estado si algún scroll no emitió el evento.
    let visible = false;
    function actualizar() {
      const mostrar = window.scrollY > 600;
      if (mostrar !== visible) {
        visible = mostrar;
        subir.classList.toggle('subir-visible', mostrar);
      }
    }
    window.addEventListener('scroll', actualizar, { passive: true });
    setInterval(actualizar, 600);
  })();

  // ── Promo destacada: barra superior "7 días gratis" (descartable) ──
  // Fija arriba de todo; empuja el navbar y el contenido hacia abajo con la
  // variable --promo-h (su altura real, recalculada al redimensionar). No sale
  // en /admin ni si el usuario la cerró antes (localStorage).
  if (!document.querySelector('.admin-wrap') &&
      localStorage.getItem('kurs_promo7bar') !== 'off') montarPromo7();

  function montarPromo7() {
    const wsp = 'https://wa.me/51997315880?text=' +
      encodeURIComponent('¡Hola KURS! Soy nuevo y quiero aprovechar los 7 días gratis en un servicio.');
    const bar = document.createElement('div');
    bar.className = 'promo-bar';
    bar.setAttribute('role', 'complementary');
    bar.setAttribute('aria-label', 'Promoción para nuevos usuarios');
    bar.innerHTML =
      '<a class="promo-bar-link" href="' + wsp + '" target="_blank" rel="noopener">' +
        '<span class="promo-bar-icono">🎁</span>' +
        '<span class="promo-bar-texto"><strong>7 días GRATIS</strong> para nuevos usuarios' +
          '<span class="promo-bar-extra"> · en cualquier servicio</span></span>' +
        '<span class="promo-bar-cta">Aprovéchalo <i class="ti ti-arrow-right"></i></span>' +
      '</a>' +
      '<button class="promo-bar-cerrar" aria-label="Cerrar promoción">&times;</button>';
    document.body.appendChild(bar);
    document.body.classList.add('con-promo');

    // Recalcula la altura real de la barra ante cualquier cambio (envolvente,
    // rotación, redimensionado): así el empuje del contenido siempre coincide.
    function ajustar() { document.body.style.setProperty('--promo-h', bar.offsetHeight + 'px'); }
    ajustar();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(ajustar); ro.observe(bar); }
    else window.addEventListener('resize', ajustar);

    bar.querySelector('.promo-bar-cerrar').addEventListener('click', function () {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', ajustar);
      document.body.classList.remove('con-promo');
      document.body.style.removeProperty('--promo-h');
      bar.remove();
      localStorage.setItem('kurs_promo7bar', 'off');
    });
  }

  function montarChatbot() {
    const WSP = '51997315880';
    const wspUrl = function (texto) {
      return 'https://wa.me/' + WSP + '?text=' + encodeURIComponent(texto);
    };

    // KOSMO usa la imagen del personaje completo, encuadrada en la carita por
    // CSS. Si la imagen faltara, se mantiene el ícono de respaldo.
    function montarKosmo(cont) {
      if (!cont) return;
      const img = document.createElement('img');
      img.className = 'kbot-kosmo-img';
      img.alt = 'KOSMO';
      img.addEventListener('load', function () { cont.classList.add('kbot-con-img'); });
      img.src = '/images/kosmo-completo.png?v=2';
      cont.insertBefore(img, cont.firstChild);
    }

    const lanzador = document.createElement('button');
    lanzador.className = 'kbot-lanzador';
    lanzador.setAttribute('aria-label', 'Abrir a KOSMO, tu amigo virtual');
    lanzador.innerHTML =
      '<i class="ti ti-message-chatbot kbot-fallback"></i><span class="kbot-punto"></span>';

    const win = document.createElement('div');
    win.className = 'kbot-win';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'KOSMO — tu amigo virtual');
    win.innerHTML =
      '<div class="kbot-head">' +
        '<div class="kbot-head-info">' +
          '<span class="kbot-avatar"><i class="ti ti-robot kbot-fallback"></i></span>' +
          '<div><strong>KOSMO</strong>' +
          '<span class="kbot-estado"><i class="ti ti-point-filled"></i> Tu amigo virtual · En línea</span></div>' +
        '</div>' +
        '<div class="kbot-head-acciones">' +
          '<button class="kbot-reiniciar" aria-label="Empezar la conversación de nuevo" ' +
            'title="Empezar de nuevo"><i class="ti ti-refresh"></i></button>' +
          '<button class="kbot-cerrar" aria-label="Cerrar el chat">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="kbot-msgs" id="kbotMsgs" aria-live="polite"></div>' +
      '<div class="kbot-chips" id="kbotChips"></div>' +
      '<form class="kbot-input" id="kbotForm">' +
        '<input type="text" id="kbotText" maxlength="200" autocomplete="off" ' +
          'placeholder="Escribe tu mensaje..." aria-label="Tu mensaje" />' +
        '<button type="submit" aria-label="Enviar"><i class="ti ti-send"></i></button>' +
      '</form>';

    document.body.appendChild(lanzador);
    document.body.appendChild(win);
    montarKosmo(lanzador);
    montarKosmo(win.querySelector('.kbot-avatar'));

    const msgs = win.querySelector('#kbotMsgs');
    const chipsBox = win.querySelector('#kbotChips');
    const form = win.querySelector('#kbotForm');
    const input = win.querySelector('#kbotText');
    let iniciado = false;
    let teaser = null;
    function quitarTeaser() { if (teaser) { teaser.remove(); teaser = null; } }

    function esc(t) {
      return t.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function scrollAbajo() { msgs.scrollTop = msgs.scrollHeight; }

    // Memoria de la conversación durante la visita (sessionStorage): al navegar
    // entre páginas el chat no arranca de cero. El HTML guardado es solo el que
    // genera este script (el texto del usuario ya entra escapado con esc()).
    const HIST_KEY = 'kurs_kosmo_hist';
    let historial = [];
    try { historial = JSON.parse(sessionStorage.getItem(HIST_KEY) || '[]') || []; } catch { historial = []; }
    function guardarHist(quien, html) {
      historial.push({ q: quien, h: html });
      if (historial.length > 40) historial = historial.slice(-40);
      try { sessionStorage.setItem(HIST_KEY, JSON.stringify(historial)); } catch { /* sin storage */ }
    }

    function pintar(quien, html) {
      const b = document.createElement('div');
      b.className = 'kbot-msg kbot-' + quien;
      b.innerHTML = html;
      msgs.appendChild(b);
      scrollAbajo();
      return b;
    }
    // efimero=true → no se guarda (indicador de "escribiendo...")
    function burbuja(quien, html, efimero) {
      if (!efimero) guardarHist(quien, html);
      return pintar(quien, html);
    }

    const CHIPS_BASE = [
      { t: '🎁 7 días gratis', k: 'promo' },
      { t: 'Servicios', k: 'servicios' },
      { t: 'Cotización', k: 'precio' },
      { t: 'Contacto', k: 'contacto' }
    ];

    function pintarChips(lista) {
      chipsBox.innerHTML = '';
      (lista || CHIPS_BASE).forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kbot-chip';
        b.textContent = c.t;
        b.addEventListener('click', function () {
          if (c.url) { window.open(c.url, '_blank', 'noopener'); return; }
          burbuja('user', esc(c.t));
          manejar(c.t, c.k);
        });
        chipsBox.appendChild(b);
      });
    }

    // Respuesta del bot con retardo proporcional al largo (efecto "escribiendo...")
    function responder(html, chips) {
      chipsBox.innerHTML = '';
      const t = burbuja('bot', '<span class="kbot-typing"><i></i><i></i><i></i></span>', true);
      const espera = Math.min(1500, 400 + html.length * 3);
      setTimeout(function () {
        t.remove();
        burbuja('bot', html);
        pintarChips(chips);
      }, espera);
    }

    function intencion(texto) {
      const t = texto.toLowerCase();
      // El saludo se evalúa al final: "hola, ¿cuánto cuesta una web?" debe
      // responder por el precio, no quedarse en el saludo.
      if (/gratis|prueba|7 d[ií]|siete d[ií]|promo|descuento|oferta|cup[oó]n/.test(t)) return 'promo';
      if (/demora|tiempo|entrega|plazo|dura|r[aá]pido|listo para cu[aá]ndo/.test(t)) return 'tiempo';
      if (/horario|atienden|atenci[oó]n|abierto|qué hora|que hora/.test(t)) return 'horario';
      if (/d[oó]nde|ubica|direcci[oó]n|lugar|ciudad|per[uú]|presencial/.test(t)) return 'ubicacion';
      if (/portafolio|proyectos|ejemplos|trabajos|casos|clientes/.test(t)) return 'portafolio';
      if (/pago|pagar|transferencia|yape|plin|tarjeta|factura|financ/.test(t)) return 'pago';
      if (/precio|costo|cotiz|cu[aá]nto|tarifa|presupuesto|vale/.test(t)) return 'precio';
      if (/servicio|web|app|p[aá]gina|software|automatiz|chatbot|bot|desarrollo|sistema|tienda/.test(t)) return 'servicios';
      if (/contacto|tel[eé]fono|correo|email|whats|hablar|humano|asesor|llamar/.test(t)) return 'contacto';
      if (/hola|buen|saludo|hey|qué tal|que tal|kosmo/.test(t)) return 'saludo';
      if (/gracias|ok|listo|genial|perfecto/.test(t)) return 'gracias';
      return 'default';
    }

    function manejar(textoUsuario, claveForzada) {
      const clave = claveForzada || intencion(textoUsuario);
      if (clave === 'servicios') {
        responder(
          'En KURS ayudamos a pymes con:<br>• Páginas y tiendas web<br>• Apps y sistemas a medida<br>' +
          '• Automatizaciones y chatbots de WhatsApp<br><br>¿Sobre cuál quieres saber más?',
          [{ t: 'Cotización', k: 'precio' },
           { t: 'Hablar por WhatsApp', url: wspUrl('¡Hola KURS! Quiero saber más sobre sus servicios.') }]
        );
      } else if (clave === 'precio') {
        responder(
          'Cada proyecto se cotiza según su alcance. Cuéntanos qué necesitas y te preparamos una ' +
          'propuesta sin costo, normalmente en menos de 24 h.',
          [{ t: 'Pedir cotización', url: wspUrl('¡Hola KURS! Quiero una cotización para un proyecto.') },
           { t: 'Servicios', k: 'servicios' }]
        );
      } else if (clave === 'contacto') {
        responder(
          'Puedes escribirnos por:<br>• WhatsApp: +51 997 315 880<br>' +
          '• Correo: kurs.company.com@gmail.com<br>• Instagram: @kurs.pe',
          [{ t: 'Abrir WhatsApp', url: wspUrl('¡Hola KURS! Me gustaría hablar con un asesor.') }]
        );
      } else if (clave === 'wsp') {
        responder(
          'Te llevo con nuestro equipo por WhatsApp 👇 Ahí seguimos la conversación.',
          [{ t: 'Abrir WhatsApp', url: wspUrl('¡Hola KURS! Vengo desde la web.') }]
        );
      } else if (clave === 'promo') {
        responder(
          '🎁 ¡Tenemos <strong>7 días GRATIS</strong> para nuevos usuarios en cualquier ' +
          'servicio! Pruébanos sin compromiso. ¿Te activo la promo?',
          [{ t: 'Quiero mis 7 días', url: wspUrl('¡Hola KURS! Soy nuevo y quiero aprovechar los 7 días gratis en un servicio.') },
           { t: 'Servicios', k: 'servicios' }]
        );
      } else if (clave === 'tiempo') {
        responder(
          'Los tiempos dependen del proyecto: una web suele estar en 1–2 semanas y una ' +
          'automatización o chatbot puede tomar solo unos días. Te damos una fecha exacta al cotizar.',
          [{ t: 'Pedir cotización', url: wspUrl('¡Hola KURS! ¿En cuánto tiempo podrían entregar mi proyecto?') },
           { t: 'Servicios', k: 'servicios' }]
        );
      } else if (clave === 'horario') {
        responder(
          'Atendemos de <strong>lunes a sábado</strong>. Por WhatsApp respondemos rápido, ' +
          'y KOSMO 🐾 está aquí las 24 h para orientarte.',
          [{ t: 'Escribir por WhatsApp', url: wspUrl('¡Hola KURS! Quería consultarles algo.') }]
        );
      } else if (clave === 'ubicacion') {
        responder(
          'Somos un equipo de <strong>Perú</strong> 🇵🇪 y trabajamos 100% en línea, así que ' +
          'podemos ayudarte estés donde estés.',
          [{ t: 'Contacto', k: 'contacto' }]
        );
      } else if (clave === 'portafolio') {
        responder(
          'Hemos hecho webs, tiendas online, sistemas a medida y chatbots de WhatsApp para ' +
          'pymes. Cuéntanos tu rubro y te mostramos ejemplos parecidos por WhatsApp.',
          [{ t: 'Ver ejemplos', url: wspUrl('¡Hola KURS! ¿Me pueden mostrar ejemplos de sus trabajos?') },
           { t: 'Servicios', k: 'servicios' }]
        );
      } else if (clave === 'pago') {
        responder(
          'Aceptamos transferencia, Yape y Plin. Normalmente se trabaja con un adelanto y el ' +
          'resto contra entrega; también emitimos comprobante.',
          [{ t: 'Consultar', url: wspUrl('¡Hola KURS! Quería consultar sobre las formas de pago.') }]
        );
      } else if (clave === 'saludo') {
        responder('¡Hola! 👋 Soy <strong>KOSMO</strong> 🐾, tu amigo virtual de KURS. ¿En qué te ayudo hoy?');
      } else if (clave === 'gracias') {
        responder('¡Con gusto! Si necesitas algo más, aquí estoy. 🚀');
      } else {
        responder(
          'Entiendo. ¿Quieres que te conecte con nuestro equipo por WhatsApp para darte la mejor respuesta?',
          [{ t: 'Sí, por WhatsApp', url: wspUrl('¡Hola KURS! Tengo una consulta: ' + textoUsuario) },
           { t: 'Servicios', k: 'servicios' }]
        );
      }
    }

    // Remate del saludo según la página: KOSMO sabe dónde está el visitante
    function remateContextual() {
      if (document.querySelector('.e404-wrap')) {
        return '¿Te perdiste? 🧭 Dime qué buscabas y te llevo por buen rumbo.';
      }
      if (location.pathname.indexOf('/contacto') === 0) {
        return '¿Te ayudo con el formulario, o prefieres que hablemos directo por WhatsApp?';
      }
      if (location.pathname.indexOf('/privacidad') === 0) {
        return 'Si tienes dudas sobre tus datos o la privacidad, pregúntame con confianza.';
      }
      return 'Estoy para ayudarte y acompañarte. ¿Qué necesitas hoy?';
    }

    function iniciar() {
      if (iniciado) return;
      iniciado = true;
      // Si hay conversación previa en esta visita, se restaura en vez de saludar
      if (historial.length) {
        historial.forEach(function (m) { pintar(m.q, m.h); });
        pintarChips();
        return;
      }
      const h = new Date().getHours();
      const hola = h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
      responder('¡' + hola + '! 👋 Soy <strong>KOSMO</strong> 🐾, tu amigo virtual de KURS. ' +
        remateContextual());
    }

    // Empezar de nuevo: borra la memoria y vuelve a saludar
    function reiniciarChat() {
      historial = [];
      try { sessionStorage.removeItem(HIST_KEY); } catch { /* sin storage */ }
      msgs.innerHTML = '';
      chipsBox.innerHTML = '';
      iniciado = false;
      iniciar();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const txt = input.value.trim();
      if (!txt) return;
      burbuja('user', esc(txt));
      input.value = '';
      manejar(txt);
    });

    function abrir() {
      quitarTeaser();
      localStorage.setItem('kurs_kosmo_teaser', 'off');
      win.classList.add('abierta');
      lanzador.classList.add('activo');
      const punto = lanzador.querySelector('.kbot-punto');
      if (punto) punto.style.display = 'none';
      iniciar();
      setTimeout(function () { input.focus(); }, 200);
    }
    function cerrar() {
      win.classList.remove('abierta');
      lanzador.classList.remove('activo');
    }

    lanzador.addEventListener('click', function () {
      if (win.classList.contains('abierta')) cerrar(); else abrir();
    });
    win.querySelector('.kbot-cerrar').addEventListener('click', cerrar);
    win.querySelector('.kbot-reiniciar').addEventListener('click', reiniciarChat);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && win.classList.contains('abierta')) cerrar();
    });

    // Teaser: a los pocos segundos, una burbuja invita a chatear (solo si el
    // usuario no lo abrió ni lo cerró antes — se recuerda en localStorage).
    if (localStorage.getItem('kurs_kosmo_teaser') !== 'off') {
      setTimeout(function () {
        if (win.classList.contains('abierta') || teaser) return;
        teaser = document.createElement('button');
        teaser.className = 'kbot-teaser';
        teaser.setAttribute('aria-label', 'Abrir el chat de KOSMO');
        teaser.innerHTML = '<span>👋 ¡Hola! ¿Te ayudo?</span>' +
          '<i class="ti ti-x kbot-teaser-x" aria-hidden="true"></i>';
        document.body.appendChild(teaser);
        setTimeout(function () { if (teaser) teaser.classList.add('kbot-teaser-visible'); }, 30);
        teaser.addEventListener('click', function (e) {
          localStorage.setItem('kurs_kosmo_teaser', 'off');
          if (e.target.classList.contains('kbot-teaser-x')) { quitarTeaser(); return; }
          quitarTeaser();
          abrir();
        });
      }, 5000);
    }
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
      if (!password || password.length < 7) {
        error.textContent = 'La contraseña debe tener al menos 7 caracteres.';
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

  // ═════════════ CONTACTO ═════════════
  const contactoBtn = $('contactoBtn');
  if (contactoBtn) {
    const htmlNormal = contactoBtn.innerHTML;

    // Contador de caracteres del mensaje
    const mensajeInput = $('mensaje');
    const contador = $('mensajeContador');
    if (mensajeInput && contador) {
      mensajeInput.addEventListener('input', function () {
        contador.textContent = mensajeInput.value.length;
      });
    }

    contactoBtn.addEventListener('click', async function () {
      const error = $('contactoError');
      error.style.display = 'none';

      const nombre = $('nombre').value.trim();
      const empresa = $('empresa').value.trim();
      const email = $('email').value.trim();
      const telefono = $('telefono').value.trim();
      const servicio = $('servicio').value;
      const presupuesto = $('presupuesto').value;
      const asunto = $('asunto').value.trim();
      const mensaje = $('mensaje').value.trim();

      function fallo(msg) { error.textContent = msg; error.style.display = ''; }

      if (!nombre) return fallo('Ingresa tu nombre completo.');
      if (!email || !emailValido(email)) return fallo('Ingresa un correo electrónico válido.');
      if (!servicio) return fallo('Cuéntanos qué servicio necesitas.');
      if (!asunto) return fallo('Escribe un asunto para tu mensaje.');
      if (!mensaje) return fallo('Cuéntanos un poco más sobre tu proyecto.');

      setCargando(contactoBtn, true, 'Enviando...', htmlNormal);
      try {
        const captcha = await recaptchaToken('contacto');
        const resp = await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre, email: email, asunto: asunto, mensaje: mensaje,
            empresa: empresa || null, telefono: telefono || null,
            servicio: servicio, presupuesto: presupuesto || null,
            recaptchaToken: captcha
          })
        });

        if (resp.ok) {
          $('contactoForm').style.display = 'none';
          $('contactoOk').style.display = '';
          $('contactoOk').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const data = await resp.json().catch(function () { return {}; });
          fallo(data.mensaje || 'Ocurrió un problema al enviar. Inténtalo de nuevo.');
        }
      } catch {
        fallo('No se pudo conectar con el servidor. Revisa tu conexión.');
      } finally {
        setCargando(contactoBtn, false, '', htmlNormal);
      }
    });
    enviarConEnter($('contactoForm'), contactoBtn);
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
          { i: 'ti-brand-whatsapp',  n: s.leadsNuevos ?? 0,      t: 'Leads nuevos',
            sub: (s.leads ?? 0) + ' en total · ' + (s.tareasPendientes ?? 0) + ' tareas pendientes' },
          { i: 'ti-mail',            n: s.mensajesNoLeidos,      t: 'Mensajes sin leer',    sub: s.mensajes + ' en total' },
          { i: 'ti-users',           n: s.clientes,              t: 'Clientes activos',     sub: '' }
        ].map(function (c) {
          return '<div class="admin-stat glass-bubble"><i class="ti ' + c.i + '"></i>' +
            '<div><span class="admin-stat-num">' + c.n + '</span>' +
            '<p class="admin-stat-txt">' + c.t + '</p>' +
            (c.sub ? '<p class="admin-stat-sub">' + c.sub + '</p>' : '') + '</div></div>';
        }).join('');

        // Contadores en las pestañas (como los badges de WhatsApp)
        [['crm', s.leadsNuevos], ['mensajes', s.mensajesNoLeidos]]
          .forEach(function (par) {
            const tab = document.querySelector('.cuenta-tab[data-tab="' + par[0] + '"]');
            if (!tab) return;
            let badge = tab.querySelector('.tab-badge');
            if (par[1] > 0) {
              if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; tab.appendChild(badge); }
              badge.textContent = par[1];
            } else if (badge) { badge.remove(); }
          });
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

    // ── CRM del chatbot de WhatsApp ──
    const ESTADOS_LEAD = ['nuevo', 'contactado', 'cotizado', 'cerrado', 'perdido'];
    const ETIQ_LEAD = { nuevo: 'Nuevo', contactado: 'Contactado', cotizado: 'Cotizado', cerrado: 'Cerrado', perdido: 'Perdido' };
    const CLASE_LEAD = {
      nuevo: 'estado-solicitado', contactado: 'estado-progreso', cotizado: 'estado-cotizado',
      cerrado: 'estado-entregado', perdido: 'estado-cancelado'
    };
    let crmLeads = [];          // cache para filtrar sin volver a pedir
    let crmFiltro = 'todos';

    function fechaHora(f) {
      return new Date(f).toLocaleString('es-PE',
        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    // Burbujas del chat (se reutiliza en la carga inicial y en la auto-actualización)
    function htmlChat(conversacion) {
      if (!conversacion.length) return '<p class="crm-chat-vacio">Sin mensajes registrados.</p>';
      return conversacion.map(function (m) {
        return '<div class="crm-msg crm-msg-' + (m.direccion === 'saliente' ? 'saliente' : 'entrante') + '">' +
          esc(m.texto) + '<time>' + fechaHora(m.fecha) +
          (m.direccion === 'saliente' ? ' · KURS' : '') + '</time></div>';
      }).join('');
    }

    function pintarFiltrosCrm() {
      const filtros = ['todos'].concat(ESTADOS_LEAD);
      $('crmFiltros').innerHTML = filtros.map(function (f) {
        const n = f === 'todos' ? crmLeads.length
                                : crmLeads.filter(function (l) { return l.estado === f; }).length;
        return '<button class="crm-filtro' + (crmFiltro === f ? ' active' : '') + '" data-filtro="' + f + '">' +
          (f === 'todos' ? 'Todos' : ETIQ_LEAD[f]) + ' (' + n + ')</button>';
      }).join('');
      $('crmFiltros').querySelectorAll('[data-filtro]').forEach(function (b) {
        b.addEventListener('click', function () { crmFiltro = b.dataset.filtro; pintarCrm(); });
      });
    }

    // Búsqueda por nombre o teléfono (sobre la lista ya cargada)
    let crmBusqueda = '';
    if ($('crmBuscar')) {
      $('crmBuscar').addEventListener('input', function () {
        crmBusqueda = this.value.trim().toLowerCase();
        pintarCrm();
      });
    }

    function pintarCrm() {
      pintarFiltrosCrm();
      let lista = crmFiltro === 'todos' ? crmLeads
        : crmLeads.filter(function (l) { return l.estado === crmFiltro; });
      if (crmBusqueda) {
        lista = lista.filter(function (l) {
          return ((l.nombre || '') + ' ' + l.telefono).toLowerCase().includes(crmBusqueda);
        });
      }
      if (!lista.length) {
        $('adminCrm').innerHTML = vacio(crmLeads.length
          ? (crmBusqueda ? 'Ningún lead coincide con la búsqueda.' : 'No hay leads en este estado.')
          : 'Aún no hay leads. Cuando alguien escriba al chatbot de WhatsApp aparecerá aquí.');
        return;
      }
      $('adminCrm').innerHTML = lista.map(function (l) {
        return '<div class="admin-item glass-bubble" data-leaditem="' + l.id + '">' +
          '<div class="admin-item-top crm-lead-top" data-toggle="' + l.id + '">' +
            '<h3>' + (l.nombre ? esc(l.nombre) : '<span class="crm-tel">Sin nombre</span>') +
              ' <span class="crm-tel">' + esc(l.telefono) + '</span></h3>' +
            '<div class="crm-badges">' +
              (l.tareasPendientes ? '<span class="crm-pendientes"><i class="ti ti-bell"></i> ' + l.tareasPendientes + '</span>' : '') +
              '<span class="proyecto-estado ' + (CLASE_LEAD[l.estado] || '') + '" data-badge="' + l.id + '">' +
                (ETIQ_LEAD[l.estado] || l.estado) + '</span>' +
              '<i class="ti ti-chevron-down"></i>' +
            '</div>' +
          '</div>' +
          '<p class="admin-item-meta"><i class="ti ti-message-circle"></i> ' + l.mensajes + ' mensaje(s)' +
            ' · <i class="ti ti-calendar"></i> Último contacto: ' + fechaHora(l.ultimoContacto) +
            ' · <i class="ti ti-plant-2"></i> Desde ' + fecha(l.primerContacto) + '</p>' +
          '<div class="crm-detalle" style="display:none" data-detalle="' + l.id + '"></div>' +
        '</div>';
      }).join('');

      $('adminCrm').querySelectorAll('[data-toggle]').forEach(function (top) {
        top.addEventListener('click', function () {
          const det = document.querySelector('[data-detalle="' + top.dataset.toggle + '"]');
          if (det.style.display === 'none') {
            det.style.display = '';
            cargarDetalleLead(top.dataset.toggle, det);
          } else {
            det.style.display = 'none';
          }
        });
      });
    }

    function cargarDetalleLead(id, det) {
      estadoCargando(det);
      api('/api/admin/crm/leads/' + id).then(function (r) { return r.json(); }).then(function (l) {
        const chat = htmlChat(l.conversacion);
        det.dataset.nmsg = l.conversacion.length;

        const tareas = l.tareas.map(function (t) {
          const vencida = t.fechaLimite && !t.completada && new Date(t.fechaLimite) < new Date();
          return '<div class="crm-tarea' + (t.completada ? ' done' : '') + '" data-tarea="' + t.id + '">' +
            '<input type="checkbox"' + (t.completada ? ' checked' : '') + ' data-tareacheck="' + t.id + '">' +
            '<span class="crm-tarea-txt">' + esc(t.descripcion) + '</span>' +
            (t.fechaLimite ? '<span class="crm-tarea-fecha' + (vencida ? ' vencida' : '') + '">' +
              '<i class="ti ti-calendar-due"></i> ' + fecha(t.fechaLimite) + '</span>' : '') +
            '<button class="crm-tarea-borrar" data-tareaborrar="' + t.id + '" aria-label="Eliminar tarea">' +
              '<i class="ti ti-trash"></i></button>' +
          '</div>';
        }).join('');

        det.innerHTML =
          '<div class="crm-chat">' + chat + '</div>' +
          '<div class="crm-responder">' +
            '<input type="text" class="crm-resp-txt" maxlength="4000" ' +
              'placeholder="Responder por WhatsApp...">' +
            '<button class="crm-resp-enviar glass-bubble-btn" data-responder="' + l.id + '" ' +
              'aria-label="Enviar por WhatsApp"><i class="ti ti-send"></i></button>' +
          '</div>' +
          '<p class="login-error crm-resp-error" style="display:none"></p>' +
          '<div class="admin-item-acciones">' +
            '<label>Estado:</label>' +
            '<select class="admin-estado-select" data-leadestado="' + l.id + '">' +
              ESTADOS_LEAD.map(function (e) {
                return '<option value="' + e + '"' + (e === l.estado ? ' selected' : '') + '>' + ETIQ_LEAD[e] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="admin-nota">' +
            '<input type="text" data-leadnombre="' + l.id + '" maxlength="200" ' +
              'placeholder="Nombre del lead..." value="' + esc(l.nombre || '') + '" ' +
              'style="flex:0 1 220px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);' +
              'border-radius:12px;color:inherit;font-size:13px;padding:10px 14px;outline:none">' +
            '<textarea data-leadnotas="' + l.id + '" maxlength="4000" rows="2" ' +
              'placeholder="Notas internas (solo las ven los administradores)...">' + esc(l.notas || '') + '</textarea>' +
            '<button class="btn-send cuenta-btn-sm" data-guardarlead="' + l.id + '">' +
              '<i class="ti ti-device-floppy"></i> Guardar</button>' +
          '</div>' +
          '<div class="crm-tareas">' +
            '<h4><i class="ti ti-checklist"></i> Seguimientos</h4>' + tareas +
            '<div class="crm-tarea-add">' +
              '<input type="text" class="crm-tarea-desc" maxlength="500" placeholder="Nueva tarea (ej. llamar el viernes)...">' +
              '<input type="date" class="crm-tarea-fechal">' +
              '<button class="btn-send cuenta-btn-sm" data-agregartarea="' + l.id + '">' +
                '<i class="ti ti-plus"></i> Agregar</button>' +
            '</div>' +
          '</div>';

        // El chat abre mostrando lo más reciente, como WhatsApp
        const chatEl = det.querySelector('.crm-chat');
        chatEl.scrollTop = chatEl.scrollHeight;

        // Responder por WhatsApp (Cloud API): envía y recarga la conversación
        const respTxt = det.querySelector('.crm-resp-txt');
        const respBtn = det.querySelector('[data-responder]');
        const respErr = det.querySelector('.crm-resp-error');
        async function enviarRespuesta() {
          const texto = respTxt.value.trim();
          if (!texto) return;
          respErr.style.display = 'none';
          respBtn.disabled = true;
          respTxt.disabled = true;
          respBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i>';
          try {
            const resp = await api('/api/admin/crm/leads/' + l.id + '/responder', {
              method: 'POST', body: JSON.stringify({ texto: texto })
            });
            const data = await resp.json().catch(function () { return {}; });
            if (resp.ok) {
              cargarDetalleLead(l.id, det);   // re-pinta el chat con el mensaje enviado
              return;
            }
            respErr.textContent = data.mensaje || 'No se pudo enviar el mensaje.';
            respErr.style.display = '';
          } catch {
            respErr.textContent = 'No se pudo conectar con el servidor.';
            respErr.style.display = '';
          }
          respBtn.disabled = false;
          respTxt.disabled = false;
          respBtn.innerHTML = '<i class="ti ti-send"></i>';
        }
        respBtn.addEventListener('click', enviarRespuesta);
        respTxt.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); enviarRespuesta(); }
        });

        // Cambiar estado del pipeline (actualiza la etiqueta sin recargar la lista)
        det.querySelector('[data-leadestado]').addEventListener('change', async function () {
          const sel = this;
          sel.disabled = true;
          try {
            await api('/api/admin/crm/leads/' + l.id, {
              method: 'PUT', body: JSON.stringify({ estado: sel.value })
            });
            const badge = document.querySelector('[data-badge="' + l.id + '"]');
            badge.textContent = ETIQ_LEAD[sel.value];
            badge.className = 'proyecto-estado ' + (CLASE_LEAD[sel.value] || '');
            const enCache = crmLeads.find(function (x) { return x.id === l.id; });
            if (enCache) enCache.estado = sel.value;
            pintarFiltrosCrm();
            cargarResumen();
          } catch {}
          sel.disabled = false;
        });

        // Guardar nombre y notas
        det.querySelector('[data-guardarlead]').addEventListener('click', async function () {
          const btn = this, original = btn.innerHTML;
          btn.disabled = true;
          try {
            await api('/api/admin/crm/leads/' + l.id, {
              method: 'PUT',
              body: JSON.stringify({
                nombre: det.querySelector('[data-leadnombre]').value.trim() || null,
                notas: det.querySelector('[data-leadnotas]').value.trim()
              })
            });
            btn.innerHTML = '<i class="ti ti-check"></i> Guardado';
            setTimeout(function () { btn.innerHTML = original; btn.disabled = false; }, 1500);
            const enCache = crmLeads.find(function (x) { return x.id === l.id; });
            if (enCache) enCache.nombre = det.querySelector('[data-leadnombre]').value.trim() || null;
          } catch { btn.disabled = false; }
        });

        // Completar / reabrir tarea
        det.querySelectorAll('[data-tareacheck]').forEach(function (chk) {
          chk.addEventListener('change', async function () {
            chk.disabled = true;
            try {
              await api('/api/admin/crm/tareas/' + chk.dataset.tareacheck, {
                method: 'PUT', body: JSON.stringify({ completada: chk.checked })
              });
              chk.closest('.crm-tarea').classList.toggle('done', chk.checked);
              cargarResumen();
            } catch { chk.checked = !chk.checked; }
            chk.disabled = false;
          });
        });

        // Eliminar tarea
        det.querySelectorAll('[data-tareaborrar]').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            if (!window.confirm('¿Eliminar esta tarea?')) return;
            try {
              await api('/api/admin/crm/tareas/' + btn.dataset.tareaborrar, { method: 'DELETE' });
              btn.closest('.crm-tarea').remove();
              cargarResumen();
            } catch {}
          });
        });

        // Agregar tarea
        det.querySelector('[data-agregartarea]').addEventListener('click', async function () {
          const desc = det.querySelector('.crm-tarea-desc').value.trim();
          if (!desc) return;
          const fechal = det.querySelector('.crm-tarea-fechal').value;
          const btn = this;
          btn.disabled = true;
          try {
            await api('/api/admin/crm/leads/' + l.id + '/tareas', {
              method: 'POST',
              body: JSON.stringify({ descripcion: desc, fechaLimite: fechal || null })
            });
            cargarDetalleLead(l.id, det);   // re-pinta el detalle con la tarea nueva
            cargarResumen();
          } catch { btn.disabled = false; }
        });
      }).catch(function () { estadoError(det, function () { cargarDetalleLead(id, det); }); });
    }

    function cargarCrm() {
      estadoCargando($('adminCrm'));
      api('/api/admin/crm/leads').then(function (r) { return r.json(); }).then(function (lista) {
        crmLeads = lista;
        pintarCrm();
      }).catch(function () { estadoError($('adminCrm'), cargarCrm); });
    }

    // Auto-actualización: cada 20 s refresca la conversación de los leads
    // abiertos (solo las burbujas del chat — no toca lo que estés escribiendo).
    setInterval(function () {
      if (!$('panel-crm') || !$('panel-crm').classList.contains('active')) return;
      document.querySelectorAll('[data-detalle]').forEach(function (det) {
        if (det.style.display === 'none' || !det.dataset.nmsg) return;
        api('/api/admin/crm/leads/' + det.dataset.detalle)
          .then(function (r) { return r.json(); })
          .then(function (l) {
            if (String(l.conversacion.length) === det.dataset.nmsg) return;
            det.dataset.nmsg = l.conversacion.length;
            const chatEl = det.querySelector('.crm-chat');
            if (!chatEl) return;
            chatEl.innerHTML = htmlChat(l.conversacion);
            chatEl.scrollTop = chatEl.scrollHeight;
          }).catch(function () {});
      });
    }, 20_000);

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
              (m.telefono ? ' · <i class="ti ti-phone"></i> ' + esc(m.telefono) : '') +
              (m.empresa ? ' · <i class="ti ti-building"></i> ' + esc(m.empresa) : '') +
              ' · <i class="ti ti-calendar"></i> ' + fecha(m.fechaEnvio) + '</p>' +
            (m.servicio
              ? '<p class="admin-item-meta"><i class="ti ti-category"></i> ' + esc(m.servicio) +
                (m.presupuesto ? ' · <i class="ti ti-coin"></i> ' + esc(m.presupuesto) : '') + '</p>'
              : '') +
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
    cargarCrm();
    cargarAdminMensajes();
    cargarAdminClientes();
  }
})();

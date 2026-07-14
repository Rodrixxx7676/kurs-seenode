// ═══════════════════════════════════════════════════════════════════════════
//  KURS — Servidor Express (port de KursApi de ASP.NET Core a Node.js)
//  Sirve el frontend estático desde /public y expone la misma API:
//    POST /api/auth/registro          POST /api/auth/login
//    POST /api/contacto               GET  /api/contacto (auth)
//    PUT  /api/contacto/:id/leido (auth)
//    GET/POST/PUT/DELETE /api/clientes (auth)
// ═══════════════════════════════════════════════════════════════════════════
const express     = require('express');
const path        = require('path');
const crypto      = require('crypto');
const compression = require('compression');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;

// ── Configuración JWT (mismos issuer/audience que KursApi) ──────────────────
const JWT_KEY      = process.env.JWT_KEY || 'KURS_ClaveSoloParaDesarrollo_NoUsarEnProduccion_2024!';
const JWT_ISSUER   = 'KursApi';
const JWT_AUDIENCE = 'KursFront';
const JWT_HOURS    = parseInt(process.env.JWT_EXPIRES_HOURS || '2', 10);

// ── PostgreSQL ───────────────────────────────────────────────────────────────
// Dev local: puerto 5433 para no chocar con el Postgres nativo de la máquina
const databaseUrl = process.env.DATABASE_URL || 'postgres://kurs_user:kurs_dev@localhost:5433/kurs';
const isLocalDb   = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

// Mismo esquema que creó EF Core (nombres entre comillas = mayúsculas exactas)
async function initSchema() {
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS "SEQ_CLIENTES";
    CREATE SEQUENCE IF NOT EXISTS "SEQ_MENSAJES";
    ALTER SEQUENCE "SEQ_CLIENTES" INCREMENT BY 1;
    ALTER SEQUENCE "SEQ_MENSAJES" INCREMENT BY 1;

    CREATE TABLE IF NOT EXISTS "CLIENTES" (
      "ID"             bigint PRIMARY KEY,
      "NOMBRE"         varchar(200) NOT NULL,
      "EMAIL"          varchar(320) NOT NULL UNIQUE,
      "EMPRESA"        varchar(200),
      "TELEFONO"       varchar(30),
      "PASSWORD_HASH"  varchar(500),
      "FECHA_REGISTRO" timestamptz NOT NULL DEFAULT now(),
      "ACTIVO"         boolean NOT NULL DEFAULT true,
      "NIVEL"          integer NOT NULL DEFAULT 2
    );

    CREATE TABLE IF NOT EXISTS "MENSAJES_CONTACTO" (
      "ID"          bigint PRIMARY KEY,
      "NOMBRE"      varchar(200) NOT NULL,
      "EMAIL"       varchar(320) NOT NULL,
      "ASUNTO"      varchar(300) NOT NULL,
      "MENSAJE"     varchar(4000) NOT NULL,
      "FECHA_ENVIO" timestamptz NOT NULL DEFAULT now(),
      "LEIDO"       boolean NOT NULL DEFAULT false
    );

    CREATE SEQUENCE IF NOT EXISTS "SEQ_PROYECTOS";
    CREATE TABLE IF NOT EXISTS "PROYECTOS" (
      "ID"             bigint PRIMARY KEY,
      "CLIENTE_ID"     bigint NOT NULL REFERENCES "CLIENTES"("ID"),
      "TITULO"         varchar(200) NOT NULL,
      "TIPO"           varchar(60) NOT NULL,
      "DESCRIPCION"    varchar(4000) NOT NULL,
      "PRESUPUESTO"    varchar(60),
      "ESTADO"         varchar(20) NOT NULL DEFAULT 'solicitado',
      "FECHA_SOLICITUD" timestamptz NOT NULL DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS "SEQ_PROVEEDORES";
    CREATE TABLE IF NOT EXISTS "PROVEEDORES" (
      "ID"              bigint PRIMARY KEY,
      "RAZON_SOCIAL"    varchar(200) NOT NULL,
      "RUC"             varchar(11) NOT NULL,
      "REPRESENTANTE"   varchar(200) NOT NULL,
      "EMAIL"           varchar(320) NOT NULL,
      "TELEFONO"        varchar(30) NOT NULL,
      "CATEGORIA"       varchar(100) NOT NULL,
      "DESCRIPCION"     varchar(4000),
      "WEB"             varchar(300),
      "FECHA_SOLICITUD" timestamptz NOT NULL DEFAULT now(),
      "ESTADO"          varchar(20) NOT NULL DEFAULT 'pendiente'
    );

    ALTER TABLE "CLIENTES"  ADD COLUMN IF NOT EXISTS "ULTIMO_ACCESO" timestamptz;
    ALTER TABLE "PROYECTOS" ADD COLUMN IF NOT EXISTS "NOTA_ADMIN" varchar(1000);
  `);
}

// ── Mapeo de filas a JSON camelCase (igual que serializaba ASP.NET) ─────────
const mapCliente = (r) => ({
  id: Number(r.ID), nombre: r.NOMBRE, email: r.EMAIL, empresa: r.EMPRESA,
  telefono: r.TELEFONO, fechaRegistro: r.FECHA_REGISTRO, activo: r.ACTIVO, nivel: r.NIVEL
});
const mapMensaje = (r) => ({
  id: Number(r.ID), nombre: r.NOMBRE, email: r.EMAIL, asunto: r.ASUNTO,
  mensaje: r.MENSAJE, fechaEnvio: r.FECHA_ENVIO, leido: r.LEIDO
});

// ── Throttle de login (port de LoginThrottleService) ────────────────────────
// 5 intentos fallidos por email → bloqueo 15 min. 5 peticiones/min por IP.
const MAX_FALLOS = 5, BLOQUEO_MIN = 15;
const fallosPorEmail = new Map();   // email → { fallos, bloqueadoHasta }
const peticionesPorIp = new Map();  // ip → [timestamps]

function rateLimitLogin(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip;
  const historial = (peticionesPorIp.get(ip) || []).filter(t => ahora - t < 60_000);
  if (historial.length >= 5) {
    return res.status(429).json({ mensaje: 'Demasiados intentos. Espera un minuto.' });
  }
  historial.push(ahora);
  peticionesPorIp.set(ip, historial);
  next();
}

// ── Sesión por cookie httpOnly ───────────────────────────────────────────────
// El JWT viaja en una cookie que JavaScript no puede leer (inmune a robo por
// XSS). Se acepta también Authorization: Bearer para clientes de API.
const COOKIE_SESION = 'kurs_sesion';

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const par of cabecera.split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) {
      return decodeURIComponent(par.slice(i + 1).trim());
    }
  }
  return null;
}

// ── Middleware de autenticación JWT ──────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = leerCookie(req, COOKIE_SESION) ||
                (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ mensaje: 'No autorizado.' });
  try {
    req.user = jwt.verify(token, JWT_KEY, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado.' });
  }
}

// Niveles (mismos del modelo original): 1=Visitante, 2=Cliente, 3=Colaborador, 4=Administrador
function requireAdmin(req, res, next) {
  if (parseInt(req.user?.nivel, 10) >= 4) return next();
  return res.status(403).json({ mensaje: 'Requiere permisos de administrador.' });
}

// Correos que se promueven a administrador al iniciar sesión (env ADMIN_EMAILS,
// separados por coma). Evita tener que tocar la BD a mano.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hash de relleno: se compara cuando el correo no existe, para que el login
// tarde lo mismo exista o no la cuenta (evita enumeración de correos).
// Se calcula en segundo plano para no retrasar el arranque del servidor.
let HASH_RELLENO = null;
bcrypt.hash(crypto.randomUUID(), 11, function (err, h) {
  if (!err) HASH_RELLENO = h;
});

// ── reCAPTCHA v3 ─────────────────────────────────────────────────────────────
// La clave de sitio es pública (va al navegador); la secreta va por env.
// Si no hay clave secreta configurada, la verificación se omite (útil en local).
const RECAPTCHA_SITE_KEY  = process.env.RECAPTCHA_SITE_KEY  || '';
const RECAPTCHA_SECRET    = process.env.RECAPTCHA_SECRET    || '';
const RECAPTCHA_MIN_SCORE = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');

async function verificarRecaptcha(token) {
  if (!RECAPTCHA_SECRET) return { ok: true, omitido: true };   // no configurado → no bloquear
  if (!token) return { ok: false };
  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token });
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    const data = await resp.json();
    return { ok: data.success === true && (data.score ?? 1) >= RECAPTCHA_MIN_SCORE, score: data.score };
  } catch (err) {
    console.error('recaptcha:', err.message);
    return { ok: false };
  }
}

const app = express();
app.set('trust proxy', 1);          // Seenode termina TLS en su proxy
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '32kb' }));

// ── Cabeceras de seguridad ───────────────────────────────────────────────────
// CSP: solo se permiten los orígenes que el sitio realmente usa
// (Google Fonts, íconos de jsdelivr y reCAPTCHA).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data:",
  "connect-src 'self' https://www.google.com",
  "frame-src https://www.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  next();
});

// ── Rate limiting ────────────────────────────────────────────────────────────
// Límite general de API + límites estrictos en endpoints sensibles.
function crearLimitador(max, ventanaMs, mensaje) {
  const porIp = new Map();
  setInterval(function limpiar() {
    const ahora = Date.now();
    porIp.forEach((arr, ip) => {
      const vivos = arr.filter(t => ahora - t < ventanaMs);
      if (vivos.length) porIp.set(ip, vivos); else porIp.delete(ip);
    });
  }, 10 * 60_000).unref();

  return (req, res, next) => {
    const ahora = Date.now();
    const arr = (porIp.get(req.ip) || []).filter(t => ahora - t < ventanaMs);
    if (arr.length >= max) {
      return res.status(429).json({ mensaje: mensaje || 'Demasiadas peticiones. Intenta en un momento.' });
    }
    arr.push(ahora);
    porIp.set(req.ip, arr);
    next();
  };
}
app.use('/api/', crearLimitador(120, 60_000));                       // general: 120/min por IP
const limiteRegistro = crearLimitador(5, 60_000,
  'Demasiados registros desde esta conexión. Espera un minuto.');    // anti-creación masiva

// ── Política de contraseñas (misma que valida el frontend) ──────────────────
function passwordFuerte(p) {
  return typeof p === 'string' && p.length >= 7 && p.length <= 100 &&
         /[A-Z]/.test(p) && /\d/.test(p) &&
         /[!@#$%^&*()_+\-=\[\]{}|;':",.\/<>?]/.test(p);
}
const MSG_PASSWORD = 'La contraseña debe tener mínimo 7 caracteres, una mayúscula, un número y un carácter especial.';

// ── Diagnóstico rápido: GET /api/salud ──────────────────────────────────────
let dbLista = false;
app.get('/api/salud', (_req, res) => {
  res.json({ servidor: 'ok', baseDeDatos: dbLista ? 'conectada' : 'sin conexión' });
});

// ── Configuración pública para el frontend ───────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({ recaptchaSiteKey: RECAPTCHA_SITE_KEY });
});

// ═════════════════════════ AUTH ═════════════════════════

// POST /api/auth/registro
app.post('/api/auth/registro', limiteRegistro, async (req, res) => {
  const { nombre, email, password, empresa } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ mensaje: 'Nombre, correo y contraseña son obligatorios.' });
  }
  if (!EMAIL_RE.test(email.trim()) || nombre.trim().length > 200 ||
      email.trim().length > 320 || (empresa?.trim().length ?? 0) > 200) {
    return res.status(400).json({ mensaje: 'Datos inválidos o demasiado largos.' });
  }
  if (!passwordFuerte(password)) {
    return res.status(400).json({ mensaje: MSG_PASSWORD });
  }
  if (!(await verificarRecaptcha(req.body?.recaptchaToken)).ok) {
    return res.status(400).json({ mensaje: 'Verificación anti-robot fallida. Recarga la página e inténtalo de nuevo.' });
  }

  const emailNorm = email.trim().toLowerCase();
  try {
    const existe = await pool.query('SELECT 1 FROM "CLIENTES" WHERE "EMAIL" = $1', [emailNorm]);
    if (existe.rowCount > 0) {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo electrónico.' });
    }

    const hash = bcrypt.hashSync(password, 11);
    const ins = await pool.query(
      `INSERT INTO "CLIENTES" ("ID","NOMBRE","EMAIL","EMPRESA","PASSWORD_HASH","FECHA_REGISTRO","ACTIVO","NIVEL")
       VALUES (nextval('"SEQ_CLIENTES"'), $1, $2, $3, $4, now(), true, 2)
       RETURNING "ID"`,
      [nombre.trim(), emailNorm, empresa?.trim() || null, hash]
    );

    res.json({ mensaje: 'Cuenta creada correctamente.', id: Number(ins.rows[0].ID) });
  } catch (err) {
    console.error('registro:', err);
    res.status(500).json({ mensaje: 'Error interno al crear la cuenta.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', rateLimitLogin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios.' });
  }

  const emailNorm = email.trim().toLowerCase();
  const estado = fallosPorEmail.get(emailNorm);

  if (estado?.bloqueadoHasta && Date.now() < estado.bloqueadoHasta) {
    const restantes = Math.ceil((estado.bloqueadoHasta - Date.now()) / 60_000);
    return res.status(429).json({ mensaje: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${restantes} minuto(s).` });
  }

  try {
    const q = await pool.query(
      'SELECT * FROM "CLIENTES" WHERE "EMAIL" = $1 AND "ACTIVO" = true', [emailNorm]);
    const cliente = q.rows[0];

    // Mensaje genérico y comparación SIEMPRE contra un hash (real o de relleno)
    // → el tiempo de respuesta no revela si el correo existe.
    const hashComparar = cliente?.PASSWORD_HASH || HASH_RELLENO;
    const passwordOk = !!hashComparar && bcrypt.compareSync(password, hashComparar) &&
                       !!cliente?.PASSWORD_HASH;
    if (!passwordOk) {
      const fallos = (estado?.fallos || 0) + 1;
      fallosPorEmail.set(emailNorm, {
        fallos,
        bloqueadoHasta: fallos >= MAX_FALLOS ? Date.now() + BLOQUEO_MIN * 60_000 : null
      });
      return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
    }

    fallosPorEmail.delete(emailNorm);

    // Promoción automática a administrador si el correo está en ADMIN_EMAILS
    if (ADMIN_EMAILS.includes(emailNorm) && cliente.NIVEL < 4) {
      await pool.query('UPDATE "CLIENTES" SET "NIVEL" = 4 WHERE "ID" = $1', [cliente.ID]);
      cliente.NIVEL = 4;
    }

    // Último acceso: se muestra al usuario el anterior y se registra el actual
    const accesoAnterior = cliente.ULTIMO_ACCESO;
    await pool.query('UPDATE "CLIENTES" SET "ULTIMO_ACCESO" = now() WHERE "ID" = $1', [cliente.ID]);

    const expira = new Date(Date.now() + JWT_HOURS * 3_600_000);
    const token = jwt.sign(
      { sub: String(cliente.ID), email: cliente.EMAIL, name: cliente.NOMBRE, nivel: String(cliente.NIVEL) },
      JWT_KEY,
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: JWT_HOURS * 3600, jwtid: crypto.randomUUID() }
    );

    // El token va SOLO en la cookie httpOnly: JavaScript no puede leerlo
    res.cookie(COOKIE_SESION, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: JWT_HOURS * 3_600_000,
      path: '/'
    });

    res.json({
      expira: expira.toISOString(),
      nombre: cliente.NOMBRE, email: cliente.EMAIL, nivel: cliente.NIVEL,
      ultimoAcceso: accesoAnterior
    });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ mensaje: 'Error interno al iniciar sesión.' });
  }
});

// POST /api/auth/logout — borra la cookie de sesión
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_SESION, { httpOnly: true, sameSite: 'strict', path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});

// ═════════════════════════ CONTACTO ═════════════════════════

// POST /api/contacto — público, guarda el formulario de contacto
app.post('/api/contacto', async (req, res) => {
  const { nombre, email, asunto, mensaje } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !asunto?.trim() || !mensaje?.trim()) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }
  if (!EMAIL_RE.test(email.trim()) || nombre.trim().length > 200 ||
      email.trim().length > 320 || asunto.trim().length > 300 || mensaje.trim().length > 4000) {
    return res.status(400).json({ mensaje: 'Datos inválidos o demasiado largos.' });
  }
  if (!(await verificarRecaptcha(req.body?.recaptchaToken)).ok) {
    return res.status(400).json({ mensaje: 'Verificación anti-robot fallida. Recarga la página e inténtalo de nuevo.' });
  }

  try {
    await pool.query(
      `INSERT INTO "MENSAJES_CONTACTO" ("ID","NOMBRE","EMAIL","ASUNTO","MENSAJE","FECHA_ENVIO","LEIDO")
       VALUES (nextval('"SEQ_MENSAJES"'), $1, $2, $3, $4, now(), false)`,
      [nombre.trim(), email.trim(), asunto.trim(), mensaje.trim()]
    );
    res.json({ mensaje: 'Mensaje recibido. ¡Nos pondremos en contacto pronto!' });
  } catch (err) {
    console.error('contacto:', err);
    res.status(500).json({ mensaje: 'Error interno al guardar el mensaje.' });
  }
});

// GET /api/contacto — lista para uso administrativo
app.get('/api/contacto', requireAuth, requireAdmin, async (_req, res) => {
  const q = await pool.query('SELECT * FROM "MENSAJES_CONTACTO" ORDER BY "FECHA_ENVIO" DESC');
  res.json(q.rows.map(mapMensaje));
});

// PUT /api/contacto/:id/leido
app.put('/api/contacto/:id(\\d+)/leido', requireAuth, requireAdmin, async (req, res) => {
  const q = await pool.query(
    'UPDATE "MENSAJES_CONTACTO" SET "LEIDO" = true WHERE "ID" = $1 RETURNING *', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Mensaje no encontrado.' });
  res.json(mapMensaje(q.rows[0]));
});

// ═════════════════════════ MI CUENTA (usuario autenticado sobre sí mismo) ═════════════════════════

// GET /api/cuenta — perfil del usuario en sesión
app.get('/api/cuenta', requireAuth, async (req, res) => {
  const q = await pool.query(
    'SELECT "ID","NOMBRE","EMAIL","EMPRESA","TELEFONO","FECHA_REGISTRO","NIVEL" FROM "CLIENTES" WHERE "ID" = $1',
    [req.user.sub]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Cuenta no encontrada.' });
  const c = q.rows[0];
  res.json({ id: Number(c.ID), nombre: c.NOMBRE, email: c.EMAIL, empresa: c.EMPRESA,
             telefono: c.TELEFONO, fechaRegistro: c.FECHA_REGISTRO, nivel: c.NIVEL });
});

// PUT /api/cuenta — actualizar nombre, empresa y teléfono propios
app.put('/api/cuenta', requireAuth, async (req, res) => {
  const { nombre, empresa, telefono } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es obligatorio.' });
  if (nombre.trim().length > 200 || (empresa?.trim().length ?? 0) > 200 || (telefono?.trim().length ?? 0) > 30) {
    return res.status(400).json({ mensaje: 'Datos demasiado largos.' });
  }
  const q = await pool.query(
    `UPDATE "CLIENTES" SET "NOMBRE" = $1, "EMPRESA" = $2, "TELEFONO" = $3 WHERE "ID" = $4
     RETURNING "NOMBRE","EMPRESA","TELEFONO"`,
    [nombre.trim(), empresa?.trim() || null, telefono?.trim() || null, req.user.sub]);
  res.json({ mensaje: 'Datos actualizados correctamente.', ...q.rows[0] });
});

// PUT /api/cuenta/password — cambiar la propia contraseña
app.put('/api/cuenta/password', requireAuth, async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) return res.status(400).json({ mensaje: 'Debes indicar la contraseña actual y la nueva.' });
  if (!passwordFuerte(nueva)) {
    return res.status(400).json({ mensaje: MSG_PASSWORD });
  }

  const q = await pool.query('SELECT "PASSWORD_HASH" FROM "CLIENTES" WHERE "ID" = $1', [req.user.sub]);
  const hash = q.rows[0]?.PASSWORD_HASH;
  if (!hash || !bcrypt.compareSync(actual, hash)) {
    return res.status(400).json({ mensaje: 'La contraseña actual no es correcta.' });
  }

  await pool.query('UPDATE "CLIENTES" SET "PASSWORD_HASH" = $1 WHERE "ID" = $2',
    [bcrypt.hashSync(nueva, 11), req.user.sub]);
  res.json({ mensaje: 'Contraseña actualizada correctamente.' });
});

// GET /api/cuenta/datos — descarga de todos los datos del usuario (portabilidad)
app.get('/api/cuenta/datos', requireAuth, async (req, res) => {
  const perfil = await pool.query(
    'SELECT "NOMBRE","EMAIL","EMPRESA","TELEFONO","FECHA_REGISTRO","NIVEL" FROM "CLIENTES" WHERE "ID" = $1',
    [req.user.sub]);
  if (perfil.rowCount === 0) return res.status(404).json({ mensaje: 'Cuenta no encontrada.' });

  const proyectos = await pool.query(
    'SELECT "TITULO","TIPO","DESCRIPCION","PRESUPUESTO","ESTADO","FECHA_SOLICITUD" FROM "PROYECTOS" WHERE "CLIENTE_ID" = $1 ORDER BY "FECHA_SOLICITUD"',
    [req.user.sub]);

  const p = perfil.rows[0];
  res.set('Content-Disposition', 'attachment; filename="kurs-mis-datos.json"');
  res.json({
    exportadoEl: new Date().toISOString(),
    perfil: { nombre: p.NOMBRE, email: p.EMAIL, empresa: p.EMPRESA, telefono: p.TELEFONO,
              fechaRegistro: p.FECHA_REGISTRO, nivel: p.NIVEL },
    proyectos: proyectos.rows.map(r => ({
      titulo: r.TITULO, tipo: r.TIPO, descripcion: r.DESCRIPCION,
      presupuesto: r.PRESUPUESTO, estado: r.ESTADO, fechaSolicitud: r.FECHA_SOLICITUD, notaAdmin: r.NOTA_ADMIN
    }))
  });
});

// DELETE /api/cuenta — desactiva la cuenta (requiere confirmar la contraseña)
app.delete('/api/cuenta', requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ mensaje: 'Debes confirmar tu contraseña.' });

  const q = await pool.query('SELECT "PASSWORD_HASH" FROM "CLIENTES" WHERE "ID" = $1', [req.user.sub]);
  const hash = q.rows[0]?.PASSWORD_HASH;
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(400).json({ mensaje: 'La contraseña no es correcta.' });
  }

  await pool.query('UPDATE "CLIENTES" SET "ACTIVO" = false WHERE "ID" = $1', [req.user.sub]);
  res.json({ mensaje: 'Tu cuenta fue eliminada. Gracias por habernos acompañado.' });
});

// GET /api/cuenta/proyectos — proyectos solicitados por el usuario
app.get('/api/cuenta/proyectos', requireAuth, async (req, res) => {
  const q = await pool.query(
    'SELECT * FROM "PROYECTOS" WHERE "CLIENTE_ID" = $1 ORDER BY "FECHA_SOLICITUD" DESC', [req.user.sub]);
  res.json(q.rows.map(r => ({
    id: Number(r.ID), titulo: r.TITULO, tipo: r.TIPO, descripcion: r.DESCRIPCION,
    presupuesto: r.PRESUPUESTO, estado: r.ESTADO, fechaSolicitud: r.FECHA_SOLICITUD, notaAdmin: r.NOTA_ADMIN
  })));
});

// POST /api/cuenta/proyectos — solicitar un nuevo proyecto
app.post('/api/cuenta/proyectos', requireAuth, async (req, res) => {
  const { titulo, tipo, descripcion, presupuesto } = req.body || {};
  if (!titulo?.trim() || !tipo?.trim() || !descripcion?.trim()) {
    return res.status(400).json({ mensaje: 'Título, tipo y descripción son obligatorios.' });
  }
  if (titulo.trim().length > 200 || tipo.trim().length > 60 ||
      descripcion.trim().length > 4000 || (presupuesto?.trim().length ?? 0) > 60) {
    return res.status(400).json({ mensaje: 'Datos demasiado largos.' });
  }

  const ins = await pool.query(
    `INSERT INTO "PROYECTOS" ("ID","CLIENTE_ID","TITULO","TIPO","DESCRIPCION","PRESUPUESTO")
     VALUES (nextval('"SEQ_PROYECTOS"'), $1, $2, $3, $4, $5) RETURNING "ID"`,
    [req.user.sub, titulo.trim(), tipo.trim(), descripcion.trim(), presupuesto?.trim() || null]);
  res.json({ mensaje: '¡Proyecto solicitado! Te contactaremos pronto.', id: Number(ins.rows[0].ID) });
});

// PUT /api/cuenta/proyectos/:id/cancelar — solo proyectos propios aún no iniciados
app.put('/api/cuenta/proyectos/:id(\\d+)/cancelar', requireAuth, async (req, res) => {
  const q = await pool.query(
    `UPDATE "PROYECTOS" SET "ESTADO" = 'cancelado'
     WHERE "ID" = $1 AND "CLIENTE_ID" = $2 AND "ESTADO" = 'solicitado'`,
    [req.params.id, req.user.sub]);
  if (q.rowCount === 0) {
    return res.status(400).json({ mensaje: 'Solo puedes cancelar solicitudes que aún no hemos iniciado.' });
  }
  res.json({ mensaje: 'Solicitud cancelada.' });
});

// ═════════════════════════ PROVEEDORES ═════════════════════════

// POST /api/proveedores — público, guarda la solicitud del portal de proveedores
app.post('/api/proveedores', async (req, res) => {
  const { razonSocial, ruc, representante, email, telefono, categoria, descripcion, web } = req.body || {};

  if (!razonSocial?.trim() || !representante?.trim() || !email?.trim() ||
      !telefono?.trim() || !categoria?.trim()) {
    return res.status(400).json({ mensaje: 'Completa todos los campos obligatorios.' });
  }
  if (!/^\d{11}$/.test(ruc?.trim() || '')) {
    return res.status(400).json({ mensaje: 'El RUC debe tener 11 dígitos.' });
  }
  if (!EMAIL_RE.test(email.trim()) || razonSocial.trim().length > 200 ||
      representante.trim().length > 200 || email.trim().length > 320 ||
      telefono.trim().length > 30 || categoria.trim().length > 100 ||
      (descripcion?.trim().length ?? 0) > 4000 || (web?.trim().length ?? 0) > 300) {
    return res.status(400).json({ mensaje: 'Datos inválidos o demasiado largos.' });
  }
  if (!(await verificarRecaptcha(req.body?.recaptchaToken)).ok) {
    return res.status(400).json({ mensaje: 'Verificación anti-robot fallida. Recarga la página e inténtalo de nuevo.' });
  }

  try {
    await pool.query(
      `INSERT INTO "PROVEEDORES"
         ("ID","RAZON_SOCIAL","RUC","REPRESENTANTE","EMAIL","TELEFONO","CATEGORIA","DESCRIPCION","WEB")
       VALUES (nextval('"SEQ_PROVEEDORES"'), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [razonSocial.trim(), ruc.trim(), representante.trim(), email.trim(),
       telefono.trim(), categoria.trim(), descripcion?.trim() || null, web?.trim() || null]
    );
    res.json({ mensaje: 'Solicitud recibida. Nos pondremos en contacto en los próximos 3 días hábiles.' });
  } catch (err) {
    console.error('proveedores:', err);
    res.status(500).json({ mensaje: 'Error interno al guardar la solicitud.' });
  }
});

// GET /api/proveedores — lista para uso administrativo
app.get('/api/proveedores', requireAuth, requireAdmin, async (_req, res) => {
  const q = await pool.query('SELECT * FROM "PROVEEDORES" ORDER BY "FECHA_SOLICITUD" DESC');
  res.json(q.rows.map(r => ({
    id: Number(r.ID), razonSocial: r.RAZON_SOCIAL, ruc: r.RUC, representante: r.REPRESENTANTE,
    email: r.EMAIL, telefono: r.TELEFONO, categoria: r.CATEGORIA, descripcion: r.DESCRIPCION,
    web: r.WEB, fechaSolicitud: r.FECHA_SOLICITUD, estado: r.ESTADO
  })));
});

// ═════════════════════════ CLIENTES (CRUD, requiere JWT) ═════════════════════════

app.get('/api/clientes', requireAuth, requireAdmin, async (_req, res) => {
  const q = await pool.query(
    'SELECT * FROM "CLIENTES" WHERE "ACTIVO" = true ORDER BY "FECHA_REGISTRO" DESC');
  res.json(q.rows.map(mapCliente));
});

app.get('/api/clientes/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const q = await pool.query('SELECT * FROM "CLIENTES" WHERE "ID" = $1', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  res.json(mapCliente(q.rows[0]));
});

app.post('/api/clientes', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, email, empresa, telefono } = req.body || {};
  if (!nombre?.trim() || !email?.trim()) {
    return res.status(400).json({ mensaje: 'Nombre y correo son obligatorios.' });
  }

  const existe = await pool.query('SELECT 1 FROM "CLIENTES" WHERE "EMAIL" = $1', [email.trim()]);
  if (existe.rowCount > 0) {
    return res.status(409).json({ mensaje: 'Ya existe un cliente con ese correo electrónico.' });
  }

  const ins = await pool.query(
    `INSERT INTO "CLIENTES" ("ID","NOMBRE","EMAIL","EMPRESA","TELEFONO","FECHA_REGISTRO","ACTIVO","NIVEL")
     VALUES (nextval('"SEQ_CLIENTES"'), $1, $2, $3, $4, now(), true, 2)
     RETURNING *`,
    [nombre.trim(), email.trim(), empresa || null, telefono || null]
  );
  res.status(201).json(mapCliente(ins.rows[0]));
});

app.put('/api/clientes/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, email, empresa, telefono, activo } = req.body || {};
  const id = req.params.id;

  const actual = await pool.query('SELECT 1 FROM "CLIENTES" WHERE "ID" = $1', [id]);
  if (actual.rowCount === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });

  const enUso = await pool.query(
    'SELECT 1 FROM "CLIENTES" WHERE "EMAIL" = $1 AND "ID" <> $2', [email, id]);
  if (enUso.rowCount > 0) {
    return res.status(409).json({ mensaje: 'Ese correo ya está en uso por otro cliente.' });
  }

  const upd = await pool.query(
    `UPDATE "CLIENTES" SET "NOMBRE" = $1, "EMAIL" = $2, "EMPRESA" = $3, "TELEFONO" = $4, "ACTIVO" = $5
     WHERE "ID" = $6 RETURNING *`,
    [nombre, email, empresa || null, telefono || null, activo ?? true, id]
  );
  res.json(mapCliente(upd.rows[0]));
});

// Baja lógica (Activo = false), igual que en KursApi
app.delete('/api/clientes/:id(\\d+)', requireAuth, requireAdmin, async (req, res) => {
  const q = await pool.query(
    'UPDATE "CLIENTES" SET "ACTIVO" = false WHERE "ID" = $1', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  res.status(204).end();
});

// ═════════════════════════ ADMINISTRACIÓN (nivel 4) ═════════════════════════

// Estados válidos por entidad → evita que se guarde cualquier texto
const ESTADOS_PROYECTO   = ['solicitado', 'en_progreso', 'entregado', 'cancelado'];
const ESTADOS_PROVEEDOR  = ['pendiente', 'aprobado', 'rechazado'];

// GET /api/admin/resumen — conteos para el dashboard
app.get('/api/admin/resumen', requireAuth, requireAdmin, async (_req, res) => {
  const q = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM "CLIENTES" WHERE "ACTIVO" = true)              AS clientes,
      (SELECT COUNT(*) FROM "MENSAJES_CONTACTO")                           AS mensajes,
      (SELECT COUNT(*) FROM "MENSAJES_CONTACTO" WHERE "LEIDO" = false)     AS mensajes_no_leidos,
      (SELECT COUNT(*) FROM "PROYECTOS")                                   AS proyectos,
      (SELECT COUNT(*) FROM "PROYECTOS" WHERE "ESTADO" = 'solicitado')     AS proyectos_nuevos,
      (SELECT COUNT(*) FROM "PROVEEDORES")                                 AS proveedores,
      (SELECT COUNT(*) FROM "PROVEEDORES" WHERE "ESTADO" = 'pendiente')    AS proveedores_pendientes
  `);
  const r = q.rows[0];
  res.json({
    clientes: Number(r.clientes),
    mensajes: Number(r.mensajes), mensajesNoLeidos: Number(r.mensajes_no_leidos),
    proyectos: Number(r.proyectos), proyectosNuevos: Number(r.proyectos_nuevos),
    proveedores: Number(r.proveedores), proveedoresPendientes: Number(r.proveedores_pendientes)
  });
});

// GET /api/admin/proyectos — todos los proyectos con el nombre del cliente
app.get('/api/admin/proyectos', requireAuth, requireAdmin, async (_req, res) => {
  const q = await pool.query(`
    SELECT p.*, c."NOMBRE" AS cliente_nombre, c."EMAIL" AS cliente_email
    FROM "PROYECTOS" p JOIN "CLIENTES" c ON c."ID" = p."CLIENTE_ID"
    ORDER BY p."FECHA_SOLICITUD" DESC`);
  res.json(q.rows.map(r => ({
    id: Number(r.ID), clienteNombre: r.cliente_nombre, clienteEmail: r.cliente_email,
    titulo: r.TITULO, tipo: r.TIPO, descripcion: r.DESCRIPCION, presupuesto: r.PRESUPUESTO,
    estado: r.ESTADO, fechaSolicitud: r.FECHA_SOLICITUD, notaAdmin: r.NOTA_ADMIN
  })));
});

// PUT /api/admin/proyectos/:id/estado — cambiar el estado de un proyecto
app.put('/api/admin/proyectos/:id(\\d+)/estado', requireAuth, requireAdmin, async (req, res) => {
  const estado = (req.body?.estado || '').trim();
  if (!ESTADOS_PROYECTO.includes(estado)) {
    return res.status(400).json({ mensaje: 'Estado no válido.' });
  }
  const q = await pool.query(
    'UPDATE "PROYECTOS" SET "ESTADO" = $1 WHERE "ID" = $2', [estado, req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Proyecto no encontrado.' });
  res.json({ mensaje: 'Estado actualizado.', estado });
});

// PUT /api/admin/proyectos/:id/nota — nota del equipo visible para el cliente
app.put('/api/admin/proyectos/:id(\\d+)/nota', requireAuth, requireAdmin, async (req, res) => {
  const nota = (req.body?.nota || '').trim();
  if (nota.length > 1000) {
    return res.status(400).json({ mensaje: 'La nota no puede superar los 1000 caracteres.' });
  }
  const q = await pool.query(
    'UPDATE "PROYECTOS" SET "NOTA_ADMIN" = $1 WHERE "ID" = $2', [nota || null, req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Proyecto no encontrado.' });
  res.json({ mensaje: 'Nota guardada.' });
});

// PUT /api/admin/proveedores/:id/estado — aprobar o rechazar un proveedor
app.put('/api/admin/proveedores/:id(\\d+)/estado', requireAuth, requireAdmin, async (req, res) => {
  const estado = (req.body?.estado || '').trim();
  if (!ESTADOS_PROVEEDOR.includes(estado)) {
    return res.status(400).json({ mensaje: 'Estado no válido.' });
  }
  const q = await pool.query(
    'UPDATE "PROVEEDORES" SET "ESTADO" = $1 WHERE "ID" = $2', [estado, req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Proveedor no encontrado.' });
  res.json({ mensaje: 'Estado actualizado.', estado });
});

// ═════════════════════════ FRONTEND ═════════════════════════
// extensions: ['html'] → /login sirve login.html, /contacto sirve contacto.html, etc.
// Los HTML no se cachean (para que los deploys se vean al instante);
// css/js/imágenes sí, una semana.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  }
}));

// Rutas inexistentes → misma página 404 que mostraba el router de Blazor
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// El servidor arranca aunque la BD no responda: así el sitio estático sigue
// vivo y /api/salud permite diagnosticar. El esquema se reintenta cada 10 s.
app.listen(PORT, () => console.log(`KURS escuchando en puerto ${PORT}`));

(async function conectarBd() {
  for (;;) {
    try {
      await initSchema();
      dbLista = true;
      console.log('Base de datos lista.');
      return;
    } catch (err) {
      console.error('Base de datos no disponible, reintento en 10 s:', err.message);
      await new Promise(r => setTimeout(r, 10_000));
    }
  }
})();

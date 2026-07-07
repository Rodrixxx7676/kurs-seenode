// ═══════════════════════════════════════════════════════════════════════════
//  KURS — Servidor Express (port de KursApi de ASP.NET Core a Node.js)
//  Sirve el frontend estático desde /public y expone la misma API:
//    POST /api/auth/registro          POST /api/auth/login
//    POST /api/contacto               GET  /api/contacto (auth)
//    PUT  /api/contacto/:id/leido (auth)
//    GET/POST/PUT/DELETE /api/clientes (auth)
// ═══════════════════════════════════════════════════════════════════════════
const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
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

// ── Middleware de autenticación JWT ──────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ mensaje: 'No autorizado.' });
  try {
    req.user = jwt.verify(token, JWT_KEY, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado.' });
  }
}

const app = express();
app.set('trust proxy', 1);          // Seenode termina TLS en su proxy
app.use(express.json());

// ═════════════════════════ AUTH ═════════════════════════

// POST /api/auth/registro
app.post('/api/auth/registro', async (req, res) => {
  const { nombre, email, password, empresa } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ mensaje: 'Nombre, correo y contraseña son obligatorios.' });
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

    // Mensaje genérico → no revelar si el email existe o no
    if (!cliente?.PASSWORD_HASH || !bcrypt.compareSync(password, cliente.PASSWORD_HASH)) {
      const fallos = (estado?.fallos || 0) + 1;
      fallosPorEmail.set(emailNorm, {
        fallos,
        bloqueadoHasta: fallos >= MAX_FALLOS ? Date.now() + BLOQUEO_MIN * 60_000 : null
      });
      return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
    }

    fallosPorEmail.delete(emailNorm);

    const expira = new Date(Date.now() + JWT_HOURS * 3_600_000);
    const token = jwt.sign(
      { sub: String(cliente.ID), email: cliente.EMAIL, name: cliente.NOMBRE, nivel: String(cliente.NIVEL) },
      JWT_KEY,
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: JWT_HOURS * 3600, jwtid: crypto.randomUUID() }
    );

    res.json({
      token, expira: expira.toISOString(),
      nombre: cliente.NOMBRE, email: cliente.EMAIL, nivel: cliente.NIVEL
    });
  } catch (err) {
    console.error('login:', err);
    res.status(500).json({ mensaje: 'Error interno al iniciar sesión.' });
  }
});

// ═════════════════════════ CONTACTO ═════════════════════════

// POST /api/contacto — público, guarda el formulario de contacto
app.post('/api/contacto', async (req, res) => {
  const { nombre, email, asunto, mensaje } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !asunto?.trim() || !mensaje?.trim()) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
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
app.get('/api/contacto', requireAuth, async (_req, res) => {
  const q = await pool.query('SELECT * FROM "MENSAJES_CONTACTO" ORDER BY "FECHA_ENVIO" DESC');
  res.json(q.rows.map(mapMensaje));
});

// PUT /api/contacto/:id/leido
app.put('/api/contacto/:id(\\d+)/leido', requireAuth, async (req, res) => {
  const q = await pool.query(
    'UPDATE "MENSAJES_CONTACTO" SET "LEIDO" = true WHERE "ID" = $1 RETURNING *', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Mensaje no encontrado.' });
  res.json(mapMensaje(q.rows[0]));
});

// ═════════════════════════ CLIENTES (CRUD, requiere JWT) ═════════════════════════

app.get('/api/clientes', requireAuth, async (_req, res) => {
  const q = await pool.query(
    'SELECT * FROM "CLIENTES" WHERE "ACTIVO" = true ORDER BY "FECHA_REGISTRO" DESC');
  res.json(q.rows.map(mapCliente));
});

app.get('/api/clientes/:id(\\d+)', requireAuth, async (req, res) => {
  const q = await pool.query('SELECT * FROM "CLIENTES" WHERE "ID" = $1', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  res.json(mapCliente(q.rows[0]));
});

app.post('/api/clientes', requireAuth, async (req, res) => {
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

app.put('/api/clientes/:id(\\d+)', requireAuth, async (req, res) => {
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
app.delete('/api/clientes/:id(\\d+)', requireAuth, async (req, res) => {
  const q = await pool.query(
    'UPDATE "CLIENTES" SET "ACTIVO" = false WHERE "ID" = $1', [req.params.id]);
  if (q.rowCount === 0) return res.status(404).json({ mensaje: 'Cliente no encontrado.' });
  res.status(204).end();
});

// ═════════════════════════ FRONTEND ═════════════════════════
// extensions: ['html'] → /login sirve login.html, /contacto sirve contacto.html, etc.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

initSchema()
  .then(() => app.listen(PORT, () => console.log(`KURS escuchando en puerto ${PORT}`)))
  .catch(err => { console.error('No se pudo inicializar la base de datos:', err); process.exit(1); });

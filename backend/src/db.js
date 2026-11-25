const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

const dbTracer = trace.getTracer('sqlite-db');
let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/app.db');
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    db = new sqlite3.Database(dbPath);
  }
  return db;
}

function traceQuery(operation, sql, executor) {
  return dbTracer.startActiveSpan(
    `sqlite.${operation}`,
    {
      attributes: {
        'db.system': 'sqlite',
        'db.operation': operation,
        'db.statement': sql.replace(/\s+/g, ' ').trim(),
      },
    },
    (span) =>
      new Promise((resolve, reject) => {
        executor((err, result) => {
          if (err) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.end();
            return reject(err);
          }
          span.end();
          return resolve(result);
        });
      })
  );
}

function dbRun(sql, params = []) {
  return traceQuery('RUN', sql, (done) => {
    getDb().run(sql, params, function (err) {
      if (err) return done(err);
      done(null, { id: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return traceQuery('GET', sql, (done) => {
    getDb().get(sql, params, (err, row) => done(err, row));
  });
}

function dbAll(sql, params = []) {
  return traceQuery('ALL', sql, (done) => {
    getDb().all(sql, params, (err, rows) => done(err, rows));
  });
}

async function initDb() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@proyecto.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existingAdmin = await dbGet('SELECT id FROM users WHERE email = ?', [adminEmail]);

  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await dbRun(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      ['Administrador', adminEmail, hash, 'admin']
    );
  }

  const count = await dbGet('SELECT COUNT(*) as total FROM products');
  if (count && count.total === 0) {
    await dbRun(
      'INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)',
      ['Teclado Mecánico', 'Switch rojo retroiluminado', 899.5, 15]
    );
    await dbRun(
      'INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)',
      ['Mouse Inalámbrico', 'Sensor óptico 16000 DPI', 549.0, 25]
    );
  }
}

function closeDb() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      db = null;
      resolve();
    });
  });
}

module.exports = { initDb, dbRun, dbGet, dbAll, closeDb };
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

let adminToken;

beforeAll(async () => {
  await initDb();
});

afterAll(async () => {
  await closeDb();
});

describe('Health Check', () => {
  test('GET /api/health responde 200 con status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /api/health incluye nombre del servicio y timestamp ISO', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.service).toBe('devops-backend');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

describe('Seguridad - Bloqueo de rutas protegidas sin token', () => {
  const protectedRoutes = [
    ['get', '/api/auth/me'],
    ['get', '/api/products'],
    ['get', '/api/products/1'],
    ['post', '/api/products'],
    ['put', '/api/products/1'],
    ['delete', '/api/products/1'],
    ['get', '/api/users'],
    ['post', '/api/users'],
    ['delete', '/api/users/1'],
  ];

  test.each(protectedRoutes)('%s %s responde 401 sin header Authorization', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

describe('Seguridad - Rechazo de tokens JWT inválidos', () => {
  const wrongSecretToken = jwt.sign({ id: 1, email: 'admin@proyecto.com' }, 'clave-incorrecta');

  const invalidHeaders = [
    ['header vacío', ''],
    ['esquema Basic en lugar de Bearer', 'Basic dXNlcjpwYXNz'],
    ['Bearer sin token', 'Bearer '],
    ['token malformado', 'Bearer esto.no.es.un.jwt'],
    ['token firmado con otro secreto', `Bearer ${wrongSecretToken}`],
  ];

  test.each(invalidHeaders)('rechaza %s con 401', async (_label, authHeader) => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', authHeader);
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/login', () => {
  const invalidLoginPayloads = [
    ['sin campos', {}],
    ['sin correo', { password: 'Admin123!' }],
    ['sin contraseña', { email: 'admin@proyecto.com' }],
    ['correo y contraseña vacíos', { email: '', password: '' }],
  ];

  test.each(invalidLoginPayloads)('responde 400 cuando se envía %s', async (_label, payload) => {
    const res = await request(app).post('/api/auth/login').send(payload);
    expect(res.statusCode).toBe(400);
  });

  test('responde 401 con contraseña incorrecta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@proyecto.com', password: 'PasswordIncorrecta' });
    expect(res.statusCode).toBe(401);
  });

  test('responde 401 con correo inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@proyecto.com', password: 'Admin123!' });
    expect(res.statusCode).toBe(401);
  });

  test('normaliza mayúsculas y espacios en el correo al iniciar sesión', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  ADMIN@PROYECTO.COM  ', password: 'Admin123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('inicia sesión con admin y no expone password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@proyecto.com', password: 'Admin123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('admin@proyecto.com');
    expect(res.body.user.password_hash).toBeUndefined();
    adminToken = res.body.token;
  });
});

describe('POST /api/auth/register', () => {
  const invalidRegisterPayloads = [
    ['sin nombre', { email: 'a@test.com', password: '123' }],
    ['sin correo', { name: 'Ana', password: '123' }],
    ['sin contraseña', { name: 'Ana', email: 'a@test.com' }],
    ['body vacío', {}],
  ];

  test.each(invalidRegisterPayloads)('responde 400 con %s', async (_label, payload) => {
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.statusCode).toBe(400);
  });

  test('registra un usuario nuevo y devuelve token + perfil limpio', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: '  Nuevo Usuario  ',
        email: '  Nuevo@Test.COM ',
        password: 'Password123!',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.name).toBe('Nuevo Usuario');
    expect(res.body.user.email).toBe('nuevo@test.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('responde 409 si el correo ya existe', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Otro', email: 'nuevo@test.com', password: 'Password123!' });
    expect(res.statusCode).toBe(409);
  });

  test('responde 409 si el correo duplicado viene en mayúsculas', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Otro', email: 'NUEVO@TEST.COM', password: 'Password123!' });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /api/auth/me', () => {
  test('devuelve los datos del usuario autenticado', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('admin@proyecto.com');
  });

  test('responde 404 si el usuario del token fue eliminado', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Temporal', email: 'temp@test.com', password: 'Password123!' });

    await request(app)
      .delete(`/api/users/${reg.body.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.statusCode).toBe(404);
  });
});
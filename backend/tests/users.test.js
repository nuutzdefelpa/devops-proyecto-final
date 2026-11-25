process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

let token;
let targetUserId;

beforeAll(async () => {
  await initDb();
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@proyecto.com', password: 'Admin123!' });
  token = login.body.token;
});

afterAll(async () => {
  await closeDb();
});

describe('GET /api/users', () => {
  test('devuelve un arreglo de usuarios', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('incluye al administrador inicial', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.some((u) => u.email === 'admin@proyecto.com')).toBe(true);
  });

  test('nunca expone password_hash en el listado', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.every((u) => u.password_hash === undefined)).toBe(true);
  });
});

describe('GET /api/users/:id', () => {
  test('obtiene un usuario existente sin exponer password_hash', async () => {
    const res = await request(app)
      .get('/api/users/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.password_hash).toBeUndefined();
  });

  test('responde 404 para usuario inexistente', async () => {
    const res = await request(app)
      .get('/api/users/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/users', () => {
  const validUsers = [
    ['usuario con rol por defecto', { name: 'Carlos', email: 'carlos@test.com', password: 'Pass123!' }, { name: 'Carlos', email: 'carlos@test.com', role: 'user' }],
    ['usuario con rol admin', { name: 'Laura', email: 'laura@test.com', password: 'Pass123!', role: 'admin' }, { name: 'Laura', email: 'laura@test.com', role: 'admin' }],
    ['correo en mayúsculas y espacios', { name: '  Diego  ', email: '  DIEGO@TEST.COM ', password: 'Pass123!' }, { name: 'Diego', email: 'diego@test.com', role: 'user' }],
  ];

  test.each(validUsers)('crea %s correctamente (201)', async (_label, payload, expected) => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe(expected.name);
    expect(res.body.email).toBe(expected.email);
    expect(res.body.role).toBe(expected.role);
    expect(res.body.password_hash).toBeUndefined();
    targetUserId = res.body.id;
  });

  test('el usuario recién creado puede iniciar sesión en /api/auth/login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'diego@test.com', password: 'Pass123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  const invalidUsers = [
    ['sin nombre', { email: 'x@test.com', password: '123' }],
    ['nombre vacío', { name: '', email: 'x@test.com', password: '123' }],
    ['sin correo', { name: 'Test', password: '123' }],
    ['correo vacío', { name: 'Test', email: '', password: '123' }],
    ['sin contraseña', { name: 'Test', email: 'x@test.com' }],
    ['contraseña vacía', { name: 'Test', email: 'x@test.com', password: '' }],
  ];

  test.each(invalidUsers)('rechaza %s con 400', async (_label, payload) => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.statusCode).toBe(400);
  });

  test('rechaza correo duplicado exacto con 409', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Clon', email: 'carlos@test.com', password: '123' });
    expect(res.statusCode).toBe(409);
  });

  test('rechaza correo duplicado en mayúsculas con 409', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Clon', email: 'CARLOS@TEST.COM', password: '123' });
    expect(res.statusCode).toBe(409);
  });
});

describe('PUT /api/users/:id', () => {
  test('actualiza solo el nombre manteniendo correo y rol', async () => {
    const res = await request(app)
      .put(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Diego Actualizado' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Diego Actualizado');
    expect(res.body.email).toBe('diego@test.com');
  });

  test('actualiza solo el rol a admin', async () => {
    const res = await request(app)
      .put(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  test('permite actualizar enviando su mismo correo sin error 409', async () => {
    const res = await request(app)
      .put(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Diego Mismo Correo', email: 'diego@test.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe('diego@test.com');
  });

  test('actualiza la contraseña y permite login con la nueva clave', async () => {
    const update = await request(app)
      .put(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'NuevaPassword456!' });
    expect(update.statusCode).toBe(200);

    const loginNew = await request(app)
      .post('/api/auth/login')
      .send({ email: 'diego@test.com', password: 'NuevaPassword456!' });
    expect(loginNew.statusCode).toBe(200);
  });

  test('rechaza login con la contraseña anterior tras el cambio', async () => {
    const loginOld = await request(app)
      .post('/api/auth/login')
      .send({ email: 'diego@test.com', password: 'Pass123!' });
    expect(loginOld.statusCode).toBe(401);
  });

  test('responde 409 al intentar usar el correo de otro usuario', async () => {
    const res = await request(app)
      .put(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'carlos@test.com' });
    expect(res.statusCode).toBe(409);
  });

  test('responde 404 al actualizar un usuario inexistente', async () => {
    const res = await request(app)
      .put('/api/users/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nadie' });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/users/:id', () => {
  test('elimina un usuario existente', async () => {
    const res = await request(app)
      .delete(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(targetUserId);
  });

  test('confirma con 404 que el usuario eliminado ya no existe', async () => {
    const res = await request(app)
      .get(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 al intentar eliminar de nuevo el mismo usuario', async () => {
    const res = await request(app)
      .delete(`/api/users/${targetUserId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 al eliminar un ID inexistente', async () => {
    const res = await request(app)
      .delete('/api/users/77777')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});
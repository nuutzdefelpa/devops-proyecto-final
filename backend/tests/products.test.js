process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { initDb, closeDb } = require('../src/db');

let token;
let targetProductId;

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

describe('GET /api/products', () => {
  test('devuelve un arreglo de productos', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('incluye los productos iniciales precargados', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body.some((p) => p.name === 'Teclado Mecánico')).toBe(true);
  });

  test('devuelve los productos ordenados de forma descendente por id', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body[0].id).toBeGreaterThan(res.body[1].id);
  });
});

describe('GET /api/products/:id', () => {
  test('devuelve un producto existente por su ID', async () => {
    const res = await request(app)
      .get('/api/products/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
  });

  test('responde 404 para un ID inexistente', async () => {
    const res = await request(app)
      .get('/api/products/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 para un ID no numérico', async () => {
    const res = await request(app)
      .get('/api/products/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/products - Casos válidos y frontera', () => {
  const validProducts = [
    ['producto completo estándar', { name: 'Monitor 27', description: 'IPS 144Hz', price: 4200, stock: 8 }, { name: 'Monitor 27', price: 4200, stock: 8 }],
    ['precio y stock en cero', { name: 'Muestra Gratis', description: 'Promo', price: 0, stock: 0 }, { name: 'Muestra Gratis', price: 0, stock: 0 }],
    ['precio con decimales', { name: 'Cable USB-C', description: '1m', price: 99.95, stock: 30 }, { name: 'Cable USB-C', price: 99.95, stock: 30 }],
    ['stock decimal truncado a entero', { name: 'Adaptador HDMI', price: 150, stock: 7.9 }, { name: 'Adaptador HDMI', price: 150, stock: 7 }],
    ['recorte de espacios en nombre y descripción', { name: '  Webcam HD  ', description: '  1080p  ', price: 700, stock: 4 }, { name: 'Webcam HD', price: 700, stock: 4 }],
  ];

  test.each(validProducts)('crea %s correctamente (201)', async (_label, payload, expected) => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe(expected.name);
    expect(res.body.price).toBe(expected.price);
    expect(res.body.stock).toBe(expected.stock);
    targetProductId = res.body.id;
  });
});

describe('POST /api/products - Validaciones negativas (400)', () => {
  const invalidProducts = [
    ['sin nombre', { price: 100, stock: 5 }],
    ['nombre vacío', { name: '', price: 100, stock: 5 }],
    ['sin precio', { name: 'Teclado', stock: 5 }],
    ['precio null', { name: 'Teclado', price: null, stock: 5 }],
    ['precio no numérico', { name: 'Teclado', price: 'barato', stock: 5 }],
    ['precio negativo entero', { name: 'Teclado', price: -50, stock: 5 }],
    ['precio negativo decimal', { name: 'Teclado', price: -0.01, stock: 5 }],
    ['stock negativo', { name: 'Teclado', price: 100, stock: -1 }],
    ['stock no numérico', { name: 'Teclado', price: 100, stock: 'muchos' }],
  ];

  test.each(invalidProducts)('rechaza %s con 400', async (_label, payload) => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/products/:id - Actualizaciones válidas y errores', () => {
  test('actualiza todos los campos de un producto', async () => {
    const res = await request(app)
      .put(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Webcam 4K', description: 'Ultra HD', price: 1299.5, stock: 12 });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Webcam 4K');
    expect(res.body.price).toBe(1299.5);
    expect(res.body.stock).toBe(12);
  });

  test('permite actualización parcial solo del nombre', async () => {
    const res = await request(app)
      .put(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Webcam 4K Pro' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Webcam 4K Pro');
    expect(res.body.price).toBe(1299.5);
  });

  test('permite actualización parcial solo del precio', async () => {
    const res = await request(app)
      .put(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 1150 });
    expect(res.statusCode).toBe(200);
    expect(res.body.price).toBe(1150);
    expect(res.body.stock).toBe(12);
  });

  test('permite actualización parcial solo del stock', async () => {
    const res = await request(app)
      .put(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 20 });
    expect(res.statusCode).toBe(200);
    expect(res.body.stock).toBe(20);
  });

  test('responde 404 al intentar actualizar un producto inexistente', async () => {
    const res = await request(app)
      .put('/api/products/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fantasma' });
    expect(res.statusCode).toBe(404);
  });

  const invalidUpdates = [
    ['nombre vacío', { name: '' }],
    ['nombre solo espacios', { name: '   ' }],
    ['precio negativo', { price: -10 }],
    ['precio no numérico', { price: 'caro' }],
    ['stock negativo', { stock: -3 }],
    ['stock no numérico', { stock: 'xyz' }],
  ];

  test.each(invalidUpdates)('rechaza actualización con %s (400)', async (_label, payload) => {
    const res = await request(app)
      .put(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/products/:id', () => {
  test('elimina un producto existente', async () => {
    const res = await request(app)
      .delete(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(targetProductId);
  });

  test('confirma con 404 que el producto eliminado ya no existe', async () => {
    const res = await request(app)
      .get(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 al intentar eliminar de nuevo el mismo producto', async () => {
    const res = await request(app)
      .delete(`/api/products/${targetProductId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  test('responde 404 al eliminar un ID que nunca existió', async () => {
    const res = await request(app)
      .delete('/api/products/88888')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });
});
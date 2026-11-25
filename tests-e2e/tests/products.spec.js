const { test, expect } = require('@playwright/test');

let adminToken;

async function loginAsAdmin(page) {
  await page.goto('/');
  await page.getByTestId('auth-email').fill('admin@proyecto.com');
  await page.getByTestId('auth-password').fill('Admin123!');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('logged-user')).toContainText('admin@proyecto.com');
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'admin@proyecto.com', password: 'Admin123!' },
  });
  adminToken = (await res.json()).token;
});

test.afterAll(async ({ request }) => {
  const res = await request.get('/api/products', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const products = await res.json();
  for (const p of products) {
    if (p.name.startsWith('PW-')) {
      await request.delete(`/api/products/${p.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  }
});

test.describe('E2E - CRUD Productos', () => {
  test('carga el catálogo de productos al iniciar sesión', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByTestId('products-table')).toBeVisible();
    await expect(page.getByTestId('tab-products')).toContainText('Productos');
  });

  test('crea un producto nuevo y lo muestra en la tabla', async ({ page }) => {
    const name = `PW-Audifonos-${Date.now()}`;
    await loginAsAdmin(page);

    await page.getByTestId('product-name').fill(name);
    await page.getByTestId('product-description').fill('Cancelación activa');
    await page.getByTestId('product-price').fill('1250');
    await page.getByTestId('product-stock').fill('10');
    await page.getByTestId('product-submit').click();

    await expect(page.getByTestId('app-status')).toContainText('Producto creado');
    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: name });
    await expect(row).toBeVisible();
  });

  test('muestra correctamente precios con decimales formateados', async ({ page }) => {
    const name = `PW-Cable-${Date.now()}`;
    await loginAsAdmin(page);

    await page.getByTestId('product-name').fill(name);
    await page.getByTestId('product-description').fill('Trenzado');
    await page.getByTestId('product-price').fill('199.5');
    await page.getByTestId('product-stock').fill('4');
    await page.getByTestId('product-submit').click();

    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: name });
    await expect(row).toContainText('$199.50');
  });

  test('edita un producto existente y actualiza precio y nombre', async ({ page, request }) => {
    const original = `PW-Editar-${Date.now()}`;
    const updated = `PW-Editado-${Date.now()}`;

    await request.post('/api/products', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: original, description: 'Inicial', price: 300, stock: 5 },
    });

    await loginAsAdmin(page);
    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: original });
    await row.getByRole('button', { name: 'Editar' }).click();

    await page.getByTestId('product-name').fill(updated);
    await page.getByTestId('product-price').fill('450');
    await page.getByTestId('product-submit').click();

    await expect(page.getByTestId('app-status')).toContainText('Producto actualizado');
    const updatedRow = page.locator('[data-testid="products-table"] tbody tr', { hasText: updated });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText('$450.00');
  });

  test('el botón Cancelar sale del modo edición y limpia el formulario', async ({ page, request }) => {
    const name = `PW-Cancelar-${Date.now()}`;
    await request.post('/api/products', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name, description: 'Prueba', price: 100, stock: 2 },
    });

    await loginAsAdmin(page);
    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: name });
    await row.getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByTestId('product-submit')).toContainText('Actualizar');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('product-submit')).toContainText('Guardar Producto');
    await expect(page.getByTestId('product-name')).toHaveValue('');
  });

  test('mantiene un producto creado después de recargar la página', async ({ page }) => {
    const name = `PW-Persiste-${Date.now()}`;
    await loginAsAdmin(page);

    await page.getByTestId('product-name').fill(name);
    await page.getByTestId('product-price').fill('800');
    await page.getByTestId('product-stock').fill('3');
    await page.getByTestId('product-submit').click();
    await expect(page.getByTestId('app-status')).toContainText('Producto creado');

    await page.reload();
    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: name });
    await expect(row).toBeVisible();
  });

  test('elimina un producto y desaparece de la tabla', async ({ page, request }) => {
    const name = `PW-Borrar-${Date.now()}`;
    await request.post('/api/products', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name, description: 'Temporal', price: 50, stock: 1 },
    });

    await loginAsAdmin(page);
    const row = page.locator('[data-testid="products-table"] tbody tr', { hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByTestId('app-status')).toContainText('Producto eliminado');
    await expect(row).toHaveCount(0);
  });
});
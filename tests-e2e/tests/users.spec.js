const { test, expect } = require('@playwright/test');

let adminToken;

async function loginAndOpenUsers(page) {
  await page.goto('/');
  await page.getByTestId('auth-email').fill('admin@proyecto.com');
  await page.getByTestId('auth-password').fill('Admin123!');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('logged-user')).toContainText('admin@proyecto.com');
  await page.getByTestId('tab-users').click();
  await expect(page.getByTestId('users-table')).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'admin@proyecto.com', password: 'Admin123!' },
  });
  adminToken = (await res.json()).token;
});

test.afterAll(async ({ request }) => {
  const res = await request.get('/api/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const users = await res.json();
  for (const u of users) {
    if (u.email.endsWith('@pw-test.com')) {
      await request.delete(`/api/users/${u.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
  }
});

test.describe('E2E - CRUD Usuarios', () => {
  test('navega a la pestaña de Usuarios y muestra al administrador', async ({ page }) => {
    await loginAndOpenUsers(page);
    const adminRow = page.locator('[data-testid="users-table"] tbody tr', {
      hasText: 'admin@proyecto.com',
    });
    await expect(adminRow).toBeVisible();
  });

  test('crea un usuario con rol normal (user)', async ({ page }) => {
    const email = `user.${Date.now()}@pw-test.com`;
    await loginAndOpenUsers(page);

    await page.getByTestId('user-name').fill('Usuario Estándar');
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-password').fill('Pass1234!');
    await page.getByTestId('user-role').selectOption('user');
    await page.getByTestId('user-submit').click();

    await expect(page.getByTestId('app-status')).toContainText('Usuario creado');
    const row = page.locator('[data-testid="users-table"] tbody tr', { hasText: email });
    await expect(row).toContainText('user');
  });

  test('crea un usuario con rol administrador (admin)', async ({ page }) => {
    const email = `admin.${Date.now()}@pw-test.com`;
    await loginAndOpenUsers(page);

    await page.getByTestId('user-name').fill('Usuario Admin');
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-password').fill('Pass1234!');
    await page.getByTestId('user-role').selectOption('admin');
    await page.getByTestId('user-submit').click();

    await expect(page.getByTestId('app-status')).toContainText('Usuario creado');
    const row = page.locator('[data-testid="users-table"] tbody tr', { hasText: email });
    await expect(row).toContainText('admin');
  });

  test('muestra error al intentar crear un usuario con correo duplicado', async ({ page }) => {
    await loginAndOpenUsers(page);

    await page.getByTestId('user-name').fill('Duplicado');
    await page.getByTestId('user-email').fill('admin@proyecto.com');
    await page.getByTestId('user-password').fill('Pass1234!');
    await page.getByTestId('user-submit').click();

    await expect(page.getByTestId('app-error')).toBeVisible();
    await expect(page.getByTestId('app-error')).toContainText('ya existe');
  });

  test('edita nombre y rol de un usuario existente', async ({ page, request }) => {
    const email = `edit.${Date.now()}@pw-test.com`;
    await request.post('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Antes Editar', email, password: 'Pass1234!', role: 'user' },
    });

    await loginAndOpenUsers(page);
    const row = page.locator('[data-testid="users-table"] tbody tr', { hasText: email });
    await row.getByRole('button', { name: 'Editar' }).click();

    await page.getByTestId('user-name').fill('Después Editar');
    await page.getByTestId('user-role').selectOption('admin');
    await page.getByTestId('user-submit').click();

    await expect(page.getByTestId('app-status')).toContainText('Usuario actualizado');
    await expect(row).toContainText('Después Editar');
    await expect(row).toContainText('admin');
  });

  test('el botón Cancelar restaura el formulario de edición de usuario', async ({ page, request }) => {
    const email = `cancel.${Date.now()}@pw-test.com`;
    await request.post('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Usuario Cancelar', email, password: 'Pass1234!', role: 'user' },
    });

    await loginAndOpenUsers(page);
    const row = page.locator('[data-testid="users-table"] tbody tr', { hasText: email });
    await row.getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByTestId('user-submit')).toContainText('Actualizar');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('user-submit')).toContainText('Guardar Usuario');
    await expect(page.getByTestId('user-name')).toHaveValue('');
  });

  test('elimina un usuario y desaparece de la tabla', async ({ page, request }) => {
    const email = `delete.${Date.now()}@pw-test.com`;
    await request.post('/api/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Usuario Borrar', email, password: 'Pass1234!', role: 'user' },
    });

    await loginAndOpenUsers(page);
    const row = page.locator('[data-testid="users-table"] tbody tr', { hasText: email });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByTestId('app-status')).toContainText('Usuario eliminado');
    await expect(row).toHaveCount(0);
  });
});
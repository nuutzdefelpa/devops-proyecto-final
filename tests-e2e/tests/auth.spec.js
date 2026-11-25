const { test, expect } = require('@playwright/test');

let adminToken;

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

test.describe('E2E - Autenticación y Sesión', () => {
  test('muestra correctamente la pantalla de inicio de sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Iniciar Sesión' })).toBeVisible();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    await expect(page.getByTestId('auth-password')).toBeVisible();
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });

  test('muestra alerta de error con contraseña incorrecta', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('auth-email').fill('admin@proyecto.com');
    await page.getByTestId('auth-password').fill('clave-incorrecta');
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-error')).toBeVisible();
    await expect(page.getByTestId('auth-error')).toContainText('Credenciales inválidas');
  });

  test('muestra alerta de error con correo inexistente', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('auth-email').fill('noexiste@pw-test.com');
    await page.getByTestId('auth-password').fill('Admin123!');
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-error')).toContainText('Credenciales inválidas');
  });

  test('permite registrar un usuario nuevo desde la interfaz e iniciar sesión', async ({ page }) => {
    const email = `registro.${Date.now()}@pw-test.com`;
    await page.goto('/');
    await page.getByTestId('toggle-auth-mode').click();

    await expect(page.getByRole('heading', { name: 'Crear Cuenta' })).toBeVisible();
    await page.getByTestId('auth-name').fill('Usuario Playwright');
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill('Test1234!');
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('logged-user')).toContainText(email);
  });

  test('mantiene la sesión activa después de recargar el navegador', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('auth-email').fill('admin@proyecto.com');
    await page.getByTestId('auth-password').fill('Admin123!');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('logged-user')).toContainText('admin@proyecto.com');

    await page.reload();
    await expect(page.getByTestId('logged-user')).toContainText('admin@proyecto.com');
  });

  test('cierra sesión correctamente y regresa al formulario de login', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('auth-email').fill('admin@proyecto.com');
    await page.getByTestId('auth-password').fill('Admin123!');
    await page.getByTestId('auth-submit').click();
    await expect(page.getByTestId('logout-btn')).toBeVisible();

    await page.getByTestId('logout-btn').click();
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });
});
import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from './api';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // Estado de Auth (Login / Registro)
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Pestaña activa: products | users
  const [activeTab, setActiveTab] = useState('products');

  // Estado de Productos
  const [products, setProducts] = useState([]);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
  });

  // Estado de Usuarios
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  });

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setCurrentUser(null);
    setProducts([]);
    setUsers([]);
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [productsData, usersData] = await Promise.all([
        apiRequest('/products', { token }),
        apiRequest('/users', { token }),
      ]);
      setProducts(productsData);
      setUsers(usersData);
    } catch (err) {
      if (err.message.includes('Token')) {
        logout();
      } else {
        setError(err.message);
      }
    }
  }, [token, logout]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : authForm;

      const data = await apiRequest(endpoint, { method: 'POST', body: payload });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setCurrentUser(data.user);
      setAuthForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  // --- CRUD PRODUCTOS ---
  async function handleProductSubmit(e) {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    try {
      const payload = {
        name: productForm.name,
        description: productForm.description,
        price: Number(productForm.price),
        stock: Number(productForm.stock || 0),
      };

      if (editingProductId) {
        await apiRequest(`/products/${editingProductId}`, {
          method: 'PUT',
          body: payload,
          token,
        });
        setStatusMsg('Producto actualizado correctamente');
      } else {
        await apiRequest('/products', { method: 'POST', body: payload, token });
        setStatusMsg('Producto creado correctamente');
      }

      setEditingProductId(null);
      setProductForm({ name: '', description: '', price: '', stock: '' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      stock: String(product.stock),
    });
  }

  async function handleDeleteProduct(id) {
    setError('');
    setStatusMsg('');
    try {
      await apiRequest(`/products/${id}`, { method: 'DELETE', token });
      setStatusMsg('Producto eliminado');
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  // --- CRUD USUARIOS ---
  async function handleUserSubmit(e) {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    try {
      const payload = {
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
      };
      if (userForm.password) {
        payload.password = userForm.password;
      }

      if (editingUserId) {
        await apiRequest(`/users/${editingUserId}`, {
          method: 'PUT',
          body: payload,
          token,
        });
        setStatusMsg('Usuario actualizado correctamente');
      } else {
        await apiRequest('/users', { method: 'POST', body: payload, token });
        setStatusMsg('Usuario creado correctamente');
      }

      setEditingUserId(null);
      setUserForm({ name: '', email: '', password: '', role: 'user' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditUser(user) {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
    });
  }

  async function handleDeleteUser(id) {
    setError('');
    setStatusMsg('');
    try {
      await apiRequest(`/users/${id}`, { method: 'DELETE', token });
      setStatusMsg('Usuario eliminado');
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="card auth-card">
          <h1>{authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</h1>
          <p className="subtitle">Panel de Gestión — Proyecto DevOps</p>

          {error && (
            <div className="alert alert-error" data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            {authMode === 'register' && (
              <label>
                Nombre
                <input
                  data-testid="auth-name"
                  type="text"
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Tu nombre"
                />
              </label>
            )}

            <label>
              Correo electrónico
              <input
                data-testid="auth-email"
                type="email"
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="admin@proyecto.com"
              />
            </label>

            <label>
              Contraseña
              <input
                data-testid="auth-password"
                type="password"
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="••••••••"
              />
            </label>

            <button className="btn btn-primary" type="submit" data-testid="auth-submit">
              {authMode === 'login' ? 'Entrar' : 'Registrarse'}
            </button>
          </form>

          <button
            className="btn-link"
            type="button"
            data-testid="toggle-auth-mode"
            onClick={() => {
              setError('');
              setAuthMode(authMode === 'login' ? 'register' : 'login');
            }}
          >
            {authMode === 'login'
              ? '¿No tienes cuenta? Regístrate aquí'
              : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="topbar">
        <div>
          <h1>Sistema de Gestión DevOps</h1>
          <span className="user-badge" data-testid="logged-user">
            Sesión: {currentUser?.name} ({currentUser?.email})
          </span>
        </div>
        <button className="btn btn-danger" onClick={logout} data-testid="logout-btn">
          Cerrar Sesión
        </button>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'products' ? 'active' : ''}`}
          data-testid="tab-products"
          onClick={() => setActiveTab('products')}
        >
          Productos ({products.length})
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          data-testid="tab-users"
          onClick={() => setActiveTab('users')}
        >
          Usuarios ({users.length})
        </button>
      </nav>

      {error && (
        <div className="alert alert-error" data-testid="app-error">
          {error}
        </div>
      )}
      {statusMsg && (
        <div className="alert alert-success" data-testid="app-status">
          {statusMsg}
        </div>
      )}

      {activeTab === 'products' ? (
        <section className="grid">
          <div className="card">
            <h2>{editingProductId ? 'Editar Producto' : 'Nuevo Producto'}</h2>
            <form onSubmit={handleProductSubmit}>
              <label>
                Nombre
                <input
                  data-testid="product-name"
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                />
              </label>
              <label>
                Descripción
                <input
                  data-testid="product-description"
                  type="text"
                  value={productForm.description}
                  onChange={(e) =>
                    setProductForm({ ...productForm, description: e.target.value })
                  }
                />
              </label>
              <label>
                Precio
                <input
                  data-testid="product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                />
              </label>
              <label>
                Stock
                <input
                  data-testid="product-stock"
                  type="number"
                  min="0"
                  required
                  value={productForm.stock}
                  onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" data-testid="product-submit">
                  {editingProductId ? 'Actualizar' : 'Guardar Producto'}
                </button>
                {editingProductId && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: '', description: '', price: '', stock: '' });
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h2>Catálogo de Productos</h2>
            <table data-testid="products-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} data-testid={`product-row-${p.id}`}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted">{p.description}</div>
                    </td>
                    <td>${Number(p.price).toFixed(2)}</td>
                    <td>{p.stock}</td>
                    <td className="actions">
                      <button
                        className="btn btn-small"
                        data-testid={`edit-product-${p.id}`}
                        onClick={() => startEditProduct(p)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        data-testid={`delete-product-${p.id}`}
                        onClick={() => handleDeleteProduct(p.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="4" className="muted">
                      No hay productos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="grid">
          <div className="card">
            <h2>{editingUserId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            <form onSubmit={handleUserSubmit}>
              <label>
                Nombre
                <input
                  data-testid="user-name"
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                />
              </label>
              <label>
                Correo
                <input
                  data-testid="user-email"
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                />
              </label>
              <label>
                Contraseña {editingUserId ? '(dejar vacío para mantener)' : ''}
                <input
                  data-testid="user-password"
                  type="password"
                  required={!editingUserId}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                />
              </label>
              <label>
                Rol
                <select
                  data-testid="user-role"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  <option value="user">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" data-testid="user-submit">
                  {editingUserId ? 'Actualizar' : 'Guardar Usuario'}
                </button>
                {editingUserId && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setEditingUserId(null);
                      setUserForm({ name: '', email: '', password: '', role: 'user' });
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h2>Lista de Usuarios</h2>
            <table data-testid="users-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td className="actions">
                      <button
                        className="btn btn-small"
                        data-testid={`edit-user-${u.id}`}
                        onClick={() => startEditUser(u)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        data-testid={`delete-user-${u.id}`}
                        onClick={() => handleDeleteUser(u.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
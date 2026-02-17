import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const login = async (e) => {
    e.preventDefault();
    setStatus('Logging in...');
    try {
      const res = await api.post('/admin/login', { email, password });
      if (!res.data || !res.data.token) {
        setStatus('Server did not return a token.');
        return;
      }
      localStorage.setItem('token', res.data.token);
      setStatus('Success. Redirecting...');
      navigate('/admin', { replace: true });
      window.location.reload();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      setStatus(msg);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h2>Admin sign in</h2>
      <p className="muted">
        For app creators and employees. Use your admin email and password.
      </p>
      <form onSubmit={login} className="form-grid">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn-primary" type="submit">
          Sign in
        </button>
      </form>
      {status && <div className="status">{status}</div>}
      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        First time? Add in backend <code>.env</code>:<br />
        <code>ADMIN_EMAIL=your@email.com</code><br />
        <code>ADMIN_PASSWORD=your_password</code><br />
        Then create the <code>admin_users</code> table in Supabase (see schema.sql).
      </p>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        <a href="/">← Back to MSME portal (public)</a>
      </p>
    </div>
  );
}

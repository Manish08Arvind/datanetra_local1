import React, { useEffect, useState } from 'react';
import api from '../api.js';
import { isAdmin } from '../utils/auth.js';

export default function AdminPage() {
  const [employeeForm, setEmployeeForm] = useState({ email: '', name: '' });
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const admin = isAdmin();

  const handleChange = (e) => {
    setEmployeeForm({ ...employeeForm, [e.target.name]: e.target.value });
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadEmployees = async () => {
    if (!admin) return;
    try {
      const res = await api.get('/admin/employees');
      setEmployees(res.data.employees || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadEmployees();
  }, [admin]);

  const addEmployee = async (e) => {
    e.preventDefault();
    setStatus('Adding employee...');
    setGeneratedPassword(null);
    try {
      const res = await api.post('/admin/employees', employeeForm);
      setGeneratedPassword(res.data.password);
      setStatus(`Employee added. Share the password below with them (it won't be shown again).`);
      setEmployeeForm({ email: '', name: '' });
      await loadEmployees();
    } catch (err) {
      setStatus(err.response?.data?.message || 'Error adding employee.');
    }
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setStatus('Password copied to clipboard.');
    }
  };

  return (
    <div className="card">
      <h2>Admin Panel</h2>
      <p className="muted">
        App staff only (no Udhayam ID). Admins can add employees and see employee details; employees can only view the Users DB.
      </p>

      {admin && (
        <>
          <h3>Add employee</h3>
          <p className="muted">New app employees get a generated password. Share it with them once; they sign in at /admin/login with email and this password.</p>
          <form onSubmit={addEmployee} className="form-grid">
            <label>
              Email
              <input
                name="email"
                type="email"
                value={employeeForm.email}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Name
              <input name="name" value={employeeForm.name} onChange={handleChange} required />
            </label>
            <button className="btn-secondary" type="submit">
              Add employee &amp; generate password
            </button>
          </form>

          {generatedPassword && (
            <div className="generated-password">
              <strong>Generated password (copy and share with the employee):</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <code style={{ padding: 8, background: '#1e293b', borderRadius: 6 }}>{generatedPassword}</code>
                <button type="button" className="btn-secondary" onClick={copyPassword}>
                  Copy
                </button>
              </div>
            </div>
          )}

          <h3>Employee details</h3>
          <p className="muted">App employees (admins and staff). Only admins can see this section.</p>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.id}</td>
                  <td>{emp.email}</td>
                  <td>{emp.name}</td>
                  <td>{emp.role}</td>
                  <td>{emp.created_at ? new Date(emp.created_at).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr />
        </>
      )}

      <h3>Users (DB)</h3>
      <p className="muted">MSME platform users. Both admins and employees can view this list; only admins can add or modify employees above.</p>
      {status && <div className="status">{status}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Udhayam ID</th>
            <th>Company</th>
            <th>Role</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.udhayam_id}</td>
              <td>{u.company_name}</td>
              <td>{u.role}</td>
              <td>{u.contact_number}</td>
              <td>{u.email}</td>
              <td>{u.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

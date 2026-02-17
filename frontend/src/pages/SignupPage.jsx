import React, { useState } from 'react';
import api from '../api.js';

export default function SignupPage() {
  const [form, setForm] = useState({
    udhayam_id: '',
    company_name: '',
    owner_name: '',
    contact_number: ''
  });
  const [certificate, setCertificate] = useState(null);
  const [signupId, setSignupId] = useState(null);
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const startSignup = async (e) => {
    e.preventDefault();
    setStatus('Submitting details...');
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    if (certificate) data.append('msme_certificate', certificate);
    try {
      const res = await api.post('/auth/signup/start', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSignupId(res.data.signup_id);
      setStatus(res.data.message || 'OTP sent. Enter it below.');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Error starting signup');
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (!signupId) {
      setStatus('Submit the form above first to receive an OTP.');
      return;
    }
    setStatus('Verifying OTP...');
    try {
      const res = await api.post('/auth/signup/verify-otp', {
        signup_id: signupId,
        otp
      });
      localStorage.setItem('token', res.data.token);
      setStatus('Signup complete. Redirecting...');
      window.location.href = '/dashboard';
    } catch (err) {
      setStatus(err.response?.data?.message || 'Error verifying OTP');
    }
  };

  return (
    <div className="card">
      <h2>MSME Sign-up</h2>
      <p className="muted">
        New MSME? Fill your details and upload your MSME certificate. We will validate against our
        backend registry and send an OTP.
      </p>
      <form onSubmit={startSignup} className="form-grid">
        <label>
          Udhayam ID
          <input name="udhayam_id" value={form.udhayam_id} onChange={handleChange} required />
        </label>
        <label>
          Company name
          <input name="company_name" value={form.company_name} onChange={handleChange} required />
        </label>
        <label>
          Owner name (primary or secondary)
          <input name="owner_name" value={form.owner_name} onChange={handleChange} required />
        </label>
        <label>
          Contact number
          <input name="contact_number" value={form.contact_number} onChange={handleChange} required />
        </label>
        <label>
          MSME certificate
          <input type="file" onChange={(e) => setCertificate(e.target.files[0])} />
        </label>
        <button className="btn-primary" type="submit">
          Submit &amp; send OTP
        </button>
      </form>

      <hr />

      <h3>Enter OTP</h3>
      <p className="muted">
        Check the registered MSME email for the OTP. If using Mailtrap, open your Mailtrap inbox at
        mailtrap.io to see the email.
      </p>
      <form onSubmit={verifyOtp} className="form-inline">
        <input
          placeholder="Enter 6-digit OTP"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          required
        />
        <button className="btn-secondary" type="submit" disabled={!signupId}>
          Verify &amp; complete sign-up
        </button>
      </form>

      {status && <div className="status">{status}</div>}
    </div>
  );
}


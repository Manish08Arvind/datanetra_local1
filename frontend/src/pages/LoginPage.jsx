import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';

export default function LoginPage() {
  const [udhayamId, setUdhayamId] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('id'); // 'id' | 'otp'
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const requestOtp = async (e) => {
    e.preventDefault();
    setStatus('Sending OTP to your email...');
    try {
      await api.post('/auth/login/request-otp', { udhayam_id: udhayamId });
      setStatus('OTP sent to your registered email. Enter it below.');
      setStep('otp');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send OTP';
      setStatus(msg);
      if (err.response?.data?.otp_for_testing) {
        setStatus(`${msg} OTP: ${err.response.data.otp_for_testing}`);
        setStep('otp');
      }
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setStatus('Verifying...');
    try {
      const res = await api.post('/auth/login/verify-otp', {
        udhayam_id: udhayamId,
        otp: otp.trim()
      });
      localStorage.setItem('token', res.data.token);
      setStatus('Logged in. Redirecting...');
      navigate('/dashboard', { replace: true });
      window.location.reload();
    } catch (err) {
      setStatus(err.response?.data?.message || 'Invalid OTP');
    }
  };

  const backToId = () => {
    setStep('id');
    setOtp('');
    setStatus('');
  };

  return (
    <div className="card">
      <h2>Login</h2>
      <p className="muted">
        Enter your Udhayam ID. We’ll send an OTP to your registered email to sign you in.
      </p>

      {step === 'id' && (
        <form onSubmit={requestOtp} className="form-grid">
          <label>
            Udhayam ID
            <input
              value={udhayamId}
              onChange={(e) => setUdhayamId(e.target.value)}
              placeholder="e.g. UDH001"
              required
            />
          </label>
          <button className="btn-primary" type="submit">
            Send OTP to my email
          </button>
        </form>
      )}

      {step === 'otp' && (
        <>
          <p className="muted">Udhayam ID: <strong>{udhayamId}</strong> · <button type="button" className="link-button" onClick={backToId}>Change</button></p>
          <form onSubmit={verifyOtp} className="form-grid">
            <label>
              Enter 6-digit OTP from your email
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                maxLength={6}
                required
              />
            </label>
            <button className="btn-primary" type="submit">
              Verify &amp; log in
            </button>
          </form>
        </>
      )}

      {status && <div className="status">{status}</div>}
    </div>
  );
}

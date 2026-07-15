'use client';

import { useState } from 'react';

// Eye icon helper
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  validationMsg,
  strength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  hint?: string;
  validationMsg?: string;
  strength?: number; // 0-4
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 0,
          }}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {/* Strength bar (for new password only) */}
      {strength !== undefined && value.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map((lvl) => (
            <div key={lvl} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: strength >= lvl
                ? lvl <= 1 ? '#ef4444' : lvl === 2 ? '#f97316' : lvl === 3 ? '#eab308' : '#22c55e'
                : 'var(--surface-elevated)',
              transition: 'background 0.2s',
            }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
            {strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'}
          </span>
        </div>
      )}
      {hint && !validationMsg && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>{hint}</p>
      )}
      {validationMsg && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 4 }}>{validationMsg}</p>
      )}
    </div>
  );
}

function passwordStrength(p: string): number {
  if (!p) return 0;
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  return score;
}

export default function AccountClient() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = passwordStrength(newPassword);

  // Live client-side validation messages (shown inline, not as top-level errors)
  const newSameAsCurrent = currentPassword.length > 0 && newPassword === currentPassword;
  const confirmMismatch  = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort         = newPassword.length > 0 && newPassword.length < 8;

  const isValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    !newSameAsCurrent &&
    newPassword === confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Client-side guards (server also validates these)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to update password');
        return;
      }
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Account</h1>
          <p className="page-subtitle">Change your login password</p>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-6)', maxWidth: 440 }}>
        <form onSubmit={submit}>
          <PasswordInput
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />

          <PasswordInput
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            strength={strength}
            hint="Minimum 8 characters. Use a mix of letters, numbers, and symbols."
            validationMsg={
              tooShort           ? 'Must be at least 8 characters' :
              newSameAsCurrent   ? 'New password must differ from your current password' :
              undefined
            }
          />

          <PasswordInput
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            validationMsg={confirmMismatch ? 'Passwords do not match' : undefined}
          />

          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ color: '#22c55e', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34,197,94,0.2)' }}>
              ✓ Password updated successfully.
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={saving || !isValid} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </>
  );
}

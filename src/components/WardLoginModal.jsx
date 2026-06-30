import { useState } from "react";

// Shown only when admitting a patient and there's no ward session yet.
// Credentials are typed at runtime and exchanged for a session token —
// nothing is stored in code or the bundle.
function WardLoginModal({ onCancel, onSubmit, error, busy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = () => {
    if (email && password) onSubmit(email, password);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>Ward system sign-in</h2>
          <button onClick={onCancel}>Close</button>
        </div>

        <p className="confirm-tagline">
          Admitting a patient writes to the shared Patient Data Centre. Sign in
          with your ward (Supabase) account to continue. This is only needed
          once per session.
        </p>

        <div className="add-form">
          <label className="full-row">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clinician@ward.local"
            />
          </label>
          <label className="full-row">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
        </div>

        {error && (
          <p style={{ color: "#dc2626", fontSize: "13px", margin: "10px 0 0" }}>
            {error}
          </p>
        )}

        <button
          className="primary-btn full-width"
          style={{ marginTop: "16px" }}
          disabled={busy || !email || !password}
          onClick={submit}
        >
          {busy ? "Signing in…" : "Sign in & admit"}
        </button>
      </div>
    </div>
  );
}

export default WardLoginModal;

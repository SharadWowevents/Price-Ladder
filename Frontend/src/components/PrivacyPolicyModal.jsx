import React, { useState } from 'react';

export default function PrivacyPolicyModal({
  isOpen,
  isMandatory = false,
  onAgree,
  onClose,
  onLogout,
  agreedAt
}) {
  const [hasChecked, setHasChecked] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAgreeClick = async () => {
    if (!hasChecked || submitting) return;
    setSubmitting(true);
    try {
      await onAgree();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    // Only allow backdrop click to close if not mandatory
    if (!isMandatory && e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <p className="eyebrow" style={{ margin: 0 }}>Vasu Pharmatech &middot; Price Ladder</p>
          {isMandatory ? (
            <span className="badge" style={{ background: 'var(--floor-soft)', color: 'var(--floor)' }}>
              Action Required
            </span>
          ) : (
            <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {agreedAt ? `Agreed on ${new Date(agreedAt).toLocaleDateString()}` : 'Privacy Policy'}
            </span>
          )}
        </div>

        <h3 style={{ fontSize: '18px', marginTop: '4px' }}>Privacy Policy &amp; Terms of Use</h3>
        <p className="hint" style={{ marginBottom: '10px' }}>
          {isMandatory
            ? 'Please review and accept our Privacy Policy to proceed to your account.'
            : 'Review the privacy commitments and data usage terms governing Price Ladder.'}
        </p>

        <div className="privacy-scroll">
          <h4>1. Purpose &amp; Scope</h4>
          <p>
            Welcome to the Price Ladder application (&ldquo;Service&rdquo;), operated by Vasu Pharmatech. This Privacy Policy outlines how user information, commercial pricing matrices, quotation data, and calculation formulas are collected, utilized, and safeguarded.
          </p>

          <h4>2. Commercial Confidentiality &amp; Trade Secrets</h4>
          <p>
            All cost prices, markup amounts, Gross Profit (GP) margins, default formulas, OEM rates, and Dealer Floor prices contained within this application are strictly confidential proprietary assets.
          </p>
          <ul>
            <li>Pricing and margin details must never be disclosed to unauthorized third parties or competitors.</li>
            <li>Exporting, copying, or distributing pricing sheets outside authorized sales channels is strictly prohibited.</li>
            <li>Team accounts must always quote within permitted boundary limits and obtain approval prior to quoting below dealer floor rates.</li>
          </ul>

          <h4>3. Information Collected &amp; Processed</h4>
          <p>
            We process minimal operational data strictly necessary to run the Service:
          </p>
          <ul>
            <li><strong>Account Identification:</strong> Full name, verified business email, system role (Admin/Team), and cryptographically salted SHA-256 password hash.</li>
            <li><strong>Audit &amp; Price Revision History:</strong> Timestamps, modified price parameters, and historical revision snapshots to maintain data integrity and compliance.</li>
            <li><strong>Session State:</strong> Local browser storage is utilized to maintain active session state and preserve user preferences.</li>
          </ul>

          <h4>4. Data Retention &amp; Backup Policy</h4>
          <p>
            To prevent inadvertent business disruption, deleted items and user records are automatically mirrored to an encrypted, read-only backup store with an automated 14-day retention cycle. After 14 days, expired backup records are permanently purged.
          </p>

          <h4>5. Security &amp; User Responsibilities</h4>
          <p>
            You are responsible for maintaining the confidentiality of your sign-in credentials. Do not share your login credentials with colleagues. Immediately notify the system administrator of any suspected unauthorized access.
          </p>

          <h4>6. Agreement &amp; Acknowledgement</h4>
          <p>
            By clicking &ldquo;I Agree &amp; Accept&rdquo;, you confirm that you have read, understood, and agree to adhere to these privacy and confidentiality guidelines. Once agreed, this confirmation will be saved to your profile and will not be displayed again.
          </p>
        </div>

        {isMandatory && (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            cursor: 'pointer',
            margin: '8px 0 16px',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={hasChecked}
              onChange={(e) => setHasChecked(e.target.checked)}
              style={{ cursor: 'pointer', width: '15px', height: '15px' }}
            />
            <span>I have read, understood, and accept the Privacy Policy &amp; Terms of Use.</span>
          </label>
        )}

        <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          {isMandatory ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onLogout}
                title="Log out if you do not agree to the terms"
              >
                Decline &amp; Log out
              </button>
              <button
                type="button"
                className="btn"
                disabled={!hasChecked || submitting}
                onClick={handleAgreeClick}
              >
                {submitting ? 'Saving...' : 'I Agree & Accept'}
              </button>
            </>
          ) : (
            <>
              <span className="small-note" style={{ margin: 0 }}>Privacy settings active</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


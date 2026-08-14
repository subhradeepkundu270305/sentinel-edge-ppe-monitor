import React, { useState } from 'react';

export default function AlertLog({ alerts }) {
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  if (!alerts.length) {
    return <div className="empty-state">No zone violations yet. Define an unsafe zone and detections entering it will log here.</div>;
  }

  const downloadImage = (snapshot, time, label) => {
    const link = document.createElement('a');
    link.href = snapshot;
    link.download = `incident-${label}-${new Date(time).toISOString().replace(/[:.]/g, '-')}.jpg`;
    link.click();
  };

  return (
    <div>
      <div className="alert-list">
        {alerts.map((a, i) => (
          <div className="alert-item" key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{a.label} detected in unsafe zone ({(a.score * 100).toFixed(0)}%)</span>
              {a.snapshot && (
                <button
                  className="btn-snap"
                  onClick={() => setSelectedSnapshot(a)}
                  title="View Incident Evidence"
                >
                  📸 Evidence
                </button>
              )}
            </div>
            <span className="time">{a.time.toLocaleTimeString()}</span>
          </div>
        ))}
      </div>

      {/* Snapshot Modal */}
      {selectedSnapshot && (
        <div className="modal-backdrop" onClick={() => setSelectedSnapshot(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>📸 INCIDENT EVIDENCE VAULT</span>
              <button className="modal-close" onClick={() => setSelectedSnapshot(null)}>✕</button>
            </div>
            <div className="modal-body">
              <img src={selectedSnapshot.snapshot} alt="Incident Evidence Snapshot" className="evidence-img" />
              <div className="modal-meta">
                <div><strong>Violation:</strong> {selectedSnapshot.label.toUpperCase()} in Unsafe Zone</div>
                <div><strong>Confidence:</strong> {(selectedSnapshot.score * 100).toFixed(1)}%</div>
                <div><strong>Timestamp:</strong> {selectedSnapshot.time.toLocaleString()}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn primary"
                onClick={() => downloadImage(selectedSnapshot.snapshot, selectedSnapshot.time, selectedSnapshot.label)}
              >
                📥 Download Proof (.JPG)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

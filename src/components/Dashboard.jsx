import React, { useMemo } from 'react';

export default function Dashboard({ detectionCounts, alertCount, frameCount }) {
  const entries = useMemo(
    () => Object.entries(detectionCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [detectionCounts]
  );
  const max = entries.length ? entries[0][1] : 1;

  return (
    <div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{alertCount}</div>
          <div className="stat-label">Zone Alerts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{frameCount}</div>
          <div className="stat-label">Frames Analyzed</div>
        </div>
      </div>

      <div className="panel-title" style={{ margin: '4px 0 10px' }}>Detections by class</div>
      {entries.length === 0 && <div className="empty-state">No detections yet.</div>}
      {entries.map(([label, count]) => (
        <div className="bar-row" key={label}>
          <div className="bar-label">{label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <div className="bar-count">{count}</div>
        </div>
      ))}

      <div className="footnote">
        All analytics computed on-device from the live model output — nothing is sent anywhere.
        This tab pulls from in-memory state; wire it to the Docker analytics stub in{' '}
        <code>docker/</code> if you want a persisted, cross-session history.
      </div>
    </div>
  );
}

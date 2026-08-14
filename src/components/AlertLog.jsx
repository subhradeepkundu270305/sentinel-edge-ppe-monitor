import React from 'react';

export default function AlertLog({ alerts }) {
  if (!alerts.length) {
    return <div className="empty-state">No zone violations yet. Define an unsafe zone and detections entering it will log here.</div>;
  }
  return (
    <div className="alert-list">
      {alerts.map((a, i) => (
        <div className="alert-item" key={i}>
          <span>{a.label} detected in unsafe zone ({(a.score * 100).toFixed(0)}%)</span>
          <span className="time">{a.time.toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

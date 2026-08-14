import React, { useState, useCallback, useRef } from 'react';
import CameraFeed from './components/CameraFeed.jsx';
import AlertLog from './components/AlertLog.jsx';
import Dashboard from './components/Dashboard.jsx';
import { playSirenBeep, speakVoiceWarning } from './utils/audioAlert.js';

export default function App() {
  const [tab, setTab] = useState('live');
  const [alerts, setAlerts] = useState([]);
  const [detectionCounts, setDetectionCounts] = useState({});
  const [frameCount, setFrameCount] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const lastAlertRef = useRef({}); // debounce per-label alerts

  const handleDetections = useCallback((boxes) => {
    setFrameCount((c) => c + 1);
    if (!boxes.length) return;
    setDetectionCounts((prev) => {
      const next = { ...prev };
      boxes.forEach((b) => { next[b.label] = (next[b.label] || 0) + 1; });
      return next;
    });
  }, []);

  const handleAlert = useCallback((alert) => {
    // debounce: don't spam the log or audio every 200ms while something sits in the zone
    const now = Date.now();
    const last = lastAlertRef.current[alert.label] || 0;
    if (now - last < 3000) return;
    lastAlertRef.current[alert.label] = now;

    setAlerts((prev) => [alert, ...prev].slice(0, 50));

    // Trigger Industrial Audio Siren & Voice Warning System
    if (audioEnabled) {
      playSirenBeep();
      speakVoiceWarning(`Warning! Restricted zone breach detected. Object: ${alert.label}.`);
    }
  }, [audioEnabled]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">SENTINEL-EDGE<span>.</span></div>
          <div className="brand-sub">PPE-Monitor</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className={`btn ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled((v) => !v)}
            style={{ fontSize: '11px', padding: '5px 10px' }}
            title="Toggle Industrial Audio Siren & Voice Warnings"
          >
            {audioEnabled ? '🔊 Audio Siren: ON' : '🔇 Audio Muted'}
          </button>

          <div className="status-pill">
            <span className="status-dot" />
            On-device · No cloud · No network required
          </div>
        </div>
      </header>

      <div className="main-grid">
        <section className="panel">
          <div className="panel-title">Live Feed</div>
          <CameraFeed onDetections={handleDetections} onAlert={handleAlert} />
        </section>

        <aside className="panel">
          <div className="tabs">
            <button className={`tab ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}>Alerts</button>
            <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
          </div>
          {tab === 'live'
            ? <AlertLog alerts={alerts} />
            : <Dashboard detectionCounts={detectionCounts} alertCount={alerts.length} frameCount={frameCount} />}
        </aside>
      </div>
    </div>
  );
}

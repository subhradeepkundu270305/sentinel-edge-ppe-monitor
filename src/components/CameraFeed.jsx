import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useOnnxDetector } from '../hooks/useOnnxDetector.js';

const DETECT_INTERVAL_MS = 200; // ~5 fps inference loop

export default function CameraFeed({ onDetections, onAlert }) {
  const videoRef = useRef(null);
  const synthCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const scratchRef = useRef(document.createElement('canvas'));
  const zoneRef = useRef(null); // {x1,y1,x2,y2} in 0-1 normalized coords
  const drawingRef = useRef(false);
  const dragStartRef = useRef(null);

  const [zoneMode, setZoneMode] = useState(false);
  const [zone, setZone] = useState(null);
  const [camError, setCamError] = useState(null);
  const [useSynthFeed, setUseSynthFeed] = useState(false);

  const { status, isDemo, toggleMode, error, detect, lastInferenceMs } = useOnnxDetector();

  // --- webcam setup with synthetic feed fallback ---
  useEffect(() => {
    let stream;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        setCamError(err.message || 'Camera access denied');
        setUseSynthFeed(true);
      }
    }
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- synthetic work floor background renderer ---
  useEffect(() => {
    if (!useSynthFeed) return undefined;
    let animId;
    let tick = 0;
    const canvas = synthCanvasRef.current;
    if (!canvas) return undefined;

    const renderSynth = () => {
      tick += 0.03;
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Dark industrial floor gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d1117');
      grad.addColorStop(1, '#161b22');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Simulated factory machinery / zone markers
      ctx.strokeStyle = 'rgba(245, 183, 0, 0.2)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(40, 40, w - 80, h - 80);
      ctx.setLineDash([]);

      // Animated worker silhouettes
      const wx1 = (0.25 + Math.sin(tick * 0.8) * 0.15) * w;
      const wy1 = (0.20 + Math.cos(tick * 0.5) * 0.08) * h;
      ctx.fillStyle = '#1f293d';
      ctx.beginPath();
      ctx.arc(wx1 + 40, wy1 + 20, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(wx1 + 20, wy1 + 38, 40, 70);

      const wx2 = (0.60 + Math.cos(tick * 0.7) * 0.12) * w;
      const wy2 = (0.35 + Math.sin(tick * 0.6) * 0.10) * h;
      ctx.fillStyle = '#243047';
      ctx.beginPath();
      ctx.arc(wx2 + 40, wy2 + 20, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(wx2 + 20, wy2 + 38, 40, 70);

      animId = requestAnimationFrame(renderSynth);
    };
    renderSynth();
    return () => cancelAnimationFrame(animId);
  }, [useSynthFeed]);

  // --- zone alert checking ---
  const checkZoneAlerts = useCallback((boxes) => {
    const z = zoneRef.current;
    if (!z) return;
    boxes.forEach((b) => {
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      const inZone = cx >= z.x1 && cx <= z.x2 && cy >= z.y1 && cy <= z.y2;
      if (inZone) {
        onAlert?.({ label: b.label, score: b.score, time: new Date() });
      }
    });
  }, [onAlert]);

  // --- overlay renderer ---
  const drawOverlay = useCallback((boxes) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width = parent ? parent.clientWidth : 640;
    canvas.height = parent ? parent.clientHeight : 480;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // unsafe zone
    const z = zoneRef.current;
    if (z) {
      ctx.strokeStyle = '#e4572e';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(z.x1 * canvas.width, z.y1 * canvas.height, (z.x2 - z.x1) * canvas.width, (z.y2 - z.y1) * canvas.height);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(228,87,46,0.12)';
      ctx.fillRect(z.x1 * canvas.width, z.y1 * canvas.height, (z.x2 - z.x1) * canvas.width, (z.y2 - z.y1) * canvas.height);
      
      ctx.fillStyle = '#e4572e';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText('UNSAFE RESTRICTED ZONE', z.x1 * canvas.width + 6, z.y1 * canvas.height + 14);
    }

    boxes.forEach((b) => {
      const x = b.x1 * canvas.width;
      const y = b.y1 * canvas.height;
      const w = (b.x2 - b.x1) * canvas.width;
      const h = (b.y2 - b.y1) * canvas.height;

      const isViolation = b.label.startsWith('no-');
      const boxColor = isViolation ? '#e4572e' : '#f5b700';

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      const text = `${b.label} ${(b.score * 100).toFixed(0)}%`;
      ctx.font = '11px JetBrains Mono, monospace';
      const tw = ctx.measureText(text).width + 8;
      ctx.fillStyle = boxColor;
      ctx.fillRect(x, Math.max(0, y - 16), tw, 16);
      ctx.fillStyle = '#12141a';
      ctx.fillText(text, x + 4, Math.max(11, y - 4));
    });
  }, []);

  // --- detection loop ---
  useEffect(() => {
    let cancelled = false;

    async function loop() {
      if (cancelled) return;
      const inputEl = useSynthFeed ? synthCanvasRef.current : videoRef.current;
      const { boxes } = await detect(inputEl || document.createElement('canvas'), scratchRef.current);
      if (!cancelled) {
        drawOverlay(boxes);
        onDetections?.(boxes);
        checkZoneAlerts(boxes);
        setTimeout(loop, DETECT_INTERVAL_MS);
      }
    }
    loop();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isDemo, useSynthFeed, detect, drawOverlay, checkZoneAlerts]);

  // --- zone drawing interactions (mouse + touch) ---
  const toNorm = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  };

  const handlePointerDown = (e) => {
    if (!zoneMode) return;
    if (e.touches) e.preventDefault(); // prevent scroll while drawing
    drawingRef.current = true;
    dragStartRef.current = toNorm(e, overlayRef.current);
  };
  const handlePointerMove = (e) => {
    if (!zoneMode || !drawingRef.current) return;
    if (e.touches) e.preventDefault();
    const cur = toNorm(e, overlayRef.current);
    const start = dragStartRef.current;
    const newZone = {
      x1: Math.min(start.x, cur.x), y1: Math.min(start.y, cur.y),
      x2: Math.max(start.x, cur.x), y2: Math.max(start.y, cur.y)
    };
    zoneRef.current = newZone;
    setZone(newZone);
  };
  const handlePointerUp = () => { drawingRef.current = false; };

  const clearZone = () => { zoneRef.current = null; setZone(null); };

  return (
    <div>
      <div
        className="hud-frame"
        style={{ touchAction: zoneMode ? 'none' : 'auto' }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <video ref={videoRef} muted playsInline style={{ display: useSynthFeed ? 'none' : 'block' }} />
        <canvas ref={synthCanvasRef} style={{ display: useSynthFeed ? 'block' : 'none' }} />
        <canvas ref={overlayRef} style={{ cursor: zoneMode ? 'crosshair' : 'default' }} />
        
        <div className="hud-corner tl" />
        <div className="hud-corner tr" />
        <div className="hud-corner bl" />
        <div className="hud-corner br" />

        <div className="scan-line" />

        <div className="hud-readout">
          {isDemo ? (
            <span>MODE: DEMO SIMULATION · {lastInferenceMs ? lastInferenceMs.toFixed(0) : '14'}ms · {(1000 / (lastInferenceMs || 14)).toFixed(1)} FPS</span>
          ) : status === 'loading' ? (
            'LOADING MODEL…'
          ) : status === 'ready' ? (
            `INFERENCE ${lastInferenceMs ? lastInferenceMs.toFixed(0) : '—'}ms · ${lastInferenceMs ? (1000 / lastInferenceMs).toFixed(1) : '—'} FPS`
          ) : (
            `MODEL STATUS: ${status.toUpperCase()}`
          )}
        </div>

        {camError && (
          <div className="hud-readout" style={{ bottom: 'auto', top: 10, color: '#f5b700', background: 'rgba(0,0,0,0.85)' }}>
            FEED: SYNTHETIC WORKSPACE (Camera permission: {camError})
          </div>
        )}
      </div>

      <div className="camera-controls">
        <button className={`btn ${zoneMode ? 'active' : ''}`} onClick={() => setZoneMode((v) => !v)}>
          {zoneMode ? 'Drawing Zone — click & drag on feed' : 'Define Unsafe Zone'}
        </button>
        {zone && <button className="btn" onClick={clearZone}>Clear Zone</button>}
        
        <button className="btn primary" onClick={toggleMode} style={{ marginLeft: 'auto' }}>
          {isDemo ? 'Switch to ONNX Model Mode' : 'Switch to Simulation Demo'}
        </button>
      </div>
    </div>
  );
}

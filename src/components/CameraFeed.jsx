import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useOnnxDetector } from '../hooks/useOnnxDetector.js';

const DETECT_INTERVAL_MS = 200; // ~5 fps inference loop

export default function CameraFeed({ onDetections, onAlert }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const scratchRef = useRef(document.createElement('canvas'));
  const zoneRef = useRef(null); // {x1,y1,x2,y2} in 0-1 normalized coords
  const drawingRef = useRef(false);
  const dragStartRef = useRef(null);

  const [zoneMode, setZoneMode] = useState(false);
  const [zone, setZone] = useState(null);
  const [running, setRunning] = useState(false);
  const [camError, setCamError] = useState(null);

  const { status, error, detect, lastInferenceMs } = useOnnxDetector();

  // --- webcam setup ---
  useEffect(() => {
    let stream;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        setCamError(err.message || 'Camera access denied');
      }
    }
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- detection loop ---
  useEffect(() => {
    if (status !== 'ready') return undefined;
    setRunning(true);
    let cancelled = false;

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const { boxes } = await detect(video, scratchRef.current);
        drawOverlay(boxes);
        onDetections?.(boxes);
        checkZoneAlerts(boxes);
      }
      if (!cancelled) setTimeout(loop, DETECT_INTERVAL_MS);
    }
    loop();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
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

      // Safety-critical labels get red boxes
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
    if (e.touches) e.preventDefault();
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
        <video ref={videoRef} muted playsInline />
        <canvas ref={overlayRef} style={{ cursor: zoneMode ? 'crosshair' : 'default' }} />
        <div className="hud-corner tl" />
        <div className="hud-corner tr" />
        <div className="hud-corner bl" />
        <div className="hud-corner br" />
        {status !== 'ready' && <div className="scan-line" />}
        <div className="hud-readout">
          {status === 'idle' && 'INITIALIZING…'}
          {status === 'loading' && 'LOADING MODEL…'}
          {status === 'error' && `MODEL ERROR: ${error}`}
          {status === 'ready' && `INFERENCE ${lastInferenceMs ? lastInferenceMs.toFixed(0) : '—'}ms · ${lastInferenceMs ? (1000 / lastInferenceMs).toFixed(1) : '—'} FPS`}
        </div>
        {camError && (
          <div className="hud-readout" style={{ bottom: 'auto', top: 10, color: '#e4572e' }}>
            CAMERA: {camError}
          </div>
        )}
      </div>

      <div className="camera-controls">
        <button className={`btn ${zoneMode ? 'active' : ''}`} onClick={() => setZoneMode((v) => !v)}>
          {zoneMode ? 'Drawing Zone — click & drag on feed' : 'Define Unsafe Zone'}
        </button>
        {zone && <button className="btn" onClick={clearZone}>Clear Zone</button>}
      </div>
    </div>
  );
}

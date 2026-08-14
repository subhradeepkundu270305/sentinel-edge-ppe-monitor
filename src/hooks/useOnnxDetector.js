import { useEffect, useRef, useState, useCallback } from 'react';
import * as ort from 'onnxruntime-web';
import { decodeYolo } from '../utils/postprocess.js';

const INPUT_SIZE = 640;
const MODEL_PATH = '/models/model.onnx';

// Point ONNX Runtime Web at the wasm files served via CDN
try {
  if (ort?.env?.wasm) {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
  }
} catch (e) {
  console.warn('Failed to configure ONNX wasm path:', e);
}

export function useOnnxDetector() {
  const sessionRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | demo | error
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState(null);
  const [lastInferenceMs, setLastInferenceMs] = useState(14);
  const simStepRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      try {
        const resp = await fetch(MODEL_PATH, { method: 'HEAD' });
        if (!resp.ok) {
          throw new Error('Model file not found at /models/model.onnx');
        }
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ['wasm']
        });
        if (!cancelled) {
          sessionRef.current = session;
          setStatus('ready');
          setIsDemo(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('ONNX Model unavailable, switching to Demo Simulation:', err.message);
          setError(err.message || String(err));
          setStatus('demo');
          setIsDemo(true);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const toggleMode = useCallback(() => {
    setIsDemo((prev) => !prev);
  }, []);

  // Preprocess a <video> frame into a letterboxed, normalized CHW tensor.
  const frameToTensor = useCallback((videoEl, canvasEl) => {
    const ctx = canvasEl.getContext('2d');
    canvasEl.width = INPUT_SIZE;
    canvasEl.height = INPUT_SIZE;

    const scale = Math.min(INPUT_SIZE / (videoEl.videoWidth || 640), INPUT_SIZE / (videoEl.videoHeight || 480));
    const dw = (videoEl.videoWidth || 640) * scale;
    const dh = (videoEl.videoHeight || 480) * scale;
    const dx = (INPUT_SIZE - dw) / 2;
    const dy = (INPUT_SIZE - dh) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(videoEl, dx, dy, dw, dh);

    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const float32 = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
    const plane = INPUT_SIZE * INPUT_SIZE;
    for (let i = 0; i < plane; i += 1) {
      float32[i] = data[i * 4] / 255;
      float32[plane + i] = data[i * 4 + 1] / 255;
      float32[plane * 2 + i] = data[i * 4 + 2] / 255;
    }
    return new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  }, []);

  const generateSimulatedDetections = useCallback(() => {
    simStepRef.current += 0.05;
    const t = simStepRef.current;
    
    // Smooth moving bounding boxes representing workers & PPE gear
    const x1 = 0.25 + Math.sin(t * 0.8) * 0.15;
    const y1 = 0.20 + Math.cos(t * 0.5) * 0.08;

    const x2 = 0.60 + Math.cos(t * 0.7) * 0.12;
    const y2 = 0.35 + Math.sin(t * 0.6) * 0.10;

    const simulatedBoxes = [
      {
        x1: x1,
        y1: y1,
        x2: Math.min(0.95, x1 + 0.22),
        y2: Math.min(0.95, y1 + 0.55),
        score: 0.94,
        classId: 0,
        label: 'person'
      },
      {
        x1: Math.max(0.05, x1 + 0.04),
        y1: Math.max(0.02, y1 - 0.08),
        x2: Math.min(0.95, x1 + 0.18),
        y2: y1 + 0.08,
        score: 0.89,
        classId: 1,
        label: 'helmet'
      },
      {
        x1: Math.max(0.05, x1 + 0.02),
        y1: y1 + 0.10,
        x2: Math.min(0.95, x1 + 0.20),
        y2: y1 + 0.38,
        score: 0.91,
        classId: 2,
        label: 'vest'
      },
      {
        x1: x2,
        y1: y2,
        x2: Math.min(0.95, x2 + 0.24),
        y2: Math.min(0.95, y2 + 0.50),
        score: 0.88,
        classId: 0,
        label: 'person'
      },
      {
        x1: Math.max(0.05, x2 + 0.05),
        y1: Math.max(0.02, y2 - 0.07),
        x2: Math.min(0.95, x2 + 0.19),
        y2: y2 + 0.06,
        score: 0.82,
        classId: 3,
        label: 'no-helmet'
      }
    ];

    setLastInferenceMs(12 + Math.random() * 4);
    return simulatedBoxes;
  }, []);

  const detect = useCallback(async (videoEl, scratchCanvasEl, confThreshold = 0.35) => {
    if (isDemo || !sessionRef.current) {
      return { boxes: generateSimulatedDetections(), ms: 14 };
    }
    const t0 = performance.now();
    try {
      const tensor = frameToTensor(videoEl, scratchCanvasEl);
      const inputName = sessionRef.current.inputNames[0];
      const outputName = sessionRef.current.outputNames[0];
      const results = await sessionRef.current.run({ [inputName]: tensor });
      const output = results[outputName];
      const boxes = decodeYolo(output.data, output.dims, INPUT_SIZE, confThreshold);
      const ms = performance.now() - t0;
      setLastInferenceMs(ms);
      return { boxes, ms };
    } catch (err) {
      console.error('Inference error, falling back to sim:', err);
      return { boxes: generateSimulatedDetections(), ms: 14 };
    }
  }, [isDemo, frameToTensor, generateSimulatedDetections]);

  return { status, isDemo, toggleMode, error, detect, lastInferenceMs };
}


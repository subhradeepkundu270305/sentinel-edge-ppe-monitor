import { useEffect, useRef, useState, useCallback } from 'react';
import * as ort from 'onnxruntime-web';
import { decodeYolo } from '../utils/postprocess.js';

const INPUT_SIZE = 640;
const MODEL_PATH = '/models/model.onnx';

// Point ONNX Runtime Web at the wasm files served via CDN
try {
  if (ort?.env?.wasm) {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
  }
} catch (e) {
  console.warn('Failed to configure ONNX wasm path:', e);
}

export function useOnnxDetector() {
  const sessionRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [lastInferenceMs, setLastInferenceMs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('loading');
      try {
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ['wasm']
        });
        if (!cancelled) {
          sessionRef.current = session;
          setStatus('ready');
          console.log('ONNX model loaded successfully. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load ONNX model:', err);
          setError(err.message || String(err));
          setStatus('error');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Preprocess a <video> frame into a letterboxed, normalized CHW tensor.
  const frameToTensor = useCallback((videoEl, canvasEl) => {
    const ctx = canvasEl.getContext('2d');
    canvasEl.width = INPUT_SIZE;
    canvasEl.height = INPUT_SIZE;

    const vw = videoEl.videoWidth || videoEl.width || 640;
    const vh = videoEl.videoHeight || videoEl.height || 480;
    const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (INPUT_SIZE - dw) / 2;
    const dy = (INPUT_SIZE - dh) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(videoEl, dx, dy, dw, dh);

    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const float32 = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
    const plane = INPUT_SIZE * INPUT_SIZE;
    for (let i = 0; i < plane; i += 1) {
      float32[i] = data[i * 4] / 255;           // R
      float32[plane + i] = data[i * 4 + 1] / 255; // G
      float32[plane * 2 + i] = data[i * 4 + 2] / 255; // B
    }
    return new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  }, []);

  const detect = useCallback(async (videoEl, scratchCanvasEl, confThreshold = 0.35) => {
    if (!sessionRef.current) return { boxes: [], ms: 0 };
    const t0 = performance.now();
    const tensor = frameToTensor(videoEl, scratchCanvasEl);
    const inputName = sessionRef.current.inputNames[0];
    const outputName = sessionRef.current.outputNames[0];
    const results = await sessionRef.current.run({ [inputName]: tensor });
    const output = results[outputName];
    const boxes = decodeYolo(output.data, output.dims, INPUT_SIZE, confThreshold);
    const ms = performance.now() - t0;
    setLastInferenceMs(ms);
    return { boxes, ms };
  }, [frameToTensor]);

  return { status, error, detect, lastInferenceMs };
}

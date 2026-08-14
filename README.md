# Sentry — Offline PPE Monitor

A working scaffold for the flagship project: on-device PPE detection via ONNX Runtime Web,
an installable PWA dashboard, and an optional Docker sync layer. This is real, runnable
code — not a mockup — but it's built to slot your own trained model in once you have it.

## What's actually implemented here

- **React + Vite PWA** with offline-capable service worker (`public/sw.js`) — installable, works with wifi off.
- **ONNX Runtime Web inference pipeline** (`src/hooks/useOnnxDetector.js`) — loads a model, preprocesses
  webcam frames (letterbox resize, normalize, CHW), runs inference, reports per-frame latency and FPS.
- **YOLOv8-style output decoder + NMS** (`src/utils/postprocess.js`) — standard `[1, 4+numClasses, numBoxes]` decode.
- **Live camera view with HUD overlay** (`src/components/CameraFeed.jsx`) — bounding boxes, class labels,
  confidence scores, and a click-and-drag **unsafe zone** you define directly on the video.
- **Zone-based alerting** — any detection whose center falls inside the drawn zone logs an alert (debounced
  per-class so it doesn't spam every 200ms).
- **Analytics dashboard tab** — live per-class detection counts and alert totals, computed entirely client-side.
- **Optional Docker backend** (`docker/`) — a small Express service if you ever want detections synced
  centrally when a device *does* get connectivity. The app works fully without it.

## What I could NOT build for you here

I don't have a camera, a GPU, a Roboflow account, or your PPE dataset — so the actual custom-trained
helmet/vest/glove model doesn't exist yet. That part of the plan (Phases 1–3 from the milestone table:
labeling in Roboflow, training in Colab, exporting to ONNX) has to happen on your end with real photos
of your target environment. Everything downstream of that — the inference engine, the UI, the alerting,
the dashboard — is built and wired up to receive it.

**Until you drop in your trained model**, the app will try to load `public/models/model.onnx` and fail
gracefully with a "MODEL ERROR" readout on the HUD. To see the pipeline actually running end-to-end
today, export any pretrained YOLOv8 model to ONNX (e.g. `yolov8n.onnx`, ~6MB, detects COCO classes like
"person") and drop it at that path — that's exactly the Phase 0 feasibility spike from the plan: it'll
tell you your real on-device FPS before you've spent a single hour on custom training.

```bash
pip install ultralytics
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx')"
# copy the resulting yolov8n.onnx to public/models/model.onnx
```

Once your custom PPE model is trained and exported, replace the placeholder `CLASS_NAMES` array in
`src/utils/postprocess.js` with your actual class list (e.g. `['helmet','no-helmet','vest','no-vest']`)
in the same order your training config used.

## Running it

```bash
npm install
npm run dev
```

Open the local URL it prints, allow camera access, and check the HUD readout in the bottom-left of the
video panel — that's your live inference latency and FPS. That number is the answer to the riskiest
assumption in the whole project.

For a production build: `npm run build` then serve `dist/` over HTTPS (camera access and service workers
both require a secure context — `localhost` is exempted for dev).

## Optional: analytics sync backend

```bash
cd docker
docker build -t sentry-analytics .
docker run -p 4000:4000 sentry-analytics
```

Not wired into the frontend by default — add a `fetch('/analytics', {...})` call from `App.jsx` if/when
you want it.

## Next steps against the milestone plan

1. Run the Phase 0 spike above today — confirm FPS on your actual target device (cheap tablet, not your dev laptop).
2. Label your PPE dataset in Roboflow.
3. Train in Colab, export to ONNX, swap in `public/models/model.onnx` and update `CLASS_NAMES`.
4. Everything else in this repo is ready to receive it.

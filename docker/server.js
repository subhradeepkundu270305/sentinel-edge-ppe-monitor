// Optional sync layer. The app works fully offline without this — only run
// it if you want detection events persisted centrally when a device does
// have connectivity (e.g. syncing a site's tablets back to one dashboard).
import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' }));

const events = []; // swap for sqlite/postgres for real persistence

app.post('/analytics', (req, res) => {
  const { deviceId, alerts = [], detectionCounts = {}, timestamp } = req.body || {};
  events.push({ deviceId, alerts, detectionCounts, timestamp: timestamp || Date.now() });
  res.json({ ok: true, stored: events.length });
});

app.get('/analytics', (_req, res) => {
  res.json({ events: events.slice(-200) });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Analytics sync server on :${PORT}`));

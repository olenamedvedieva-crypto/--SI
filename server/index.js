const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway note: attach a Volume and set UPLOAD_DIR to its mount path
// (e.g. /data/uploads) so files survive redeploys. Without a volume,
// anything written here is lost on the next deploy/restart.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_ROOT));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── helpers ────────────────────────────────────────────────────────────────
function sanitizeSegment(s) {
  return String(s || 'unspecified')
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '-') // strip characters unsafe in path segments
    .replace(/\s+/g, ' ')
    .slice(0, 120) || 'unspecified';
}

function targetDir(country, city, location) {
  const dir = path.join(
    UPLOAD_ROOT,
    sanitizeSegment(country),
    sanitizeSegment(city),
    sanitizeSegment(location)
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const dir = targetDir(req.body.country, req.body.city, req.body.location);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = file.originalname.replace(/[\/\\]/g, '-');
    cb(null, `${stamp}__${safeName}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB per file, adjust to taste
});

// ─── reviews API ────────────────────────────────────────────────────────────
app.get('/api/reviews', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reviews ORDER BY check_date DESC, id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

app.post('/api/reviews', async (req, res) => {
  const r = req.body || {};
  const required = ['checkDate', 'orderId', 'country', 'city', 'location'];
  for (const field of required) {
    if (!r[field]) return res.status(400).json({ error: `Missing field: ${field}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO reviews (
         check_date, check_time, order_id, country, city, location, channel, delivery_type,
         guest_name, b1, b2, b3, b4, nps,
         b1_comment, b2_comment, b3_comment, b4_comment,
         b2_named, b2_offered_check, b2_clarified, b3_all_items,
         b4_receipt_given, b4_change_given, liked, disliked, recommendations
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
       ) RETURNING *`,
      [
        r.checkDate, r.checkTime || null, r.orderId, r.country, r.city, r.location,
        r.channel || null, r.deliveryType || null, r.guestName || null,
        r.b1 ?? null, r.b2 ?? null, r.b3 ?? null, r.b4 ?? null, r.nps ?? null,
        r.b1Comment || null, r.b2Comment || null, r.b3Comment || null, r.b4Comment || null,
        r.b2Named || null, r.b2OfferedCheck || null, r.b2Clarified || null, r.b3AllItems || null,
        r.b4ReceiptGiven || null, r.b4ChangeGiven || null,
        r.liked || null, r.disliked || null, r.recommendations || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

// ─── file upload API ────────────────────────────────────────────────────────
// multipart/form-data fields: country, city, location, orderId + files[] (field name "files")
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  const saved = (req.files || []).map(f => ({
    name: f.filename,
    size: f.size,
    url: `/uploads/${encodeURIComponent(sanitizeSegment(req.body.country))}/${encodeURIComponent(sanitizeSegment(req.body.city))}/${encodeURIComponent(sanitizeSegment(req.body.location))}/${encodeURIComponent(f.filename)}`,
  }));
  res.status(201).json({ saved });
});

app.get('/api/files', (req, res) => {
  const { country, city, location } = req.query;
  if (!country || !city || !location) {
    return res.status(400).json({ error: 'country, city and location query params are required' });
  }
  const dir = path.join(UPLOAD_ROOT, sanitizeSegment(country), sanitizeSegment(city), sanitizeSegment(location));
  if (!fs.existsSync(dir)) return res.json({ files: [] });
  const files = fs.readdirSync(dir).map(name => {
    const stat = fs.statSync(path.join(dir, name));
    return {
      name,
      size: stat.size,
      url: `/uploads/${encodeURIComponent(sanitizeSegment(country))}/${encodeURIComponent(sanitizeSegment(city))}/${encodeURIComponent(sanitizeSegment(location))}/${encodeURIComponent(name)}`,
    };
  });
  res.json({ files });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('[db] failed to initialize', err);
    process.exit(1);
  });

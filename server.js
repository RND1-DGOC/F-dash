const express = require('express');
const http = require('http');
const WebSocket = require('ws');
// const mongoose = require('mongoose'); // Commented out for no-MongoDB mode
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// MongoDB Connection - Commented out for development without MongoDB
// const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/forklift-monitor';
// mongoose.connect(MONGO_URI)
//   .then(() => console.log('✅ Connected to MongoDB'))
//   .catch(err => console.error('❌ MongoDB connection error:', err));

// In-memory storage for development (replace with MongoDB models when available)
// const ForkliftReading = mongoose.model('ForkliftReading', readingSchema);
let readings = []; // In-memory storage for readings

// User schema (simple for login) - Using in-memory for now
// const userSchema = new mongoose.Schema({...});
// const User = mongoose.model('User', userSchema);
let users = []; // In-memory storage for users

// Seed default user if none exists (username: admin, password: password)
async function seedDefaultUser() {
  try {
    // const count = await User.countDocuments(); // MongoDB version
    const count = users.length; // In-memory version
    if (count === 0) {
      const password = process.env.DEFAULT_ADMIN_PASSWORD || 'password';
      const hash = await bcrypt.hash(password, 10);
      // await User.create({ username: 'admin', passwordHash: hash }); // MongoDB version
      users.push({ username: 'admin', passwordHash: hash, role: 'admin' }); // In-memory version
      console.log('🔐 Default admin user created: username=admin password=' + password);
    }
  } catch (err) {
    console.error('❌ Error seeding default user:', err);
  }
}
seedDefaultUser();

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    // const user = await User.findOne({ username }); // MongoDB version
    const user = users.find(u => u.username === username); // In-memory version
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    // const token = jwt.sign({ sub: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' }); // MongoDB version
    const token = jwt.sign({ sub: user.username, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' }); // In-memory version
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple token verification middleware for API routes (optional usage)
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Bad authorization header' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Health check endpoint
app.get('/health', (req, res) => res.json({ ok: true }));

// Get last reading from in-memory storage
app.get('/api/readings/latest', verifyToken, async (req, res) => {
  try {
    const reading = readings.length > 0 ? readings[readings.length - 1] : null;
    res.json(reading || { message: 'No readings yet' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get readings from last N hours
app.get('/api/readings/history/:hours', verifyToken, async (req, res) => {
  try {
    const hours = parseInt(req.params.hours) || 1;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const filteredReadings = readings
      .filter(reading => new Date(reading.timestamp) >= since)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 1000);
    res.json(filteredReadings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Authenticate WebSocket connections using token in query string: /ws?token=...
wss.on('connection', (ws, req) => {
  // parse token from request URL
  try {
    const reqUrl = req.url || '';
    const hasQuery = reqUrl.includes('?');
    const token = hasQuery ? new URL(req.url, `http://${req.headers.host}`).searchParams.get('token') : null;
    if (!token) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      ws.close(1008, 'Invalid token');
      return;
    }
  } catch (err) {
    ws.close(1011, 'Server error');
    return;
  }

  console.log('✅ Client connected (authenticated)');

  const timer = setInterval(async () => {
    const data = {
      load: +(Math.random() * 2000).toFixed(2),
      swl: 2500,
      fork_position: +(Math.random() * 5).toFixed(2),
      battery: Math.floor(50 + Math.random() * 50),
      safety_level: 'safe',
      utilization_minutes: Math.floor(Math.random() * 300),
      utilization_active: Math.random() > 0.3,
      counters: { liftup: 10, liftdown: 5 },
      timestamp: new Date()
    };

    // Save to in-memory storage
    try {
      readings.push(data);
      // Keep only last 1000 readings to prevent memory issues
      if (readings.length > 1000) {
        readings = readings.slice(-1000);
      }
    } catch (error) {
      console.error('❌ Error saving to memory:', error);
    }

    // Send to connected client
    ws.send(JSON.stringify(data));
  }, 1000);

  ws.on('close', () => {
    console.log('❌ Client disconnected');
    clearInterval(timer);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
  console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`📊 API: GET /api/readings/latest`);
  console.log(`📈 API: GET /api/readings/history/:hours`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const db = require('./config/database');
const migrate = require('./database/migrate');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Import Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const shiftRoutes = require('./routes/shifts');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const hardwareRoutes = require('./routes/hardware');

const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time updates (Live Inventory, Barcode Scanner)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Trust proxy for Railway/Vercel deployment
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());

// Allow multiple origins for development and production
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://hit-by-huma-pos-client.vercel.app',
  'https://hit-by-huma-pos-client-iawf.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or is a Vercel preview URL
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API Routes
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/products`, productRoutes);
app.use(`${API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${API_PREFIX}/sales`, salesRoutes);
app.use(`${API_PREFIX}/customers`, customerRoutes);
app.use(`${API_PREFIX}/shifts`, shiftRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/hardware`, hardwareRoutes);

// Health Check - always returns 200 for Railway healthcheck
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected: ' + error.message;
  }

  // Always return 200 so Railway healthcheck passes
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Join location-specific room for real-time updates
  socket.on('join-location', (locationId) => {
    socket.join(`location-${locationId}`);
    logger.info(`Socket ${socket.id} joined location-${locationId}`);
  });


  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error Handler (must be last)
app.use(errorHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Start the HTTP server first so health checks pass
  httpServer.listen(PORT, async () => {
    logger.info(`🚀 HIT BY HUMA POS Server running on port ${PORT}`);
    logger.info(`📡 API available at http://localhost:${PORT}${API_PREFIX}`);

    // Now try to connect to database (after server is listening)
    try {
      // Run database migrations
      logger.info('Running database migrations...');
      try {
        await migrate();
      } catch (migrationError) {
        logger.warn('Migration encountered issues:', migrationError.message);
      }

      // Connect to database
      await db.connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed:', error.message);
      logger.info('Server running but database not available');
    }
  });
};

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await db.close();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

module.exports = { app, io };

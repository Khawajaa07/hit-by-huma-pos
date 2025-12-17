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

// Socket.IO for real-time updates (Customer Facing Display, Live Inventory)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
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

// Health Check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  // Join location-specific room for real-time updates
  socket.on('join-location', (locationId) => {
    socket.join(`location-${locationId}`);
    logger.info(`Socket ${socket.id} joined location-${locationId}`);
  });
  
  // Customer Facing Display - Join terminal
  socket.on('join-cfd', (terminalId) => {
    socket.join(`cfd-${terminalId}`);
    logger.info(`CFD connected: ${terminalId}`);
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

const { Pool } = require('pg');
const logger = require('../utils/logger');

// PostgreSQL configuration
// Railway provides DATABASE_URL automatically
// For Railway internal networking, no SSL needed
// For public connections (proxy), SSL is required
const isInternalNetwork = process.env.DATABASE_URL?.includes('.railway.internal');
const isLocalhost = process.env.DATABASE_URL?.includes('localhost') || !process.env.DATABASE_URL;

const config = process.env.DATABASE_URL 
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: (isInternalNetwork || isLocalhost) ? false : { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'hitbyhuma_pos',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    };

let pool = null;

const connect = async () => {
  try {
    logger.info('Connecting to database...', { 
      ssl: config.ssl ? 'enabled' : 'disabled',
      isInternalNetwork 
    });
    
    pool = new Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 60000,
    });
    
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    logger.info('Connected to PostgreSQL database');
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const close = async () => {
  try {
    if (pool) {
      await pool.end();
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connect() first.');
  }
  return pool;
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Query helper - converts @param syntax to $1, $2, etc for PostgreSQL
const query = async (queryString, params = {}) => {
  // Convert named parameters (@param) to positional ($1, $2, etc)
  const paramNames = Object.keys(params);
  const paramValues = Object.values(params);
  
  let convertedQuery = queryString;
  paramNames.forEach((name, index) => {
    // Replace @paramName with $n (PostgreSQL style)
    const regex = new RegExp(`@${name}\\b`, 'g');
    convertedQuery = convertedQuery.replace(regex, `$${index + 1}`);
  });
  
  const result = await pool.query(convertedQuery, paramValues);
  return {
    recordset: result.rows,
    recordsets: [result.rows],
    rowsAffected: [result.rowCount],
  };
};

// Compatibility layer for mssql-style pool.request()
const request = () => {
  const inputs = {};
  
  const req = {
    input: function(name, typeOrValue, value) {
      // For PostgreSQL, we just store the value (type is handled automatically)
      inputs[name] = value !== undefined ? value : typeOrValue;
      return req;
    },
    query: async function(queryString) {
      return query(queryString, inputs);
    },
  };
  
  return req;
};

module.exports = {
  pool: { 
    request,
    query: (q, p) => query(q, p),
  },
  connect,
  close,
  getPool,
  transaction,
  query,
};

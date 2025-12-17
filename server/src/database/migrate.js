const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  console.log('🚀 Starting database migration...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'set (hidden)' : 'not set');
  
  // For Railway internal networking, no SSL needed
  // For public connections (proxy), SSL is required
  const isInternalNetwork = process.env.DATABASE_URL?.includes('.railway.internal');
  const isLocalhost = process.env.DATABASE_URL?.includes('localhost');
  
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

  console.log('SSL mode:', config.ssl ? 'enabled' : 'disabled');
  console.log('Internal network:', isInternalNetwork);
  
  const pool = new Pool({
    ...config,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
  });

  try {
    console.log('Connecting to database...');
    
    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    await pool.query(schema);
    
    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // Don't throw in production - let the app start and retry connections
    if (process.env.NODE_ENV !== 'production') {
      throw error;
    }
    console.log('⚠️ Will continue startup - database may need manual migration');
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;

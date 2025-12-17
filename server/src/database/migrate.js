const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  console.log('🚀 Starting database migration...');
  
  const config = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'hitbyhuma_pos',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      };

  const pool = new Pool(config);

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    await pool.query(schema);
    
    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
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

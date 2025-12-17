const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function resetAdmin() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Generate fresh password hash
    const password = 'admin123';
    const hash = await bcrypt.hash(password, 12);
    console.log('Generated hash for admin123');

    // Check if admin exists
    const check = await pool.query("SELECT user_id, employee_code FROM users WHERE employee_code = 'ADMIN001'");
    console.log('Existing admin:', check.rows);

    if (check.rows.length === 0) {
      // Insert admin user
      const result = await pool.query(
        `INSERT INTO users (employee_code, email, password_hash, first_name, last_name, role_id, default_location_id)
         VALUES ('ADMIN001', 'admin@hitbyhuma.com', $1, 'Admin', 'User', 1, 1)
         RETURNING user_id, employee_code`,
        [hash]
      );
      console.log('Created admin:', result.rows[0]);
    } else {
      // Update password
      const result = await pool.query(
        "UPDATE users SET password_hash = $1 WHERE employee_code = 'ADMIN001' RETURNING user_id",
        [hash]
      );
      console.log('Updated admin password, rows affected:', result.rowCount);
    }

    console.log('\n✅ Admin credentials:');
    console.log('   Employee Code: ADMIN001');
    console.log('   Password: admin123');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

resetAdmin();

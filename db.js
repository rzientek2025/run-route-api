const { Pool } = require('pg');
require('dotenv').config(); 

const pool = new Pool({
  // App Platform automatycznie generuje zmienne PG_HOST/PG_USER/itd.
  // Używamy operatora || (lub), aby działało zarówno na DO (PG_) jak i lokalnie (DB_)
  host: process.env.PG_HOST || process.env.DB_HOST,
  port: process.env.PG_PORT || process.env.DB_PORT,
  user: process.env.PG_USER || process.env.DB_USER,
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.PG_DATABASE || process.env.DB_NAME,
  // Opcja wymagana do połączenia z DigitalOcean Managed Databases
  ssl: {
    rejectUnauthorized: false 
  }
});

pool.on('error', (err) => {
  console.error('Błąd połączenia z bazą danych:', err);
  // Krytyczny błąd połączenia z bazą
  process.exit(-1); 
});

// Test połączenia
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Błąd testu połączenia z bazą:', err.stack);
  } else {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne.');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
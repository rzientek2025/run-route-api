// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// 🚨 AKTUALIZACJA: Używamy prefiksu bazy danych znalezionego w App Platform
const DB_PREFIX = 'DB_POSTGRESQL_FRA1_699592'; 

// Używamy zmiennych dynamicznie za pomocą prefiksu
const pool = new Pool({
  host: process.env[`${DB_PREFIX}_HOST`],
  port: process.env[`${DB_PREFIX}_PORT`], 
  user: process.env[`${DB_PREFIX}_USER`], 
  password: process.env[`${DB_PREFIX}_PASSWORD`], 
  database: process.env[`${DB_PREFIX}_DATABASE`], 
  ssl: {
    rejectUnauthorized: false 
  }
});

pool.on('error', (err) => {
  console.error('Błąd połączenia z bazą danych:', err);
  // To zatrzymuje aplikację, jeśli połączenie się nie uda (co widzieliśmy)
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

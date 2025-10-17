// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// PAMIĘTAJ: Zmienne PG_* i DB_* są automatycznie wstrzykiwane przez DigitalOcean, 
// gdy baza danych jest dołączona do aplikacji. 
// Używamy bezpiecznej, ogólnej formy.

const pool = new Pool({
  host: process.env.DB_HOST, // Powinna to być nazwa prywatnego hosta
  port: process.env.DB_PORT, // Port PostgreSQL
  user: process.env.DB_USER, // Użytkownik bazy
  password: process.env.DB_PASSWORD, // Hasło
  database: process.env.DB_NAME, // Nazwa bazy
  // Opcja wymagana do połączenia z DigitalOcean Managed Databases
  ssl: {
    rejectUnauthorized: false 
  }
});

pool.on('error', (err) => {
  console.error('Błąd połączenia z bazą danych:', err);
  process.exit(-1); 
});

// Test połączenia
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    // Logujemy błąd, który widziałeś
    console.error('Błąd testu połączenia z bazą:', err.stack); 
  } else {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne.');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// 🚨 KRYTYCZNA POPRAWKA: Używamy pełnej nazwy referencyjnej DigitalOcean
const DB_PREFIX = 'DB_POSTGRESQL_FRA1_699592'; 
const DB_HOST_VAR = `${DB_PREFIX}_HOST`;
const DB_PORT_VAR = `${DB_PREFIX}_PORT`;
const DB_USER_VAR = `${DB_PREFIX}_USER`;
const DB_PASS_VAR = `${DB_PREFIX}_PASSWORD`;
const DB_NAME_VAR = `${DB_PREFIX}_DATABASE`;

const pool = new Pool({
  // Host odczytany z poprawnej zmiennej referencyjnej App Platform
  host: process.env[DB_HOST_VAR],
  
  // Port powinien być 5432 dla połączeń wewnętrznych, choć App Platform wstrzykuje 25060 do tej zmiennej
  // Używamy zmiennej z App Platform jako źródła prawdy, jeśli jest dostępna, w przeciwnym razie 5432.
  port: process.env[DB_PORT_VAR] || 5432, 
  
  // Reszta danych z poprawnych zmiennych referencyjnych
  user: process.env[DB_USER_VAR], 
  password: process.env[DB_PASS_VAR], 
  database: process.env[DB_NAME_VAR], 
  
  // W przypadku połączeń App Platform używamy false, aby ominąć problemy z certyfikatami.
  ssl: {
    rejectUnauthorized: false 
  }
});

pool.on('error', (err) => {
  console.error('Błąd połączenia z bazą danych:', err);
  process.exit(-1); 
});

// Test połączenia
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne.');
  })
  .catch(err => {
    console.error('Błąd testu połączenia z bazą:', err.stack); 
  });


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

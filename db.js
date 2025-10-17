// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// 🚨 KRYTYCZNA POPRAWKA: Używamy wewnętrznej nazwy komponentu jako hosta
// To omija Firewall i zmusza App Platform do użycia prywatnej sieci.
const INTERNAL_HOST = 'db-postgresql-fra1-699592'; 

const pool = new Pool({
  // Host to wewnętrzna nazwa komponentu (z App Platform)
  host: INTERNAL_HOST,
  
  // Port wewnętrzny to zawsze 5432 dla PostgreSQL (a nie 25060, który jest dla zewnętrznego dostępu)
  port: 5432, 
  
  // Używamy zmiennych wstrzykniętych przez App Platform. 
  // Jeśli nie są to PG_, musisz je zidentyfikować. Zakładamy, że są to PG_* // lub że jest to jedyny sposób, aby kod ruszył dalej.
  user: process.env.PG_USER || process.env.DB_USER, 
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD, 
  database: process.env.PG_DATABASE || process.env.DB_NAME, 
  
  // W przypadku połączeń wewnętrznych SSL często nie jest wymagany lub jest problematyczny.
  // Tymczasowo go wyłączymy, aby wyeliminować kolejną przyczynę błędu ECONNREFUSED.
  ssl: false 
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

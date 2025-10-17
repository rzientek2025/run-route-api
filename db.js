// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// Konfiguracja połączenia z bazą danych PostgreSQL/PostGIS.
// Ta konfiguracja odczytuje standardowe zmienne środowiskowe PG_*.
// Używaj tej konfiguracji tylko wtedy, gdy ręcznie wprowadziłeś zmienne 
// PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE do App Platform.
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT, 
  user: process.env.PG_USER, 
  password: process.env.PG_PASSWORD, 
  database: process.env.PG_DATABASE, 
  // Opcja wymagana do połączenia z DigitalOcean Managed Databases, 
  // nawet po autoryzacji Firewalla.
  ssl: {
    rejectUnauthorized: false 
  }
});

// Obsługa błędu połączenia (ECONNREFUSED)
pool.on('error', (err) => {
  console.error('Błąd połączenia z bazą danych:', err);
  // Zatrzymujemy proces, jeśli połączenie się nie uda
  process.exit(-1); 
});

// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne.');
  })
  .catch(err => {
    // Logujemy szczegóły błędu ECONNREFUSED
    console.error('Błąd testu połączenia z bazą: ', err.stack); 
  });


module.exports = {
  // Eksportujemy funkcję query do użycia w server.js
  query: (text, params) => pool.query(text, params),
  pool
};

// db.js
const { Pool } = require('pg');
require('dotenv').config(); 

// 🚨 OSTATECZNA WERSJA DLA DIGITALOCEAN
// Używa zewnętrznych danych połączeniowych (zmiennych PG_*, wprowadzonych ręcznie)
// oraz portu 25060 i konfiguracji SSL wymaganej przez Managed Databases.

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 25060, // Używamy 25060 jako domyślnego portu
  user: process.env.PG_USER, 
  password: process.env.PG_PASSWORD, 
  database: process.env.PG_DATABASE, 
  
  // Wymagane ustawienia SSL dla połączeń zewnętrznych z DigitalOcean Managed Databases
  ssl: {
    rejectUnauthorized: false 
  }
});

// Obsługa błędu połączenia (np. ECONNREFUSED)
pool.on('error', (err) => {
  console.error('BŁĄD POŁĄCZENIA KRYTYCZNEGO:', err);
  // Zatrzymujemy proces w przypadku krytycznego błędu połączenia
  process.exit(-1); 
});

// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne. ✅');
  })
  .catch(err => {
    console.error('BŁĄD TESTU POŁĄCZENIA: ', err.stack); 
    console.error('DIAGNOZA: Nadal występuje ECONNREFUSED. Sprawdź Firewalla bazy danych i upewnij się, że App Platform jest autoryzowane do połączeń wychodzących.');
  });


module.exports = {
  // Eksportujemy funkcję query do użycia w server.js
  query: (text, params) => pool.query(text, params),
  pool
};

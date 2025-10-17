// db.js - OSTATECZNA, STABILNA WERSJA DLA DIGITALOCEAN Z DEDYKOWANYM IP
const { Pool } = require('pg');
require('dotenv').config(); 

// UWAGA: Ta wersja wymaga, aby zmienne PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, 
// PG_DATABASE zostały ręcznie wprowadzone do ustawień środowiskowych App Platform, 
// używając danych zewnętrznych.

const pool = new Pool({
  // Host i dane logowania z ręcznie wprowadzonych zmiennych PG_*
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 25060, // Używamy portu zewnętrznego
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
  process.exit(-1); 
});

// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie z bazą danych DigitalOcean jest aktywne. ✅');
    // Jeśli to działa, oznacza to, że infrastruktura sieciowa została naprawiona
  })
  .catch(err => {
    console.error('BŁĄD TESTU POŁĄCZENIA: ', err.stack); 
    console.error('DIAGNOZA: Upewnij się, że statyczne adresy IP zostały poprawnie dodane do Firewalla bazy danych.');
  });


module.exports = {
  // Eksportujemy funkcję query do użycia w server.js
  query: (text, params) => pool.query(text, params),
  pool
};

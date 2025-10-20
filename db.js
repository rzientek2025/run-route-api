// db.js - OSTATECZNA WERSJA PUBLICZNA (Zalecana przez Support)
const { Pool } = require('pg');
require('dotenv').config(); 

// Pełny Host Publiczny i Port (Zgodnie z wymogami Managed Database)
const PUBLIC_HOST = 'db-postgresql-fra1-69959-do-user-27616447-0.i.db.ondigitalocean.com'; 
const PUBLIC_PORT = 25060;

const pool = new Pool({
  // Używamy pełnej nazwy hosta i poprawnego portu
  host: PUBLIC_HOST,
  port: PUBLIC_PORT, 
  
  // Zakładamy, że ustawiłeś te zmienne środowiskowe w App Platform
  user: process.env.PG_USER || 'doadmin', 
  password: process.env.PG_PASSWORD, 
  database: process.env.PG_DATABASE || 'defaultdb', 
  
  // SSL jest WŁĄCZONY dla połączenia publicznego, które jest bezpieczniejsze
  ssl: {
    rejectUnauthorized: false // Wymagane, jeśli certyfikat nie jest w systemie
  }
});

// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie PUBLICZNE z bazą danych jest AKTYWNE. ✅');
  })
  .catch(err => {
    console.error('BŁĄD KRYTYCZNY POŁĄCZENIA:', err.stack); 
    console.error('DIAGNOZA: Sprawdź Firewall bazy danych. Musi zawierać statyczne adresy IP aplikacji (Egress IPs).');
  });


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

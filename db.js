// db.js - OSTATECZNA WERSJA WEWNĘTRZNA
const { Pool } = require('pg');
require('dotenv').config(); 

// Zmienna z NAZWĄ KOMPONENTU Twojej bazy danych
const INTERNAL_HOST = 'db-postgresql-fra1-699592'; 

const pool = new Pool({
  // Host: Używamy wewnętrznej nazwy komponentu
  host: INTERNAL_HOST,
  
  // Port: Używamy wewnętrznego portu PostgreSQL
  port: 5432, 
  
  // App Platform automatycznie wstrzykuje te zmienne
  user: process.env.PG_USER || process.env.DB_USER || 'doadmin', 
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD, 
  database: process.env.PG_DATABASE || 'defaultdb', 
  
  // SSL wyłączony dla połączenia wewnętrznego
  ssl: false 
});

// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie WEWNĘTRZNE z bazą danych jest STABILNE. ✅');
  })
  .catch(err => {
    // Logujemy cały stos błędu, by zobaczyć problem z routingiem/DNS
    console.error('BŁĄD TESTU POŁĄCZENIA:', err.stack); 
    console.error('DIAGNOZA: Błąd połączenia wewnętrznego - Zgłoś do supportu problem z routingiem App Platform.');
  });


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

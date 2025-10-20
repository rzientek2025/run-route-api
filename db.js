// db.js - OSTATECZNA WERSJA WEWNĘTRZNA (POMINIĘCIE FIREWALLA)
const { Pool } = require('pg');
require('dotenv').config(); 

// Host to NAZWA KOMPONENTU TWOJEJ BAZY DANYCH
const INTERNAL_HOST = 'db-postgresql-fra1-699592'; 

const pool = new Pool({
  // Używamy wewnętrznej nazwy hosta - to omija publiczny firewall
  host: INTERNAL_HOST,
  
  // Używamy portu wewnętrznego (standardowo 5432)
  port: 5432, 
  
  // App Platform automatycznie wstrzykuje dane logowania dla połączeń wewnętrznych
  user: process.env.PG_USER || process.env.DB_USER || 'doadmin', 
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD, 
  database: process.env.PG_DATABASE || 'defaultdb', 
  
  // SSL jest wyłączony, bo to połączenie wewnętrzne
  ssl: false 
});

pool.on('error', (err) => {
  console.error('BŁĄD KRYTYCZNY (DB):', err.stack); 
  process.exit(-1); 
});

pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie WEWNĘTRZNE z bazą danych jest AKTYWNE. ✅');
  })
  .catch(err => {
    console.error('BŁĄD TESTU POŁĄCZENIA:', err.stack); 
    console.error('DIAGNOZA: Błąd połączenia wewnętrznego. Zgłoś problem z routingiem App Platform do supportu.');
  });


module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

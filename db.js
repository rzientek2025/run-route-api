// db.js - WERSJA UPROSZCZONA (Używa WYŁĄCZNIE zmiennych środowiskowych)
const { Pool } = require('pg');
require('dotenv').config(); 

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER, 
  password: process.env.PG_PASSWORD, 
  database: process.env.PG_DATABASE, 
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie DB (przez ZMIENNE ŚRODOWISKOWE) jest AKTYWNE. ✅');
  })
  .catch(err => {
    console.error('BŁĄD KRYTYCZNY POŁĄCZENIA:', err.stack); 
    console.error('DIAGNOZA: Sprawdź poprawność wszystkich 5 zmiennych PG_* oraz Firewall.');
  });

module.exports = {
  query: (text, params) => pool.query(text, params)
};

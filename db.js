// db.js - WERSJA AKTYWNA: Stabilne połączenie i tworzenie tabeli
const { Pool } = require('pg');
require('dotenv').config(); 

// 1. KONFIGURACJA POŁĄCZENIA
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER, 
  password: process.env.PG_PASSWORD, 
  database: process.env.PG_DATABASE, 
  // Uproszczona konfiguracja SSL: 
  // Po prostu wymuszamy SSL i zezwalamy na nieautoryzowane certyfikaty.
  ssl: { rejectUnauthorized: false } 
});

// 2. TWORZENIE TABELI I ROZSZERZENIA POSTGIS
const createRoutesTable = async () => {
    // Zapytanie SQL: tworzy rozszerzenie PostGIS i tabelę 'routes', jeśli nie istnieją
    const query = `
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE TABLE IF NOT EXISTS routes (
            id SERIAL PRIMARY KEY,
            distance_km NUMERIC(10, 2) NOT NULL,
            polyline TEXT NOT NULL,
            elevation_gain_m INTEGER DEFAULT 0,
            geom GEOMETRY(LineString, 4326),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(query);
        console.log('Połączenie DB i weryfikacja tabeli "routes" ZAKOŃCZONA SUKCESEM. ✅');
    } catch (err) {
        console.error('BŁĄD KRYTYCZNY DB:', err.stack);
        console.error('DIAGNOZA: Sprawdź 5 zmiennych środowiskowych (PG_*) i Firewalla. Błąd ECONNRESET oznacza niestabilność sieci.');
    }
};

// Test połączenia i tworzenie tabeli przy starcie aplikacji
createRoutesTable();

// 3. EKSPORT MODUŁU
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

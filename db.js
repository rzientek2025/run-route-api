// db.js - WERSJA DLA PRZYSPIESZENIA STARTU
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

const createRoutesTable = async () => {
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
        console.error('BŁĄD KRYTYCZNY DB (Tabela/Firewall):', err.stack);
        // Po prostu logujemy błąd, ale nie crashujemy aplikacji
    }
};

// WAŻNA ZMIANA:
// Nie wywołujemy asynchronicznej funkcji createRoutesTable() bezpośrednio.
// Zamiast tego, będziemy ją wywoływać ręcznie po starcie serwera, 
// aby nie blokować procesu startu Node.js.

module.exports = {
  query: (text, params) => pool.query(text, params),
  initDB: createRoutesTable // Eksportujemy funkcję inicjalizacji
};

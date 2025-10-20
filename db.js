// db.js - NIE używamy bazy danych.
console.log("Moduł bazy danych ZAMKNIĘTY.");

module.exports = {
  query: (text, params) => {
    console.warn("Baza danych jest wyłączona.");
    return Promise.resolve({ rows: [], rowCount: 0 }); 
  },
  pool: null
};

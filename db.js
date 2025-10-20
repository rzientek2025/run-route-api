// db.js - WERSJA WYŁĄCZONA (Nie robi nic, aby nie crashować aplikacji)
console.log("Moduł bazy danych ZAMKNIĘTY.");

module.exports = {
  // Zwraca funkcję-atrapy, aby reszta kodu (jeśli by istniała) się nie wywalała
  query: (text, params) => {
    console.warn("UWAGA: Próba użycia bazy danych, ale jest ona wyłączona.");
    return Promise.resolve({ rows: [], rowCount: 0 }); 
  },
  pool: null
};

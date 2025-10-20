// db.js - WERSJA OSTATECZNA (Wykorzystuje automatyczne wstrzyknięcie DO)
const { Pool } = require('pg');

// Zmienna systemowa App Platform, która wskazuje na obiekt konfiguracyjny bazy danych
// Upewnij się, że NAZWA KOMPONENTU BAZY DANYCH jest poprawnie powiązana z serwisem Node.js
const DB_COMPONENT_NAME = 'db-postgresql-fra1-699592'; 

// Funkcja pomocnicza do pobierania automatycznych zmiennych App Platform
function getDOConnectionString(dbComponentName) {
    // App Platform udostępnia dane bazy danych w zmiennej środowiskowej o tej nazwie
    const dbUrlVar = `${dbComponentName.toUpperCase()}_URL`;
    
    // Jeśli używasz starego Connection Stringa:
    const dbUrl = process.env[dbUrlVar] || process.env.DATABASE_URL;

    // Jeżeli App Platform wstrzykuje URL, parsujemy go
    if (dbUrl) {
        return dbUrl;
    }
    
    // Jeżeli App Platform wstrzykuje pola (user, host, password)
    // Zmienne to zwykle: DB_COMPONENT_NAME_HOST, DB_COMPONENT_NAME_PORT, itd.
    const host = process.env[`${dbComponentName.toUpperCase()}_HOST`];
    const user = process.env[`${dbComponentName.toUpperCase()}_USER`];
    const password = process.env[`${dbComponentName.toUpperCase()}_PASSWORD`];
    const database = process.env[`${dbComponentName.toUpperCase()}_DATABASE`];
    const port = process.env[`${dbComponentName.toUpperCase()}_PORT`];

    // Jeśli odczytaliśmy wszystkie pola, tworzymy obiekt konfiguracyjny
    if (host && user && password && database && port) {
         // Uwaga: Używamy domyślnego portu publicznego 25060, zgodnie z komunikacją supportu
         // Zmienne App Platform zwykle wstrzykują poprawny port, ale ten host jest publiczny
         const sslMode = '?sslmode=require'; 
         return `postgresql://${user}:${password}@${host}:${port}/${database}${sslMode}`;
    }
    
    console.error(`BŁĄD: Nie znaleziono automatycznych zmiennych połączenia dla ${dbComponentName}.`);
    return null; 
}


const connectionString = getDOConnectionString(DB_COMPONENT_NAME);

if (!connectionString) {
    // Jeżeli nie udało się znaleźć automatycznego połączenia, awaryjnie używamy starych zmiennych
    console.warn("Użycie awaryjnych zmiennych połączenia.");
    const pool = new Pool({
        host: 'db-postgresql-fra1-69959-do-user-27616447-0.i.db.ondigitalocean.com', // Publiczny Host
        port: 25060, // Publiczny Port
        user: process.env.PG_USER || 'doadmin', 
        password: process.env.PG_PASSWORD, 
        database: process.env.PG_DATABASE || 'defaultdb', 
        ssl: { rejectUnauthorized: false }
    });
    module.exports = { query: (text, params) => pool.query(text, params) };
    return;
}

const pool = new Pool({
    connectionString: connectionString,
    // Dodatkowy parametr SSL, choć powinien być w connectionStringu
    ssl: { rejectUnauthorized: false }
});


// Test połączenia przy starcie aplikacji
pool.query('SELECT NOW()')
  .then(() => {
    console.log('Połączenie z bazą danych (AUTOMATYCZNE DO) jest AKTYWNE. ✅');
  })
  .catch(err => {
    console.error('BŁĄD KRYTYCZNY POŁĄCZENIA (AUTOMATYCZNE):', err.stack); 
    console.error('DIAGNOZA: Sprawdź, czy baza danych jest poprawnie POŁĄCZONA z tym serwisem w ustawieniach App Platform.');
  });


module.exports = {
  query: (text, params) => pool.query(text, params)
};

// server.js - WERSJA BARDZO PROSTA (Tylko test uruchomienia)
const express = require('express');

const app = express();
const port = process.env.PORT || 8080; 

// Testowy endpoint GET
app.get('/', (req, res) => {
    // Serwer powinien zwrócić tę wiadomość
    res.status(200).send('Serwer Node.js jest online i działa poprawnie! 🎉');
});

// Testowy endpoint POST (sprawdzamy, czy aplikacja odbiera JSON)
app.post('/api/test', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Serwer poprawnie odebrał POST.',
        time: new Date().toISOString()
    });
});

app.listen(port, () => {
  console.log(`Serwer Node.js nasłuchuje na porcie ${port} - Online.`);
});

// server.js - WERSJA 2: Test Google API i Fix na o.map
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config(); 
// Moduł db.js jest wciąż ZAMKNIĘTY (wykluczamy błędy DB)
const db = require('./db'); 

const apiKey = process.env.GOOGLE_API_KEY; 

if (!apiKey) {
    console.error("Błąd: Zmienna środowiskowa GOOGLE_API_KEY nie została ustawiona.");
    process.exit(1); 
}

const mapsClient = new Client({});
const app = express();
const port = process.env.PORT || 8080; 

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Serwer Node.js jest online i działa poprawnie! 🎉');
});

// Zostawiamy dla testów
app.post('/api/test', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Serwer poprawnie odebrał POST.'
    });
});

app.post('/api/routes/generate', async (req, res) => {
    const { origin, destination } = req.body;

    if (!origin || !destination) {
        return res.status(400).json({ error: 'Wymagane pola: origin i destination.' });
    }

    try {
        // I. Generowanie Trasy (Google Directions API)
        const directionsResponse = await mapsClient.directions({
            params: {
                origin: origin,
                destination: destination,
                mode: 'walking', 
                key: apiKey,
            },
        });

        if (!directionsResponse.data.routes || directionsResponse.data.routes.length === 0) {
            return res.status(404).json({ error: 'Nie znaleziono trasy.' });
        }
        
        const distanceMeters = directionsResponse.data.routes[0].legs[0].distance.value;
        const polyline = directionsResponse.data.routes[0].overview_polyline.points;

        // II. Zabezpieczony test (Fix na o.map) - wykonujemy puste zapytanie, by sprawdzić
        const elevationResponse = await mapsClient.elevation({
            params: {
                path: polyline,
                samples: 2, // Minimalna liczba próbek
                key: apiKey,
            },
        });

        // 🚨 KRYTYCZNY TEST FIXA: Używamy pustej tablicy, aby upewnić się, że błąd nie wróci
        const results = elevationResponse.data?.results || []; 
        console.log(`Debug: Odebrano ${results.length} wyników elewacji.`);

        // Zamiast zapisywać do bazy, po prostu zwracamy wynik.
        res.status(200).json({
            distance_km: (distanceMeters / 1000).toFixed(2),
            polyline_length: polyline.length,
            message: 'Trasa pomyślnie wygenerowana (NIE zapisano do bazy danych).',
            // Pokazujemy wyniki API
            test_results: results.length
        });

    } catch (error) {
        console.error('BŁĄD PODCZAS GENEROWANIA TRASY:', error.stack || error.message);
        
        // Błąd API Google Maps
        if (error.response && error.response.data) {
             return res.status(500).json({ 
                error: 'Błąd API Google Maps', 
                details: error.response.data.error_message 
            });
        }
        
        res.status(500).json({ 
            error: 'Wewnętrzny błąd serwera', 
            details: error.message
        });
    }
});

app.listen(port, () => {
  console.log(`Serwer Node.js nasłuchuje na porcie ${port} - Online.`);
});

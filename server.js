// server.js - WERSJA 3: Directions + Elevation (Test Fixu na o.map)
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config(); 
// Moduł db.js jest wciąż ZAMKNIĘTY
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

// Funkcja pomocnicza: Obliczenie sumy przewyższeń
function calculateElevationGain(elevations) {
    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) {
            gain += diff;
        }
    }
    return Math.round(gain);
}

app.get('/', (req, res) => {
    res.send('API działa. Użyj POST do /api/routes/generate.');
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

        // II. POBIERANIE ELEWACJI
        const elevationResponse = await mapsClient.elevation({
            params: {
                path: polyline,
                samples: 256, 
                key: apiKey,
            },
        });

        // 🚨 KRYTYCZNY FIX: ZABEZPIECZENIE PRZED BŁĘDEM o.map is not a function
        const results = elevationResponse.data?.results || []; 
        
        let elevationGain = 0;
        let resultCount = 0;

        if (Array.isArray(results) && results.length > 0) {
            const elevations = results.map(r => r.elevation);
            elevationGain = calculateElevationGain(elevations);
            resultCount = results.length;
            console.log(`DEBUG: Użyto zabezpieczenia i obliczono przewyższenie.`);
        } else {
             console.log(`DEBUG: Użyto zabezpieczenia. Elewacja niedostępna, przewyższenie 0.`);
        }
        
        // Zwracamy wynik z elewacją, ale bez bazy danych.
        res.status(200).json({
            status: 'Sukces',
            distance_km: (distanceMeters / 1000).toFixed(2),
            elevation_gain_m: elevationGain,
            polyline_length: polyline.length,
            debug_elevation_results: resultCount,
            message: 'Trasa i elewacja wyznaczone pomyślnie (NIE zapisano do bazy danych).'
        });

    } catch (error) {
        console.error('BŁĄD PODCZAS GENEROWANIA TRASY:', error.stack || error.message);
        
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

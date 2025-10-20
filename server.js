// server.js - WERSJA MONOLITYCZNA (FINALNY TEST)
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config(); 
// Moduł PG/DB jest tutaj celowo POMINIĘTY, aby wykluczyć błędy połączeń.

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
    // Używamy tradycyjnej pętli FOR, aby wykluczyć, że to .map jest problemem
    for (let i = 1; i < elevations.length; i++) {
        const diff = elevations[i] - elevations[i - 1];
        if (diff > 0) {
            gain += diff;
        }
    }
    return Math.round(gain);
}

app.get('/', (req, res) => {
    res.send('API działa w trybie monolitycznym.');
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

        // 🚨 OSTATECZNY FIX (Monolit): Zabezpieczenie przed błędem cache'u
        // Zapewniamy, że results jest PUSTĄ TABLICĄ, jeśli API zwróci coś nieprawidłowego.
        const results = elevationResponse.data?.results || []; 
        
        let elevationGain = 0;
        let resultCount = 0;

        // Sprawdzamy, czy to jest PRAWIDŁOWA tablica przed mapowaniem
        if (Array.isArray(results) && results.length > 0) {
            // Używamy .map tylko, jeśli mamy 100% pewności, że results jest tablicą
            const elevations = results.map(r => r.elevation); 
            elevationGain = calculateElevationGain(elevations);
            resultCount = results.length;
            console.log(`DEBUG: Elewacja obliczona pomyślnie. Wyników: ${resultCount}`);
        } else {
             console.log(`DEBUG: Błąd Elewacji - dane były puste/nieprawidłowe. Przewyższenie: 0.`);
        }
        
        // Zwracamy wynik z elewacją
        res.status(200).json({
            status: 'Sukces',
            distance_km: (distanceMeters / 1000).toFixed(2),
            elevation_gain_m: elevationGain,
            message: 'Trasa i elewacja wyznaczone pomyślnie w trybie monolitycznym.'
        });

    } catch (error) {
        // ... (obsługa błędów pozostaje taka sama)
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

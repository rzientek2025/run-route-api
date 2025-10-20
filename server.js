// server.js - WERSJA TYLKO DIRECTIONS (BEZ DB)
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config(); 

// UWAGA: Usunięto odwołanie do db.js i pg

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
    res.send('API działa. Użyj POST do /api/routes/generate, aby wyznaczyć trasę.');
});

// Endpoint wyznaczający tylko trasę (niezapisujący do bazy)
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
        
        const route = directionsResponse.data.routes[0].legs[0];
        const distanceKm = (route.distance.value / 1000).toFixed(2);
        const polyline = directionsResponse.data.routes[0].overview_polyline.points;

        // Prosty wynik
        res.status(200).json({
            status: 'Sukces',
            distance_km: distanceKm,
            polyline: polyline,
            message: 'Trasa wyznaczona pomyślnie (minimalna wersja).'
        });

    } catch (error) {
        console.error('BŁĄD W TRAKCIE GENEROWANIA TRASY:', error.stack || error.message);
        
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

// server.js - WERSJA OSTATECZNA (Fix na o.map i pełne logowanie)
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config();
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
    res.send('API dla tras biegowych online jest aktywne! Użyj POST do /api/routes/generate.');
});

app.post('/api/routes/generate', async (req, res) => {
    const { origin, destination, waypoints = [] } = req.body;

    if (!origin || !destination) {
        return res.status(400).json({ error: 'Wymagane pola: origin i destination.' });
    }

    try {
        // I. Generowanie Trasy (Google Directions API)
        const directionsResponse = await mapsClient.directions({
            params: {
                origin: origin,
                destination: destination,
                waypoints: waypoints,
                mode: 'walking', 
                key: apiKey,
            },
        });

        if (!directionsResponse.data.routes || directionsResponse.data.routes.length === 0) {
            return res.status(404).json({ error: 'Błąd API Google Maps: Nie znaleziono trasy między podanymi punktami.' });
        }

        const route = directionsResponse.data.routes[0].legs[0];
        const polyline = directionsResponse.data.routes[0].overview_polyline.points;
        const distanceMeters = route.distance.value;

        // II. Pobieranie Danych o Elewacji (Google Elevation API)
        const elevationResponse = await mapsClient.elevation({
            params: {
                path: polyline,
                samples: 256, 
                key: apiKey,
            },
        });

        // 🚨 KRYTYCZNA POPRAWKA: Bezpieczny odczyt wyników (usuwa błąd o.map is not a function)
        // Jeśli 'results' jest null/undefined (np. błąd API), używamy pustej tablicy ([]), aby kod nie crashował.
        const results = elevationResponse.data?.results || []; 
        
        let elevations = [];
        let pathCoordinates = '';
        let elevationGain = 0;

        if (Array.isArray(results) && results.length > 0) {
            elevations = results.map(r => r.elevation);
            pathCoordinates = results.map(r => `${r.location.lng} ${r.location.lat}`).join(',');
            elevationGain = calculateElevationGain(elevations);
        } 
        
        // III. Zapis do Bazy Danych
        const startPoint = route.start_location;
        const endPoint = route.end_location;

        const lineString = pathCoordinates ? `LINESTRING(${pathCoordinates})` : 'POINT(0 0)'; 

        const insertQuery = `
            INSERT INTO routes (
                name, distance_m, elevation_gain_m, polyline, 
                start_lat, start_lng, end_lat, end_lng, 
                created_at, geo_path
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), ST_GeomFromText($9, 4326))
            RETURNING id;
        `;

        // ZAKŁADA, że tabela 'routes' i rozszerzenie PostGIS są aktywne.
        const result = await db.query(insertQuery, [
            `Trasa z ${origin} do ${destination}`, 
            distanceMeters,
            elevationGain,
            polyline,
            startPoint.lat,
            startPoint.lng,
            endPoint.lat,
            endPoint.lng,
            lineString
        ]);

        // IV. Odpowiedź dla klienta
        res.status(200).json({
            id: result.rows[0].id,
            distance_km: (distanceMeters / 1000).toFixed(2),
            elevation_gain_m: elevationGain,
            start_address: route.start_address,
            end_address: route.end_address,
            polyline: polyline,
            message: 'Trasa wygenerowana i zapisana pomyślnie.'
        });

    } catch (error) {
        // 🚨 PEŁNE LOGOWANIE: Logujemy CAŁY STOS BŁĘDU (w tym błędy SQL)
        console.error('BŁĄD PODCZAS GENEROWANIA TRASY (DIAGNOSTYKA):', error.stack || error.message || 'Nieznany błąd');

        // Obsługa błędu Google Maps
        if (error.response && error.response.data) {
             return res.status(500).json({ 
                error: 'Błąd API Google Maps', 
                details: error.response.data.error_message 
            });
        }
        
        // Obsługa błędu wewnętrznego (Baza Danych lub inna logika)
        const details = error.message || error.stack?.split('\n')[0] || 'Nie udało się uzyskać szczegółów błędu.';

        res.status(500).json({ 
            error: 'Wewnętrzny błąd serwera', 
            details: details
        });
    }
});

app.listen(port, () => {
  console.log(`Serwer Node.js nasłuchuje na porcie ${port} - Online.`);
});

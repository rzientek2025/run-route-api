// server.js
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config();
const db = require('./db'); 

// Upewnij się, że klucz API jest dostępny jako zmienna środowiskowa
const apiKey = process.env.GOOGLE_API_KEY; 

if (!apiKey) {
    console.error("Błąd: Zmienna środowiskowa GOOGLE_API_KEY nie została ustawiona.");
    process.exit(1); 
}

const mapsClient = new Client({});
const app = express();
const port = process.env.PORT || 3000; 

app.use(express.json());

// --- Funkcje Pomocnicze ---

/** Oblicza całkowite przewyższenie na podstawie tablicy wysokości (elewacji). */
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

// --- Endpointy API ---

// 1. Endpoint testowy (sprawdzenie, czy serwer działa)
app.get('/', (req, res) => {
    res.send('API dla tras biegowych online jest aktywne! Użyj POST do /api/routes/generate.');
});

// 2. Główny endpoint: Generowanie trasy i przewyższeń
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

        const route = directionsResponse.data.routes[0].legs[0];
        const polyline = directionsResponse.data.routes[0].overview_polyline.points;
        const distanceMeters = route.distance.value;

        // II. Pobieranie Danych o Elewacji (Google Elevation API)
        // POPRAWKA A: Użycie 'elevation' zamiast 'elevationAlongPath'
        const elevationResponse = await mapsClient.elevation({
            params: {
                path: polyline,
                samples: 256, 
                key: apiKey,
            },
        });

        // POPRAWKA B: Bezpieczne odczytywanie results z użyciem operatora zerowego łączenia (??)
        // Zapobiega błędom 'map is not a function' jeśli 'results' jest null/undefined
        const results = elevationResponse.data?.results ?? []; 

        const elevations = results.map(r => r.elevation); 

        const elevationGain = calculateElevationGain(elevations);

        // III. Zapis do Bazy Danych
        const startPoint = route.start_location;
        const endPoint = route.end_location;

        // Konwertowanie Polyline na format WKT dla PostGIS (LINESTRING)
        const pathCoordinates = results.map(r => `${r.location.lng} ${r.location.lat}`).join(',');
            
        const lineString = `LINESTRING(${pathCoordinates})`;

        const insertQuery = `
            INSERT INTO routes (
                name, distance_m, elevation_gain_m, polyline, 
                start_lat, start_lng, end_lat, end_lng, 
                created_at, geo_path
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), ST_GeomFromText($9, 4326))
            RETURNING id;
        `;

        const result = await db.query(insertQuery, [
            `Trasa z ${origin} do ${destination}`, // Uproszczona nazwa
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
        console.error('

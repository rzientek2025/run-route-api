// server.js - WERSJA 4: Directions API + Zapis do DB (Bez Elewacji)
const express = require('express');
const { Client } = require('@googlemaps/google-maps-services-js');
require('dotenv').config(); 

// Moduł DB jest TERAZ AKTYWNY
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
    res.send('API działa. Użyj POST do /api/routes/generate, aby zapisać trasę.');
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
        
        const route = directionsResponse.data.routes[0].legs[0];
        const distanceKm = (route.distance.value / 1000).toFixed(2);
        const polyline = directionsResponse.data.routes[0].overview_polyline.points;
        
        // Konwersja polilinii na GeoJSON (potrzebne do ST_GeomFromText)
        const steps = directionsResponse.data.routes[0].legs[0].steps;
        const lineStringCoords = steps.map(step => {
            return `${step.end_location.lng} ${step.end_location.lat}`;
        }).join(',');
        
        const geometry = `ST_GeomFromText('LINESTRING(${lineStringCoords})', 4326)`;

        // II. Zapis do Bazy Danych
        const saveQuery = `
            INSERT INTO routes (distance_km, polyline, geom) 
            VALUES ($1, $2, ${geometry}) 
            RETURNING id;
        `;
        
        const result = await db.query(saveQuery, [distanceKm, polyline]);
        const routeId = result.rows[0].id;
        
        // Zwracamy wynik
        res.status(201).json({
            status: 'Trasa Zapisana',
            id: routeId,
            distance_km: distanceKm,
            message: 'Trasa wyznaczona i pomyślnie zapisana do bazy danych (bez elewacji).'
        });

    } catch (error) {
        console.error('BŁĄD PODCZAS PRZETWARZANIA TRASY:', error.stack || error.message);
        
        let details = error.message;
        if (error.response && error.response.data) {
             details = error.response.data.error_message;
        } else if (error.code === '42P01') {
             details = 'Błąd SQL: Tabela lub schemat nie istnieje (sprawdź, czy PostGIS jest włączony).';
        }
        
        res.status(500).json({ 
            error: 'Wewnętrzny błąd serwera', 
            details: details
        });
    }
});

app.listen(port, () => {
  console.log(`Serwer Node.js nasłuchuje na porcie ${port} - Online.`);
});

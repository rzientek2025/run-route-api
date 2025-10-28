// Importowanie niezbędnych modułów
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Ustawienia CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'], // Pozwalamy na POST
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Umożliwia Expressowi paroswanie ciała żądania JSON
app.use(express.json());

// Funkcja pomocnicza: Oblicza nowy punkt (lat/lng)
function calculateDestination(lat, lng, distanceMeters, bearingDegrees) {
    const R = 6371000; // Promień Ziemi w metrach
    const angularDistance = distanceMeters / R;
    const bearingRad = (bearingDegrees * Math.PI) / 180;
    
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    const newLatRad = Math.asin(
        Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );
    const newLngRad = lngRad + Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLatRad)
    );

    return {
        lat: newLatRad * 180 / Math.PI,
        lng: newLngRad * 180 / Math.PI
    };
}

// Prosta trasa GET dla testowania działania API
app.get('/', (req, res) => {
    res.send({ message: 'API działa. Użyj POST do /routes/generate.', api_url: `http://localhost:${PORT}` });
});

// Główna trasa API - używa POST na ścieżce /routes/generate
app.post('/routes/generate', async (req, res) => {
    const { origin, distance } = req.body; // distance jest w metrach

    if (!origin || !distance) {
        return res.status(400).json({ 
            error: 'Brak wymaganych pól', 
            details: 'Wymagane: origin (punkt startowy) i distance (dystans pętli w metrach).' 
        });
    }

    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Błąd konfiguracji serwera', 
            details: 'Brak zmiennej środowiskowej GOOGLE_API_KEY.' 
        });
    }

    // --- LOGIKA GENEROWANIA PĘTLI ---

    const TARGET_DISTANCE = parseFloat(distance);
    const MAX_ATTEMPTS = 5;
    const INITIAL_RADIUS_FACTOR = 0.25; 
    const CORRECTION_FACTOR = 1.2; 
    const TOLERANCE = 0.05; 
    const MAX_OVERLENGTH_FACTOR = 1.15; 
    
    let bestRoute = null;
    let minDiff = Infinity;
    let currentRadiusFactor = INITIAL_RADIUS_FACTOR;

    // 1. Geolokalizacja punktu startowego
    let startLocation;

    // Użyj Geocoding API dla adresu (lub współrzędnych)
    try {
        const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: origin,
                key: process.env.GOOGLE_API_KEY
            }
        });

        if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
            return res.status(400).json({ 
                error: 'Nie udało się geolokalizować punktu startowego.', 
                details: `Status z Google: ${geoResponse.data.status}.` 
            });
        }
        startLocation = geoResponse.data.results[0].geometry.location;
    } catch (error) {
        return res.status(500).json({
            error: 'Błąd podczas geokodowania.',
            details: error.message
        });
    }


    // 2. Algorytm iteracyjny
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const randomBearing = Math.floor(Math.random() * 360); 
        const radiusMeters = TARGET_DISTANCE * currentRadiusFactor;
        
        const intermediatePoint = calculateDestination(
            startLocation.lat, 
            startLocation.lng, 
            radiusMeters, 
            randomBearing
        );

        const intermediatePointString = `${intermediatePoint.lat},${intermediatePoint.lng}`;
        
        // 3. Wyznaczanie trasy (A -> B -> A)
        const params = {
            origin: `${startLocation.lat},${startLocation.lng}`,
            destination: `${startLocation.lat},${startLocation.lng}`, 
            waypoints: intermediatePointString, 
            optimizeWaypoints: false, 
            mode: 'walking',
            avoidFerries: true,
            avoidTolls: true,
            key: process.env.GOOGLE_API_KEY
        };

        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', { params });
            const data = response.data;

            if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
                currentRadiusFactor *= CORRECTION_FACTOR;
                continue;
            }

            const legs = data.routes[0].legs;
            let totalDistanceValue = 0;
            legs.forEach(leg => { totalDistanceValue += leg.distance.value; });

            const diff = Math.abs(totalDistanceValue - TARGET_DISTANCE);
            
            // Warunek sukcesu w ramach tolerancji
            if (totalDistanceValue >= TARGET_DISTANCE * (1 - TOLERANCE) && totalDistanceValue <= TARGET_DISTANCE * MAX_OVERLENGTH_FACTOR) {
                if (diff < minDiff) {
                    minDiff = diff;
                    bestRoute = {
                        distance: totalDistanceValue,
                        polyline: data.routes[0].overview_polyline.points,
                        attempts: i + 1
                    };
                }
                if (diff < TARGET_DISTANCE * (TOLERANCE / 2)) {
                    break;
                }
            } 
            
            // Korekta promienia
            if (totalDistanceValue < TARGET_DISTANCE) {
                currentRadiusFactor *= CORRECTION_FACTOR;
            } else {
                 currentRadiusFactor /= CORRECTION_FACTOR;
            }

        } catch (error) {
            currentRadiusFactor *= CORRECTION_FACTOR;
        }
    } 

    
    // 4. Zwrócenie wyniku
    if (!bestRoute) {
        return res.status(404).json({
            error: 'Nie udało się wyznaczyć pętli.',
            details: `Nie znaleziono trasy bliskiej ${ (TARGET_DISTANCE / 1000).toFixed(2)} km.`
        });
    }

    const distanceKm = (bestRoute.distance / 1000).toFixed(2);
    const targetKm = (TARGET_DISTANCE / 1000).toFixed(2);

    res.json({
        status: 'OK',
        distance_km: distanceKm,
        message: `Wyznaczono pętlę o dystansie ${distanceKm} km. Docelowy: ${targetKm} km.`,
        polyline: bestRoute.polyline,
    });
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}`);
});

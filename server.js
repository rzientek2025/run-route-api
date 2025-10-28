// Importowanie niezbędnych modułów
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const url = require('url'); // Potrzebne do parsowania URL (choć express to robi)

const app = express();
const PORT = process.env.PORT || 8080;

// Ustawienia CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'], // Pozwalamy tylko na GET i OPTIONS
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Funkcja pomocnicza: Oblicza nowy punkt (lat/lng) z zadanego punktu, dystansu (w metrach) i kierunku (stopnie)
// Wzór "destination point given distance and bearing from start point"
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
    res.send({ message: 'API działa. Użyj GET do /routes/generate z parametrami.', api_url: `http://localhost:${PORT}` });
});

// WŁAŚCIWA TRASA API - UŻYWA GET
app.get('/routes/generate', async (req, res) => {
    // Odczyt danych z query parameters (req.query)
    const { origin, distance } = req.query; 
    const distanceMeters = parseFloat(distance);

    // Walidacja podstawowych parametrów
    if (!origin || isNaN(distanceMeters) || distanceMeters <= 0) {
        return res.status(400).json({ 
            error: 'Brak wymaganych pól lub nieprawidłowy format', 
            details: 'Wymagane: origin (adres lub lat,lng) i distance (dystans pętli w metrach).' 
        });
    }

    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Błąd konfiguracji serwera', 
            details: 'Brak zmiennej środowiskowej GOOGLE_API_KEY. Sprawdź ustawienia DigitalOcean.' 
        });
    }

    // --- ALGORYTM GENEROWANIA PĘTLI ---
    let startLocation;

    // 1. Geolokalizacja punktu startowego (lub użycie współrzędnych)
    if (origin.includes(',')) {
        // Użyj współrzędnych, jeśli frontend przesłał "lat,lng"
        const [lat, lng] = origin.split(',').map(Number);
        startLocation = { lat, lng };
    } else {
        // Użyj geokodowania, jeśli podano adres
        try {
            const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: origin,
                    key: process.env.GOOGLE_API_KEY
                }
            });

            if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
                const status = geoResponse.data.status || 'Nieznany';
                return res.status(400).json({ 
                    error: 'Nie udało się geolokalizować punktu startowego.', 
                    details: 'Sprawdź, czy adres jest poprawny. Status z Google: ' + status,
                });
            }
            startLocation = geoResponse.data.results[0].geometry.location;
        } catch (error) {
             return res.status(500).json({ 
                error: 'Błąd podczas geolokalizacji.', 
                details: error.message
            });
        }
    }


    // PARAMETRY OPTYMALIZACYJNE
    const TARGET_DISTANCE = distanceMeters;
    const MAX_ATTEMPTS = 5;
    const INITIAL_RADIUS_FACTOR = 0.25; 
    const CORRECTION_FACTOR = 1.2; 
    const TOLERANCE = 0.05; 
    const MAX_OVERLENGTH_FACTOR = 1.15; 
    
    let bestRoute = null;
    let minDiff = Infinity;
    let currentRadiusFactor = INITIAL_RADIUS_FACTOR;


    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // Losowy kierunek (bearing) w każdej próbie
        const randomBearing = Math.floor(Math.random() * 360); 

        // Zmienna odległość promienia
        const radiusMeters = TARGET_DISTANCE * currentRadiusFactor;
        
        const intermediatePoint = calculateDestination(
            startLocation.lat, 
            startLocation.lng, 
            radiusMeters, 
            randomBearing
        );

        const intermediatePointString = `${intermediatePoint.lat},${intermediatePoint.lng}`;
        
        // Wyznaczanie trasy (A -> B -> A)
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
                console.log(`Próba ${i + 1}: Błąd Google API: ${data.status}. Próbuję ponownie z innym promieniem.`);
                currentRadiusFactor *= CORRECTION_FACTOR;
                continue;
            }

            const legs = data.routes[0].legs;
            let totalDistanceValue = 0;
            
            legs.forEach(leg => {
                totalDistanceValue += leg.distance.value;
            });

            const diff = Math.abs(totalDistanceValue - TARGET_DISTANCE);
            
            // Logika wyboru najlepszej trasy
            if (totalDistanceValue >= TARGET_DISTANCE * (1 - TOLERANCE) && totalDistanceValue <= TARGET_DISTANCE * MAX_OVERLENGTH_FACTOR) {
                // Trasa jest w akceptowalnym zakresie. Zapisz ją, jeśli jest najbliżej celu
                if (diff < minDiff) {
                    minDiff = diff;
                    bestRoute = {
                        distance: totalDistanceValue,
                        polyline: data.routes[0].overview_polyline.points,
                        attempts: i + 1
                    };
                }
                
                // Jeśli trafiliśmy w cel z bardzo małą tolerancją, przerywamy pętlę
                if (diff < TARGET_DISTANCE * (TOLERANCE / 2)) {
                    break;
                }

            } else if (totalDistanceValue < TARGET_DISTANCE * (1 - TOLERANCE)) {
                // Jeśli trasa jest za krótka, zwiększ promień dla kolejnej próby
                currentRadiusFactor *= CORRECTION_FACTOR;
            }
            else if (totalDistanceValue > TARGET_DISTANCE * MAX_OVERLENGTH_FACTOR) {
                 currentRadiusFactor /= CORRECTION_FACTOR; 
            }

        } catch (error) {
            console.error(`Błąd podczas komunikacji z Google API w próbie ${i + 1}:`, error.message);
            currentRadiusFactor *= CORRECTION_FACTOR;
        }
    } // Koniec pętli for

    // 4. Zwrócenie wyniku
    if (!bestRoute) {
        return res.status(404).json({
            error: 'Nie udało się wyznaczyć pętli o żądanym dystansie w dostępnych próbach.',
            details: `Ostatni promień: ${(TARGET_DISTANCE * currentRadiusFactor).toFixed(0)}m. Sprawdź, czy lokalizacja startowa jest w obszarze dróg dla pieszych.`
        });
    }

    // Zwrócenie danych do frontendu
    const distanceKm = (bestRoute.distance / 1000).toFixed(2);
    const targetKm = (TARGET_DISTANCE / 1000).toFixed(2);

    res.json({
        status: 'OK',
        distance_km: distanceKm,
        message: `Wyznaczono pętlę o dystansie ${distanceKm} km w ${bestRoute.attempts} próbach. Docelowy dystans: ${targetKm} km.`,
        polyline: bestRoute.polyline,
        details: 'Wyznaczono pętlę A -> B -> A z optymalizacją.'
    });
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}`);
});

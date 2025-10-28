const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Ustawienia CORS: Zezwól na połączenia z dowolnego źródła
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'], // Zapewniamy, że OPTIONS jest dozwolone
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Umożliwia Expressowi paroswanie ciała żądania JSON
app.use(express.json());

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


// Trasa GET do sprawdzenia statusu i pobrania adresu URL API przez frontend
app.get('/', (req, res) => {
    // Zwraca URL, który frontend może wykorzystać do dynamicznego określenia adresu API
    res.json({
        status: 'API Działa',
        message: 'Użyj POST do /routes/generate.',
        api_url: `http://${req.headers.host}` // Dynamiczne pobieranie adresu hosta
    });
});

// Dodajemy jawną obsługę OPTIONS dla tej trasy, aby ułatwić CORS
app.options('/routes/generate', (req, res) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.sendStatus(200);
});

// WŁAŚCIWA TRASA API - UŻYWA POST!
app.post('/routes/generate', async (req, res) => {
    // console.log('Otrzymane BODY:', req.body); 

    const { origin, distance } = req.body; // distance jest w metrach

    // Walidacja podstawowych parametrów
    if (!origin || !distance) {
        return res.status(400).json({ 
            error: 'Missing required fields', 
            details: 'Required: origin (start point) and distance (loop distance in meters).' 
        });
    }

    // Walidacja klucza API
    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Server configuration error', 
            details: 'GOOGLE_API_KEY environment variable is missing.' 
        });
    }

    // PARAMETRY OPTYMALIZACYJNE
    const TARGET_DISTANCE = distance;
    const MAX_ATTEMPTS = 5;
    const INITIAL_RADIUS_FACTOR = 0.25; // Initial radius factor (25% of target distance)
    const CORRECTION_FACTOR = 1.25; // Factor to increase radius by (25% more)
    const TOLERANCE = 0.05; // 5% tolerance (route is OK if within 95% - 105% of target)
    const MAX_OVERLENGTH_FACTOR = 1.15; // Max acceptable distance is 115% of target

    let bestRoute = null;
    let minDiff = Infinity; // Minimalna różnica w stosunku do dystansu docelowego
    
    let currentRadiusFactor = INITIAL_RADIUS_FACTOR;

    // 1. Geolokalizacja punktu startowego
    let startLocation;

    // Sprawdzenie, czy origin jest już współrzędnymi (np. z Geolocation API)
    const coordsMatch = origin.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
    if (coordsMatch) {
        startLocation = {
            lat: parseFloat(coordsMatch[1]),
            lng: parseFloat(coordsMatch[2])
        };
    } else {
        // Jeśli to adres, użyj Geocoding API
        try {
            const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: origin,
                    key: process.env.GOOGLE_API_KEY
                }
            });

            if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
                return res.status(400).json({ 
                    error: 'Failed to geolocate start point', 
                    details: `Check if the address is correct. Status from Google: ${geoResponse.data.status}.` 
                });
            }
            startLocation = geoResponse.data.results[0].geometry.location;
        } catch (error) {
            console.error('Błąd podczas geokodowania:', error.message);
            return res.status(500).json({
                error: 'Internal Server Error during Geocoding',
                details: error.message
            });
        }
    }


    // 2. Algorytm iteracyjny dopasowania dystansu
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Obliczanie promienia (promień rośnie z każdą próbą, jeśli trasa jest za krótka)
        const radiusMeters = TARGET_DISTANCE * currentRadiusFactor;
        
        // Losowy kierunek (bearing) dla urozmaicenia trasy w każdej próbie
        const randomBearing = Math.floor(Math.random() * 360); 

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
            destination: `${startLocation.lat},${startLocation.lng}`, // Return to start
            waypoints: intermediatePointString, // Via intermediate point
            optimizeWaypoints: false, // Order is A -> B -> A
            mode: 'walking',
            avoidFerries: true,
            avoidTolls: true,
            key: process.env.GOOGLE_API_KEY
        };

        try {
            const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', { params });
            const data = response.data;
            
            if (data.status !== 'OK') {
                // If API fails for this specific query, skip this attempt
                console.warn(`Attempt ${attempt} failed with Google status: ${data.status}`);
                currentRadiusFactor *= CORRECTION_FACTOR; // Still try bigger radius
                continue;
            }

            // Sumowanie dystansów z obu segmentów (A->B i B->A)
            const legs = data.routes[0].legs;
            let totalDistanceValue = 0;

            legs.forEach(leg => {
                totalDistanceValue += leg.distance.value;
            });
            const totalDistanceKm = (totalDistanceValue / 1000).toFixed(2);
            
            // Logika wyboru najlepszej trasy
            const diff = Math.abs(totalDistanceValue - TARGET_DISTANCE);
            
            // Sprawdzenie, czy trasa mieści się w maksymalnym dopuszczalnym limicie
            if (totalDistanceValue > TARGET_DISTANCE * MAX_OVERLENGTH_FACTOR) {
                // Trasa jest za długa, zmniejszamy promień na kolejną próbę i idziemy dalej
                currentRadiusFactor /= CORRECTION_FACTOR;
                continue;
            }
            
            // 4. Warunek sukcesu (w granicach tolerancji)
            if (diff <= TARGET_DISTANCE * TOLERANCE) {
                bestRoute = { data, totalDistanceKm };
                // Osiągnięto wymagany dystans, przerywamy pętlę
                break; 
            }
            
            // 5. Jeśli nie idealna, ale najlepsza do tej pory (ma najmniejszą różnicę)
            if (diff < minDiff) {
                minDiff = diff;
                bestRoute = { data, totalDistanceKm };
            }

            // Ustalenie, jak korygować promień na kolejną próbę
            if (totalDistanceValue < TARGET_DISTANCE) {
                // Za krótka, zwiększ promień
                currentRadiusFactor *= CORRECTION_FACTOR;
            } else {
                // Za długa, zmniejsz promień
                currentRadiusFactor /= CORRECTION_FACTOR;
            }

        } catch (error) {
            console.error(`Błąd podczas komunikacji z Google API w próbie ${attempt}:`, error.message);
            // Nadal próbuj z innym promieniem/kierunkiem
            currentRadiusFactor *= CORRECTION_FACTOR;
            continue;
        }
    } // Koniec pętli for

    
    // 5. Zwrócenie wyniku (najlepsza znaleziona trasa)
    if (bestRoute) {
        const routeData = bestRoute.data;
        const message = `Wyznaczono pętlę o dystansie ${bestRoute.totalDistanceKm} km. Docelowy dystans: ${(TARGET_DISTANCE / 1000).toFixed(2)} km.`;

        // Zwrócenie danych do frontendu
        res.json({
            status: 'OK',
            distance_km: bestRoute.totalDistanceKm,
            message: message,
            polyline: routeData.routes[0].overview_polyline.points,
            details: `Znaleziona w ${MAX_ATTEMPTS} próbach.`
        });
    } else {
        // Jeśli nie znaleziono żadnej trasy
        res.status(404).json({
            error: 'Nie udało się wyznaczyć sensownej pętli',
            details: `Nie udało się znaleźć trasy bliższej docelowemu dystansowi ${(TARGET_DISTANCE / 1000).toFixed(2)} km w ramach ${MAX_ATTEMPTS} prób.`
        });
    }

});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}`);
});

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Ustawienia CORS: Zezwól na połączenia z dowolnego źródła
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Umożliwia Expressowi paroswanie ciała żądania JSON
app.use(express.json());

// Prosta trasa GET dla testowania działania API
app.get('/', (req, res) => {
    res.send('API działa. Użyj POST do /routes/generate, aby wyznaczyć trasę.');
});

// Funkcja pomocnicza: Oblicza nowy punkt (lat/lng) z zadanego punktu, dystansu (w metrach) i kierunku (stopnie)
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


// Zmieniony routing na /routes/generate - Główna logika
app.post('/routes/generate', async (req, res) => {
    console.log('Otrzymane BODY:', req.body); 

    const { origin, distance } = req.body; // distance jest w metrach

    // Walidacja klucza API
    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Błąd konfiguracji serwera', 
            details: 'Brak zmiennej środowiskowej GOOGLE_API_KEY. Sprawdź ustawienia DigitalOcean.' 
        });
    }

    // Walidacja podstawowych parametrów
    if (!origin || !distance || isNaN(distance) || distance <= 0) {
        return res.status(400).json({ 
            error: 'Brak lub niepoprawna wartość pól', 
            details: 'Wymagane: origin (punkt startowy) i distance (dystans pętli w metrach, > 0).' 
        });
    }

    console.log(`Żądanie: Start: ${origin}, Dystans docelowy: ${distance} metrów`);

    try {
        // --- KROK 1: Geolokalizacja punktu startowego (z adresu na Lat/Lng) ---
        const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: origin,
                key: process.env.GOOGLE_API_KEY
            }
        });
        
        if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
            console.error('Błąd geokodowania dla adresu:', origin);
            console.error('Odpowiedź Google Geocoding Status:', geoResponse.data.status);
            
            return res.status(400).json({ 
                error: 'Nie udało się geolokalizować punktu startowego.', 
                details: `Sprawdź, czy adres jest poprawny. Status z Google: ${geoResponse.data.status}.` 
            });
        }

        const startLocation = geoResponse.data.results[0].geometry.location;
        
        // --- KROK 2: Algorytm iteracyjny dopasowania dystansu ---
        
        // PARAMETRY OPTYMALIZACYJNE
        const TARGET_DISTANCE = distance;
        const MAX_ATTEMPTS = 5;
        const INITIAL_RADIUS_FACTOR = 0.25; // Początkowy promień to 25% dystansu
        const CORRECTION_FACTOR = 1.25; // Współczynnik zwiększenia promienia przy każdej nieudanej próbie (25% więcej)
        const TOLERANCE = 0.05; // Tolerancja 5% (trasa jest OK, jeśli jest w zakresie 95% - 105% docelowej długości)
        const MAX_OVERLENGTH_FACTOR = 1.15; // Nowy limit: Maksymalny akceptowalny dystans to 115% celu (np. 11.5 km dla 10 km)

        let currentRadiusFactor = INITIAL_RADIUS_FACTOR;
        let bestRoute = null;
        let minDifference = Infinity; // Śledzenie minimalnej różnicy do celu
        let lastDistanceValue = 0;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            
            // Generowanie nowego, losowego kierunku w każdej próbie, aby urozmaicić trasę
            const randomBearing = Math.floor(Math.random() * 360); 

            console.log(`Próba ${attempt}: Współczynnik promienia: ${currentRadiusFactor.toFixed(2)}, Kierunek: ${randomBearing}°`);
            
            // Obliczanie nowego promienia i punktu pośredniego
            const radiusMeters = TARGET_DISTANCE * currentRadiusFactor;
            
            const intermediatePoint = calculateDestination(
                startLocation.lat, 
                startLocation.lng, 
                radiusMeters, 
                randomBearing
            );
            const intermediatePointString = `${intermediatePoint.lat},${intermediatePoint.lng}`;
            
            // --- Wyznaczanie trasy (A -> B -> A) ---
            const params = {
                origin: origin,
                destination: origin, // Wracamy do startu
                waypoints: intermediatePointString, // Przez punkt pośredni (B)
                optimizeWaypoints: false, 
                mode: 'walking',
                avoidFerries: true,
                avoidTolls: true,
                key: process.env.GOOGLE_API_KEY
            };

            const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', { params });
            const data = response.data;

            if (data.status !== 'OK') {
                 // Jeśli Directions API zawiedzie, przerwij iterację
                console.error(`Directions API zawiodło w próbie ${attempt}. Status: ${data.status}`);
                break;
            }

            // Sumowanie dystansów
            const legs = data.routes[0].legs;
            let totalDistanceValue = 0;
            legs.forEach(leg => {
                totalDistanceValue += leg.distance.value;
            });

            console.log(`Dystans uzyskany w próbie ${attempt}: ${(totalDistanceValue / 1000).toFixed(2)} km`);

            // 1. Sprawdzenie warunku sukcesu (w ramach 5% tolerancji)
            if (totalDistanceValue >= TARGET_DISTANCE * (1 - TOLERANCE) && totalDistanceValue <= TARGET_DISTANCE * (1 + TOLERANCE)) {
                
                bestRoute = { data, totalDistanceValue };
                console.log(`Trasa dopasowana w próbie ${attempt}! Dystans: ${(totalDistanceValue / 1000).toFixed(2)} km`);
                break; // Znaleziono satysfakcjonującą trasę
            }

            // 2. Zachowaj najlepszą (najbliższą celu) trasę, ale odrzuć te zbyt długie (powyżej 115% celu)
            if (totalDistanceValue <= TARGET_DISTANCE * MAX_OVERLENGTH_FACTOR) {
                const currentDifference = Math.abs(totalDistanceValue - TARGET_DISTANCE);
                
                if (currentDifference < minDifference) {
                    minDifference = currentDifference;
                    bestRoute = { data, totalDistanceValue }; 
                    console.log(`Zapisano nową najlepszą trasę w próbie ${attempt}. Różnica: ${currentDifference}m.`);
                }
            } else {
                console.log(`Trasa w próbie ${attempt} zbyt długa (${(totalDistanceValue / 1000).toFixed(2)} km) - Odrzucono.`);
            }
            
            // 3. Korekta na następną iterację:
            // Zwiększamy promień, jeśli uzyskany dystans jest za krótki, lub zmniejszamy, jeśli jest za długi.
            if (totalDistanceValue < TARGET_DISTANCE) {
                currentRadiusFactor *= CORRECTION_FACTOR;
            } else {
                 // Jeśli dystans był za duży, zmniejsz promień
                 currentRadiusFactor /= CORRECTION_FACTOR;
            }
            
            lastDistanceValue = totalDistanceValue;
        }


        // --- KROK 3: Zwrócenie najlepszej trasy ---
        if (!bestRoute) {
             return res.status(500).json({ 
                error: 'Nie udało się wyznaczyć sensownej trasy', 
                details: 'Google Directions API nie było w stanie znaleźć pętli zbliżonej do docelowego dystansu po kilku próbach, a wszystkie znalezione trasy były zbyt długie.' 
            });
        }
        
        const totalDistanceText = `${(bestRoute.totalDistanceValue / 1000).toFixed(2)} km`;
        const data = bestRoute.data;

        // Zwrócenie danych do frontendu
        res.json({
            status: 'OK',
            distance_km: (bestRoute.totalDistanceValue / 1000).toFixed(2),
            message: `Wyznaczono pętlę o dystansie ${totalDistanceText}. Docelowy dystans: ${(TARGET_DISTANCE / 1000).toFixed(2)} km.`,
            polyline: data.routes[0].overview_polyline.points,
            details: `Wyznaczono pętlę A -> B -> A po ${(bestRoute.totalDistanceValue / 1000).toFixed(2)} km.`
        });

    } catch (error) {
        console.error('Błąd wewnętrzny serwera:', error.message);
        res.status(500).json({
            error: 'Błąd wewnętrzny serwera lub problem z połączeniem z Google API',
            details: error.message
        });
    }
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}`);
});

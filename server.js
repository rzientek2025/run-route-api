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

// Funkcja pomocnicza: Konwertuje kierunek kardynalny (N, E, S, W) na stopnie
function getBearingFromDirection(direction) {
    switch (direction.toUpperCase()) {
        case 'N': return 0;
        case 'E': return 90;
        case 'S': return 180;
        case 'W': return 270;
        default: return Math.floor(Math.random() * 360); // Losowy kierunek dla domyślnego
    }
}


// Główny routing POST
app.post('/routes/generate', async (req, res) => {
    console.log('Otrzymane BODY:', req.body); 

    const { origin, distance, direction } = req.body; // Dodano 'direction'
    const TARGET_DISTANCE = distance; // Dystans jest w metrach
    
    // Ustawienie stałe dla urozmaicenia tras
    const OPTIMIZE_FOR_DIVERSITY = true; 

    // Walidacja klucza API
    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Błąd konfiguracji serwera', 
            details: 'Brak zmiennej środowiskowej GOOGLE_API_KEY. Sprawdź ustawienia DigitalOcean.' 
        });
    }

    // Walidacja podstawowych parametrów
    if (!origin || !TARGET_DISTANCE || isNaN(TARGET_DISTANCE) || TARGET_DISTANCE <= 0) {
        return res.status(400).json({ 
            error: 'Brak lub niepoprawna wartość pól', 
            details: 'Wymagane: origin (punkt startowy) i distance (dystans pętli w metrach, > 0).' 
        });
    }

    console.log(`Żądanie: Start: ${origin}, Dystans docelowy: ${TARGET_DISTANCE} metrów, Kierunek: ${direction || 'Losowy'}`);

    try {
        // --- KROK 1: Geolokalizacja punktu startowego (z adresu na Lat/Lng) ---
        let startLocation;
        const coordsMatch = origin.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
        
        if (coordsMatch) {
            startLocation = { lat: parseFloat(coordsMatch[1]), lng: parseFloat(coordsMatch[3]) };
        } else {
            const geoResponse = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
                params: {
                    address: origin,
                    key: process.env.GOOGLE_API_KEY
                }
            });
            
            if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
                return res.status(400).json({ 
                    error: 'Nie udało się geolokalizować punktu startowego.', 
                    details: `Sprawdź, czy adres jest poprawny. Status z Google: ${geoResponse.data.status}.` 
                });
            }
            startLocation = geoResponse.data.results[0].geometry.location;
        }

        // --- KROK 2: Algorytm iteracyjny dopasowania dystansu z 2 Waypointami ---
        
        // PARAMETRY OPTYMALIZACYJNE
        const MAX_ATTEMPTS = 15; // Zwiększamy liczbę prób dla lepszego dopasowania
        const ACCEPTANCE_TOLERANCE = 0.05; // 5% tolerancji (95%-105%)
        const MAX_OVERAGE_FACTOR = 1.10; // Maksymalne dopuszczalne przekroczenie dystansu (10%)
        const MAX_ACCEPTABLE_DISTANCE = TARGET_DISTANCE * MAX_OVERAGE_FACTOR;

        // Promień jest proporcjonalny do 1/4 docelowego dystansu pętli
        const INITIAL_RADIUS_METERS = TARGET_DISTANCE / 4.0; 
        
        let bestRoute = null;
        let bestDeviation = Infinity;

        // Bazowy kierunek dla Waypointa A
        const baseBearingA = getBearingFromDirection(direction || ''); 
        
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            
            // Promienie są losowo odchylane od wartości bazowej
            const radiusA = INITIAL_RADIUS_METERS * (1 + (Math.random() * 0.4 - 0.2)); // +/- 20%
            const radiusB = radiusA * (1.1 + Math.random() * 0.2); // Waypoint B jest dalej o 10-30%

            // W1 (Waypoint A): Lekko odchylony od kierunku bazowego
            const currentBearingA = (baseBearingA + (Math.random() * 20 - 10) + 360) % 360; 

            const W1 = calculateDestination(
                startLocation.lat, 
                startLocation.lng, 
                radiusA, 
                currentBearingA
            );
            const W1String = `${W1.lat},${W1.lng}`;

            // W2 (Waypoint B): Generowany w kierunku prostopadłym/przeciwnym do W1.
            // Używamy kierunku przesuniętego o ~120 stopni dla bardziej okrągłego kształtu.
            const currentBearingB = (currentBearingA + 120 + (Math.random() * 40 - 20) + 360) % 360; 

            const W2 = calculateDestination(
                startLocation.lat, 
                startLocation.lng, 
                radiusB, 
                currentBearingB
            );
            const W2String = `${W2.lat},${W2.lng}`;
            
            // --- Wyznaczanie trasy (A -> W1 -> W2 -> A) ---
            const waypointsString = `${W1String}|${W2String}`;

            const params = {
                origin: origin,
                destination: origin, 
                waypoints: waypointsString, 
                optimizeWaypoints: false, 
                mode: 'walking',
                avoidFerries: true,
                avoidTolls: true,
                // Nowe parametry dla urozmaicenia trasy
                avoidHighways: OPTIMIZE_FOR_DIVERSITY,
                language: OPTIMIZE_FOR_DIVERSITY ? 'pl' : undefined, // Wprowadzenie regionu/języka
                key: process.env.GOOGLE_API_KEY
            };

            let response;
            try {
                 response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', { params });
            } catch(e) {
                 console.error(`Błąd sieci/API w próbie ${attempt}: ${e.message}`);
                 continue; // Kontynuuj pętlę w przypadku błędu
            }
            
            const data = response.data;

            if (data.status !== 'OK') {
                console.warn(`Directions API zawiodło w próbie ${attempt}. Status: ${data.status}. Waypoints: ${waypointsString}`);
                continue; // Kontynuuj pętlę, jeśli API zwróci błąd (np. ZERO_RESULTS)
            }

            // Sumowanie dystansów
            const legs = data.routes[0].legs;
            let totalDistanceValue = 0;
            legs.forEach(leg => {
                totalDistanceValue += leg.distance.value;
            });

            console.log(`Próba ${attempt}: Promień A: ${radiusA.toFixed(0)}m, Promień B: ${radiusB.toFixed(0)}m. Dystans uzyskany: ${totalDistanceValue}m`);

            
            // --- LOGIKA WYBORU NAJLEPSZEJ TRASY Z OGRANICZENIEM DŁUGOŚCI ---
            
            const currentDeviation = Math.abs(totalDistanceValue - TARGET_DISTANCE);

            // 1. Sprawdzenie, czy trasa jest akceptowalna (nie przekracza MAX_OVERAGE_FACTOR)
            if (totalDistanceValue <= MAX_ACCEPTABLE_DISTANCE) {
                // 2. Jeśli obecna trasa jest bliżej celu niż dotychczasowa "najlepsza", zapisz ją
                if (currentDeviation < bestDeviation) {
                    bestRoute = { data, totalDistanceValue, waypoints: waypointsString };
                    bestDeviation = currentDeviation;
                    console.log(`Nowa najlepsza trasa znaleziona (odchylenie: ${currentDeviation.toFixed(0)}m)`);
                }

                // 3. Sprawdzenie warunku szybkiego sukcesu (trasa jest w zakresie 95%-105% docelowej)
                if (totalDistanceValue >= TARGET_DISTANCE * (1 - ACCEPTANCE_TOLERANCE)) {
                     // Jeśli jest bardzo blisko (np. w zakresie 2.5% - pół tolerancji), przerywamy
                    if (currentDeviation <= TARGET_DISTANCE * (ACCEPTANCE_TOLERANCE / 2.5)) {
                        console.log(`Trasa idealnie dopasowana! Dystans: ${totalDistanceValue}m`);
                        break; 
                    }
                }
            }
        }


        // --- KROK 3: Zwrócenie najlepszej trasy ---
        if (!bestRoute) {
             return res.status(404).json({ 
                error: 'Nie udało się wyznaczyć sensownej pętli.', 
                details: 'Google Directions API nie było w stanie znaleźć urozmaiconej pętli zbliżonej do docelowego dystansu po 15 próbach w dopuszczalnym zakresie (Max +10%). Spróbuj zmienić Punkt Startowy lub Kierunek.' 
            });
        }
        
        const totalDistanceText = `${(bestRoute.totalDistanceValue / 1000).toFixed(2)} km`;
        const data = bestRoute.data;

        // Zwrócenie danych do frontendu
        res.json({
            status: 'OK',
            distance_km: (bestRoute.totalDistanceValue / 1000).toFixed(2),
            message: `Wyznaczono urozmaiconą pętlę o dystansie ${totalDistanceText}. Docelowy dystans: ${(TARGET_DISTANCE / 1000).toFixed(2)} km.`,
            polyline: data.routes[0].overview_polyline.points,
            details: `Wyznaczono pętlę A -> W1 -> W2 -> A po ${totalDistanceText}. Użyte Waypointy: ${bestRoute.waypoints}`
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

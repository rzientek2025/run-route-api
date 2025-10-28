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
// To zastępuje potrzebę zewnętrznej biblioteki geolib.
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

    // Walidacja podstawowych parametrów
    if (!origin || !distance) {
        return res.status(400).json({ 
            error: 'Brak wymaganych pól', 
            details: 'Wymagane: origin (punkt startowy) i distance (dystans pętli w metrach).' 
        });
    }

    // Walidacja klucza API
    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ 
            error: 'Błąd konfiguracji serwera', 
            details: 'Brak zmiennej środowiskowej GOOGLE_API_KEY. Sprawdź ustawienia DigitalOcean.' 
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
        
        // 🚨 DIAGNOSTYKA: Zaloguj pełną odpowiedź, jeśli geokodowanie nie powiodło się
        if (geoResponse.data.status !== 'OK' || geoResponse.data.results.length === 0) {
            console.error('Błąd geokodowania dla adresu:', origin);
            console.error('Odpowiedź Google Geocoding Status:', geoResponse.data.status);
            console.error('Wiadomość błędu Google:', geoResponse.data.error_message);
            
            return res.status(400).json({ 
                error: 'Nie udało się geolokalizować punktu startowego.', 
                details: `Sprawdź, czy adres jest poprawny. Status z Google: ${geoResponse.data.status}.` 
            });
        }

        const startLocation = geoResponse.data.results[0].geometry.location;
        
        // --- KROK 2: Obliczanie punktu pośredniego (Waypoint) ---
        // Używamy ok. 1/4 docelowego dystansu pętli jako promienia, aby trasa miała pole manewru.
        const radiusMeters = distance / 4; 
        
        // Losowy kierunek (bearing) dla urozmaicenia trasy
        const randomBearing = Math.floor(Math.random() * 360); 

        const intermediatePoint = calculateDestination(
            startLocation.lat, 
            startLocation.lng, 
            radiusMeters, 
            randomBearing
        );

        const intermediatePointString = `${intermediatePoint.lat},${intermediatePoint.lng}`;
        
        // --- KROK 3: Wyznaczanie trasy (A -> B -> A) ---
        const params = {
            origin: origin,
            destination: origin, // Wracamy do startu
            waypoints: intermediatePointString, // Przez punkt pośredni (B)
            optimizeWaypoints: false, // Kolejność jest A -> B -> A
            mode: 'walking',
            // Opcje, aby API preferowało ścieżki dla pieszych
            avoidFerries: true,
            avoidTolls: true,
            key: process.env.GOOGLE_API_KEY
        };

        const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', { params });
        const data = response.data;

        // Obsługa błędów zwróconych przez Google API
        if (data.status !== 'OK') {
            return res.status(400).json({
                error: `Błąd API Google Maps: ${data.status}`,
                details: data.error_message || 'Brak szczegółów błędu.',
                data_status: data.status
            });
        }

        // Sumowanie dystansów z obu segmentów (A->B i B->A)
        const legs = data.routes[0].legs;
        let totalDistanceValue = 0;

        legs.forEach(leg => {
            totalDistanceValue += leg.distance.value;
        });
        
        const totalDistanceText = `${(totalDistanceValue / 1000).toFixed(2)} km`;
        
        // Zwrócenie danych do frontendu
        res.json({
            status: 'OK',
            distance_km: (totalDistanceValue / 1000).toFixed(2),
            message: `Wyznaczono pętlę o dystansie ${totalDistanceText}. Docelowy dystans: ${(distance / 1000).toFixed(2)} km.`,
            polyline: data.routes[0].overview_polyline.points,
            details: 'Wyznaczono pętlę A -> B -> A.'
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

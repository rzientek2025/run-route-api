const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Ustawienia CORS: Zezwól na połączenia z dowolnego źródła dla prostoty wdrożenia
// W środowisku produkcyjnym, zmień na adres URL Twojego frontendu!
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Prosta trasa GET dla testowania działania API
app.get('/', (req, res) => {
    res.send('API działa. Użyj POST do /routes/generate, aby wyznaczyć trasę.');
});

// 🚨 KLUCZOWA ZMIANA: Zmieniony routing na /routes/generate
app.post('/routes/generate', async (req, res) => {
    // 🚨 NOWE: Odczytujemy punkt startowy i dystans w metrach
    const { origin, distance } = req.body; 

    // Walidacja podstawowych parametrów
    if (!origin || !distance) {
        return res.status(400).json({ 
            error: 'Brak wymaganych parametrów', 
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

    // Ustawienie parametrów do Google Directions API
    // 🚨 TYMCZASOWY CEL: Z A do A (cel = start), aby zweryfikować routing.
    const params = {
        origin: origin,
        destination: origin, // Właściwy algorytm pętli będzie w tym miejscu
        mode: 'walking',
        // Opcje, aby API preferowało ścieżki dla pieszych
        avoidFerries: true,
        avoidTolls: true,
        key: process.env.GOOGLE_API_KEY
    };

    try {
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

        const route = data.routes[0].legs[0];
        
        const message = `Wyznaczono trasę (tymczasowo) z powrotem do startu. Dystans: ${route.distance.text}. Docelowy dystans pętli: ${(distance / 1000).toFixed(2)} km.`;

        // Zwrócenie danych do frontendu
        res.json({
            status: 'OK',
            distance_km: (route.distance.value / 1000).toFixed(2),
            message: message,
            polyline: data.routes[0].overview_polyline.points,
            details: 'API jest gotowe na algorytm generowania pętli.'
        });

    } catch (error) {
        console.error('Błąd podczas komunikacji z Google API:', error.message);
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

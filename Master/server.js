const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let servers = [];
let aggregatedData = {
    animals: [],
    matches: [],
    likes: {}
};

// Ensure data directory exists
const dataDir = path.join(__dirname, './data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Ensure required data files exist
const serverRegistryPath = path.join(dataDir, 'server_registry.json');
const aggregatedDataPath = path.join(dataDir, 'aggregated_data.json');

if (!fs.existsSync(serverRegistryPath)) {
    fs.writeFileSync(serverRegistryPath, '[]');
}

if (!fs.existsSync(aggregatedDataPath)) {
    fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
}

// Chargement initial des données
try {
    servers = JSON.parse(fs.readFileSync(serverRegistryPath));
    aggregatedData = JSON.parse(fs.readFileSync(aggregatedDataPath));
} catch (err) {
    console.log('Initialisation des fichiers de données');
    fs.writeFileSync(serverRegistryPath, '[]');
    fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
}

// Enregistrement d'un nouveau serveur
app.post('/register', (req, res) => {
    const { city, url, animalCount, latitude, longitude } = req.body;
    const existingServer = servers.find(s => s.city === city);

    if (existingServer) {
        Object.assign(existingServer, { url, animalCount, latitude, longitude });
    } else {
        servers.push({ city, url, animalCount, latitude, longitude });
    }

    fs.writeFileSync(serverRegistryPath, JSON.stringify(servers));
    res.json({ message: 'Serveur enregistré avec succès' });
});

// Synchronisation des données
app.post('/sync', (req, res) => {
    const { city, data } = req.body;

    // Mise à jour des données agrégées
    aggregatedData.animals = aggregatedData.animals.filter(a => a.city !== city);
    aggregatedData.matches = aggregatedData.matches.filter(m => m.city !== city);

    aggregatedData.animals.push(...data.animals);
    aggregatedData.matches.push(...data.matches);

    fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
    res.json({ message: 'Données synchronisées avec succès' });
});

// Mise à jour de la ville d'un animal
app.post('/updateCity', (req, res) => {
    const { id, newCity } = req.body;
    const animal = aggregatedData.animals.find(a => a.id === id);
    if (animal) {
        animal.city = newCity;
        fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
        res.json({ message: 'Ville mise à jour avec succès' });
    } else {
        res.status(404).json({ message: 'Animal non trouvé' });
    }
});

// Obtention des statistiques globales
app.get('/stats', (req, res) => {
    const stats = {
        totalAnimals: aggregatedData.animals.length,
        totalMatches: aggregatedData.matches.length,
        serverCount: servers.length,
        servers: servers.map(s => ({
            city: s.city,
            animalCount: s.animalCount
        }))
    };
    res.json(stats);
});

app.get('/data', (req, res) => {
    res.json(aggregatedData);
});

// Enregistrement d'un nouvel utilisateur
app.post('/registerUser', (req, res) => {
    const { userId } = req.body;
    if (!aggregatedData.likes[userId]) {
        aggregatedData.likes[userId] = [];
    }
    res.json({ message: 'Utilisateur enregistré avec succès' });
});

// Mise à jour des détails d'un animal
app.put('/updateAnimal', (req, res) => {
    const { animalId, details } = req.body;
    const animal = aggregatedData.animals.find(a => a.id === animalId);
    if (animal) {
        Object.assign(animal, details);
        fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
        res.json({ message: 'Détails de l\'animal mis à jour avec succès' });
    } else {
        res.status(404).json({ message: 'Animal non trouvé' });
    }
});

// Aimer ou ne pas aimer un animal
app.post('/like', (req, res) => {
    const { userId, animalId } = req.body;
    if (!aggregatedData.likes[userId]) {
        aggregatedData.likes[userId] = [];
    }
    if (!aggregatedData.likes[userId].includes(animalId)) {
        aggregatedData.likes[userId].push(animalId);
    }
    fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
    res.json({ message: 'Animal aimé avec succès' });
});

app.post('/unlike', (req, res) => {
    const { userId, animalId } = req.body;
    if (aggregatedData.likes[userId]) {
        aggregatedData.likes[userId] = aggregatedData.likes[userId].filter(id => id !== animalId);
        fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
    }
    res.json({ message: 'Animal non aimé avec succès' });
});

// Logique de correspondance
app.post('/match', (req, res) => {
    const { userId, animalId } = req.body;
    const animal = aggregatedData.animals.find(a => a.id === animalId);
    if (animal && aggregatedData.likes[userId] && aggregatedData.likes[userId].includes(animalId)) {
        aggregatedData.matches.push({ userId, animalId });
        fs.writeFileSync(aggregatedDataPath, JSON.stringify(aggregatedData));
        res.json({ message: 'Correspondance réussie' });
    } else {
        res.status(400).json({ message: 'Correspondance échouée' });
    }
});

// Connexion utilisateur et redirection
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.post('/login', (req, res) => {
    const { latitude, longitude } = req.body;

    // Calcul de la distance entre deux points géographiques
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Rayon de la Terre en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Trouver le serveur le plus proche
    let closestServer = null;
    let minDistance = Infinity;

    const distances = servers.map(server => ({
        server,
        distance: calculateDistance(
            latitude,
            longitude,
            server.latitude,
            server.longitude
        )
    }));

    // Trouver le serveur avec la distance minimale
    closestServer = distances.reduce((closest, current) => {
        return current.distance < closest.distance ? current : closest;
    }).server;

    console.log('Le serveur le plus proche est:', closestServer);

    if (closestServer) {
        res.json({
            redirectUrl: closestServer.url,
            city: closestServer.city,
            distance: Math.round(minDistance)
        });
    } else {
        res.status(404).json({
            message: 'Aucun serveur disponible dans votre région'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur principal démarré sur le port ${PORT}`);
});
const express = require('express');
const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(express.json());

let servers = [];
let aggregatedData = {
    animals: [],
    matches: []
};

// Chargement initial des données
try {
    servers = JSON.parse(fs.readFileSync('./data/server_registry.json'));
    aggregatedData = JSON.parse(fs.readFileSync('./data/aggregated_data.json'));
} catch (err) {
    console.log('Initialisation des fichiers de données');
    fs.writeFileSync('./data/server_registry.json', '[]');
    fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
}

// Enregistrement d'un nouveau serveur
app.post('/register', (req, res) => {
    const { city, url, animalCount } = req.body;
    const existingServer = servers.find(s => s.city === city);

    if (existingServer) {
        Object.assign(existingServer, { url, animalCount });
    } else {
        servers.push({ city, url, animalCount });
    }

    fs.writeFileSync('./data/server_registry.json', JSON.stringify(servers));
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

    fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
    res.json({ message: 'Données synchronisées avec succès' });
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

app.listen(PORT, () => {
    console.log(`Serveur principal démarré sur le port ${PORT}`);
});
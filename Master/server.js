const express = require('express');
const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(express.json());

let servers = [];
let aggregatedData = {
    animals: [],
    matches: [],
    likes: {}
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
        fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
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
    fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
    res.json({ message: 'Animal aimé avec succès' });
});

app.post('/unlike', (req, res) => {
    const { userId, animalId } = req.body;
    if (aggregatedData.likes[userId]) {
        aggregatedData.likes[userId] = aggregatedData.likes[userId].filter(id => id !== animalId);
        fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
    }
    res.json({ message: 'Animal non aimé avec succès' });
});

// Logique de correspondance
app.post('/match', (req, res) => {
    const { userId, animalId } = req.body;
    const animal = aggregatedData.animals.find(a => a.id === animalId);
    if (animal && aggregatedData.likes[userId] && aggregatedData.likes[userId].includes(animalId)) {
        aggregatedData.matches.push({ userId, animalId });
        fs.writeFileSync('./data/aggregated_data.json', JSON.stringify(aggregatedData));
        res.json({ message: 'Correspondance réussie' });
    } else {
        res.status(400).json({ message: 'Correspondance échouée' });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur principal démarré sur le port ${PORT}`);
});
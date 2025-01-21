const express = require('express');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = 3001;
const CITY = 'Toulouse';
const MASTER_URL = 'http://localhost:3000';

app.use(express.json());

// Données locales
let animals = [];
let matches = [];
let likes = {};

// Chargement initial des données
try {
    animals = JSON.parse(fs.readFileSync('./data/animals.json'));
    matches = JSON.parse(fs.readFileSync('./data/matches.json'));
    likes = JSON.parse(fs.readFileSync('./data/likes.json'));
} catch (err) {
    console.log('Initialisation des fichiers de données');
    fs.writeFileSync('./data/animals.json', '[]');
    fs.writeFileSync('./data/matches.json', '[]');
    fs.writeFileSync('./data/likes.json', '{}');
}

// Enregistrement auprès du serveur principal
async function registerWithMaster() {
    try {
        await axios.post(`${MASTER_URL}/register`, {
            city: CITY,
            url: `http://localhost:${PORT}`,
            animalCount: animals.length
        });
        console.log('Enregistré auprès du serveur principal');
    } catch (err) {
        console.error('Erreur d\'enregistrement:', err.message);
    }
}

// Synchronisation périodique avec le master
setInterval(async () => {
    try {
        await axios.post(`${MASTER_URL}/sync`, {
            city: CITY,
            data: {
                animals,
                matches
            }
        });
        console.log('Données synchronisées avec le master');
    } catch (err) {
        console.error('Erreur de synchronisation:', err.message);
    }
}, 60000); // Toutes les minutes

// API Routes
app.post('/register', (req, res) => {
    const newAnimal = {
        id: Date.now(),
        ...req.body,
        city: CITY
    };
    animals.push(newAnimal);
    fs.writeFileSync('./data/animals.json', JSON.stringify(animals));
    res.json(newAnimal);
});

app.put('/animals/:id', (req, res) => {
    const { id } = req.params;
    const animal = animals.find(a => a.id == id);
    if (animal) {
        Object.assign(animal, req.body);
        fs.writeFileSync('./data/animals.json', JSON.stringify(animals));
        res.json(animal);
    } else {
        res.status(404).json({ message: 'Animal not found' });
    }
});

app.put('/animals/:id/city', (req, res) => {
    const { id } = req.params;
    const { newCity } = req.body;
    const animal = animals.find(a => a.id == id);
    if (animal) {
        animal.city = newCity;
        fs.writeFileSync('./data/animals.json', JSON.stringify(animals));
        res.json(animal);
    } else {
        res.status(404).json({ message: 'Animal not found' });
    }
});

app.post('/animals/:id/like', (req, res) => {
    const { id } = req.params;
    const { likedAnimalId } = req.body;
    if (!likes[id]) {
        likes[id] = { liked: [], unliked: [] };
    }
    likes[id].liked.push(likedAnimalId);
    fs.writeFileSync('./data/likes.json', JSON.stringify(likes));

    // Check for match
    if (likes[likedAnimalId] && likes[likedAnimalId].liked.includes(id)) {
        const newMatch = { id: Date.now(), animals: [id, likedAnimalId], city: CITY };
        matches.push(newMatch);
        fs.writeFileSync('./data/matches.json', JSON.stringify(matches));
        res.json({ match: true, newMatch });
    } else {
        res.json({ match: false });
    }
});

app.post('/animals/:id/unlike', (req, res) => {
    const { id } = req.params;
    const { unlikedAnimalId } = req.body;
    if (!likes[id]) {
        likes[id] = { liked: [], unliked: [] };
    }
    likes[id].unliked.push(unlikedAnimalId);
    fs.writeFileSync('./data/likes.json', JSON.stringify(likes));
    res.json({ message: 'Animal unliked' });
});

app.get('/animals', (req, res) => {
    res.json(animals);
});

app.post('/animals', (req, res) => {
    const newAnimal = {
        id: Date.now(),
        ...req.body,
        city: CITY
    };
    animals.push(newAnimal);
    fs.writeFileSync('./data/animals.json', JSON.stringify(animals));
    res.json(newAnimal);
});

app.post('/matches', (req, res) => {
    const newMatch = {
        id: Date.now(),
        ...req.body,
        city: CITY
    };
    matches.push(newMatch);
    fs.writeFileSync('./data/matches.json', JSON.stringify(matches));
    res.json(newMatch);
});

app.listen(PORT, () => {
    console.log(`Serveur ${CITY} démarré sur le port ${PORT}`);
    registerWithMaster();
});
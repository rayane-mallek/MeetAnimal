const express = require('express');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = 3001;
const CITY = 'Ville1';
const MASTER_URL = 'http://localhost:3000';

app.use(express.json());

// Données locales
let animals = [];
let matches = [];

// Chargement initial des données
try {
    animals = JSON.parse(fs.readFileSync('./data/animals.json'));
    matches = JSON.parse(fs.readFileSync('./data/matches.json'));
} catch (err) {
    console.log('Initialisation des fichiers de données');
    fs.writeFileSync('./data/animals.json', '[]');
    fs.writeFileSync('./data/matches.json', '[]');
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
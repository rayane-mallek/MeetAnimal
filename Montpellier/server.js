const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3002;
const config = require('./config.json');
const CITY = config.city;
const MASTER_URL = 'http://localhost:3000';

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Ensure data directory exists
const dataDir = path.join(__dirname, './data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Ensure required data files exist
const usersPath = path.join(dataDir, 'users.json');
const animalsPath = path.join(dataDir, 'animals.json');
const matchesPath = path.join(dataDir, 'matches.json');
const likesPath = path.join(dataDir, 'likes.json');

if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, '[]');
}

if (!fs.existsSync(animalsPath)) {
    fs.writeFileSync(animalsPath, '[]');
}

if (!fs.existsSync(matchesPath)) {
    fs.writeFileSync(matchesPath, '[]');
}

if (!fs.existsSync(likesPath)) {
    fs.writeFileSync(likesPath, '{}');
}

// Données locales
let users = [];
let animals = [];
let matches = [];
let likes = {};

// Chargement initial des données
try {
    users = JSON.parse(fs.readFileSync(usersPath));
    animals = JSON.parse(fs.readFileSync(animalsPath));
    matches = JSON.parse(fs.readFileSync(matchesPath));
    likes = JSON.parse(fs.readFileSync(likesPath));
} catch (err) {
    console.log('Initialisation des fichiers de données');
    fs.writeFileSync(usersPath, '[]');
    fs.writeFileSync(animalsPath, '[]');
    fs.writeFileSync(matchesPath, '[]');
    fs.writeFileSync(likesPath, '{}');
}

// Enregistrement auprès du serveur principal
async function registerWithMaster() {
    try {
        await axios.post(`${MASTER_URL}/register`, {
            city: CITY,
            url: `http://localhost:${PORT}`,
            animalCount: animals.length,
            latitude: config.latitude,
            longitude: config.longitude
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

// User Authentication Routes
app.get('/registerForm', (req, res) => res.sendFile(path.join(__dirname, '../public/register.html')));

app.get('/loginForm', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now(), username, password: hashedPassword };
    users.push(newUser);
    fs.writeFileSync(usersPath, JSON.stringify(users));
    res.json({ message: 'User registered successfully' });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        res.json({ message: 'Login successful' });
    } else {
        res.status(401).json({ message: 'Invalid credentials' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logout successful' });
});

app.get('/profile', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const user = users.find(u => u.id === req.session.userId);
    res.json(user);
});

app.put('/profile', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const user = users.find(u => u.id === req.session.userId);
    Object.assign(user, req.body);
    fs.writeFileSync(usersPath, JSON.stringify(users));
    res.json({ message: 'Profile updated successfully' });
});

// API Routes
app.post('/register-animal', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const newAnimal = {
        id: Date.now(),
        ...req.body,
        city: CITY
    };
    animals.push(newAnimal);
    fs.writeFileSync(animalsPath, JSON.stringify(animals));
    res.json(newAnimal);
});

app.put('/animals/:id', (req, res) => {
    const { id } = req.params;
    const animal = animals.find(a => a.id == id);
    if (animal) {
        Object.assign(animal, req.body);
        fs.writeFileSync(animalsPath, JSON.stringify(animals));
        res.json(animal);
    } else {
        res.status(404).json({ message: 'Animal not found' });
    }
});

app.put('/animals/:id/city', async (req, res) => {
    const { id } = req.params;
    const { newCity } = req.body;
    const animal = animals.find(a => a.id == id);
    if (animal) {
        animal.city = newCity;
        fs.writeFileSync(animalsPath, JSON.stringify(animals));
        res.json(animal);

        // Notify master server about the city change
        try {
            await axios.post(`${MASTER_URL}/updateCity`, {
                id,
                newCity
            });
            console.log('City updated on master server');
        } catch (err) {
            console.error('Erreur de mise à jour de la ville:', err.message);
        }
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
    fs.writeFileSync(likesPath, JSON.stringify(likes));

    // Check for match
    if (likes[likedAnimalId] && likes[likedAnimalId].liked.includes(id)) {
        const newMatch = { id: Date.now(), animals: [id, likedAnimalId], city: CITY };
        matches.push(newMatch);
        fs.writeFileSync(matchesPath, JSON.stringify(matches));
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
    fs.writeFileSync(likesPath, JSON.stringify(likes));
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
    fs.writeFileSync(animalsPath, JSON.stringify(animals));
    res.json(newAnimal);
});

app.post('/matches', (req, res) => {
    const newMatch = {
        id: Date.now(),
        ...req.body,
        city: CITY
    };
    matches.push(newMatch);
    fs.writeFileSync(matchesPath, JSON.stringify(matches));
    res.json(newMatch);
});

app.listen(PORT, () => {
    console.log(`Serveur ${CITY} démarré sur le port ${PORT}`);
    registerWithMaster();
});

// Ajoutez ces routes dans les deux serveurs

// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Route pour obtenir les animaux de la ville
app.get('/city-animals', (req, res) => {
    res.json(animals.filter(animal => animal.city === CITY));
});

// Route pour obtenir les matches de la ville
app.get('/city-matches', (req, res) => {
    res.json(matches.filter(match => match.city === CITY));
});

// Route pour la synchronisation avec le master
app.post('/sync-with-master', async (req, res) => {
    try {
        const response = await axios.post(`${MASTER_URL}/sync`, {
            city: CITY,
            data: {
                animals: animals.filter(animal => animal.city === CITY),
                matches: matches.filter(match => match.city === CITY)
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ message: 'Erreur de synchronisation avec le master' });
    }
});
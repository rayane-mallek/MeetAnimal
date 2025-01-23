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

// Middlewares
app.use(express.urlencoded({ extended: true }));
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

app.get('/registerForm', (req, res) => res.sendFile(path.join(__dirname, '../public/register.html')));

app.get('/loginForm', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));

app.get('/registerAnimalForm', (req, res) => res.sendFile(path.join(__dirname, '../public/register_animal.html')));

// User Authentication Routes
app.post('/register', async (req, res) => {
    const { username, password, latitude, longitude } = req.body;
    console.log(username, password, latitude, longitude);
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now(), username, password: hashedPassword, animalIds: [], latitude, longitude };
        users.push(newUser);
        fs.writeFileSync(usersPath, JSON.stringify(users));
        res.json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password, latitude, longitude } = req.body;
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        user.latitude = latitude;
        user.longitude = longitude;
        fs.writeFileSync(usersPath, JSON.stringify(users));
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
    const userLikes = likes[user.id] || { liked: [], unliked: [] };
    res.json({ ...user, likes: userLikes });
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
        city: CITY,
        ownerId: req.session.userId
    };
    animals.push(newAnimal);
    const user = users.find(u => u.id === req.session.userId);
    user.animalIds.push(newAnimal.id);
    fs.writeFileSync(animalsPath, JSON.stringify(animals));
    fs.writeFileSync(usersPath, JSON.stringify(users));
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
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const { id } = req.params;
    const userId = req.session.userId;
    if (!likes[userId]) {
        likes[userId] = { liked: [], unliked: [] };
    }
    if (!likes[userId].liked.includes(id)) {
        likes[userId].liked.push(id);
        fs.writeFileSync(likesPath, JSON.stringify(likes));
    }
    res.json({ message: 'Animal liked successfully' });
});

app.post('/animals/:id/unlike', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    const { id } = req.params;
    const userId = req.session.userId;
    if (likes[userId] && likes[userId].liked.includes(id)) {
        likes[userId].liked = likes[userId].liked.filter(likedId => likedId !== id);
        fs.writeFileSync(likesPath, JSON.stringify(likes));
    }
    res.json({ message: 'Animal unliked successfully' });
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

// Transfer user data to another server
app.post('/transfer', async (req, res) => {
    const { targetServerUrl } = req.body;
    const user = users.find(u => u.id === req.session.userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const userAnimals = animals.filter(a => a.ownerId === user.id);
    const userLikes = likes[user.id] || { liked: [], unliked: [] };

    try {
        // Register user on the target server
        await axios.post(`${targetServerUrl}/register`, {
            username: user.username,
            password: 'aaa123' // Use a known password for registration
        });

        // Authenticate user on the target server
        const loginResponse = await axios.post(`${targetServerUrl}/login`, {
            username: user.username,
            password: 'aaa123' // Use the same known password for login
        });

        if (loginResponse.status !== 200) {
            return res.status(401).json({ message: 'Bad credentials' });
        }

        const cookies = loginResponse.headers['set-cookie'];

        // Transfer animals data
        for (const animal of userAnimals) {
            await axios.post(`${targetServerUrl}/register-animal`, {
                ...animal,
                ownerId: user.id
            }, { headers: { Cookie: cookies } });
        }

        // Transfer likes data
        await axios.post(`${targetServerUrl}/transfer-likes`, {
            userId: user.id,
            likes: userLikes
        }, { headers: { Cookie: cookies } });

        // Remove user and their animals from current server
        users = users.filter(u => u.id !== user.id);
        animals = animals.filter(a => a.ownerId !== user.id);
        delete likes[user.id];
        fs.writeFileSync(usersPath, JSON.stringify(users));
        fs.writeFileSync(animalsPath, JSON.stringify(animals));
        fs.writeFileSync(likesPath, JSON.stringify(likes));

        // Redirect user to the new server
        res.json({ message: 'User and animals transferred successfully', redirectUrl: `${targetServerUrl}/loginForm` });
    } catch (error) {
        res.status(500).json({ message: 'Error transferring data' });
    }
});

// Endpoint to receive transferred likes
app.post('/transfer-likes', (req, res) => {
    const { userId, likes: transferredLikes } = req.body;
    likes[userId] = transferredLikes;
    fs.writeFileSync(likesPath, JSON.stringify(likes));
    res.json({ message: 'Likes transferred successfully' });
});

app.listen(PORT, () => {
    console.log(`Serveur ${CITY} démarré sur le port ${PORT}`);
});

// Ajoutez ces routes dans les deux serveurs

// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/users', (req, res) => {
    res.json(users);
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

app.get('/config', (req, res) => {
    res.json(config);
});

// Route pour afficher la carte des animaux
app.get('/animals-map-page', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    res.sendFile(path.join(__dirname, '../public/map.html'));
});

// Route API pour récupérer les données des animaux pour la carte
app.get('/animals-map', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = users.find(u => u.id === req.session.userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const userLatitude = parseFloat(user.latitude);
    const userLongitude = parseFloat(user.longitude);

    const animalsWithDetails = animals.map(animal => {
        const owner = users.find(u => u.id === animal.ownerId);
        const distance = calculateDistance(userLatitude, userLongitude, parseFloat(owner.latitude), parseFloat(owner.longitude));
        return {
            id: animal.id,
            name: animal.name,
            photo: animal.photo,
            ownerId: animal.ownerId,
            latitude: owner.latitude,
            longitude: owner.longitude,
            distance
        };
    });

    res.json(animalsWithDetails);
});

// Fonction pour calculer la distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Rayon de la Terre en km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en km
}

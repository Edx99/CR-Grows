require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { CosmosClient } = require('@azure/cosmos');
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", authRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

// Middleware to parse incoming JSON payloads and serve static frontend files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// AZURE COSMOS DB INITIALIZATION
// ==========================================
const connectionString = process.env.MONGODB_URI;
const client = new CosmosClient(connectionString);

const databaseId = 'CRGrowsDB';
const containerId = 'Users';

let container;

async function initCosmos() {
    try {
        // Automatically creates the database and container if they do not exist
        const { database } = await client.databases.createIfNotExists({ id: databaseId });
        const { container: userContainer } = await database.containers.createIfNotExists({ 
            id: containerId,
            partitionKey: '/email' // Partitioning by email optimizes query performance
        });
        container = userContainer;
        console.log('Successfully connected to Azure Cosmos DB.');
    } catch (error) {
        console.error('Cosmos DB Initialization Error:', error);
    }
}
initCosmos();

// ==========================================
// AUTHENTICATION API ENDPOINTS
// ==========================================

// 1. USER REGISTRATION
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Check if user already exists in the database
        const { resources: existingUsers } = await container.items
            .query({
                query: 'SELECT * FROM c WHERE c.email = @email',
                parameters: [{ name: '@email', value: email }]
            })
            .fetchAll();

        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Securely hash the password before storage
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Construct the new user object
        const newUser = {
            username,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        // Save into Cosmos DB
        await container.items.create(newUser);
        return res.status(201).json({ message: 'User registered successfully.' });

    } catch (error) {
        console.error('Registration Error:', error);
        return res.status(500).json({ error: 'Internal server error during registration.' });
    }
});

// 2. USER LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Fetch user records matching the email
        const { resources: users } = await container.items
            .query({
                query: 'SELECT * FROM c WHERE c.email = @email',
                parameters: [{ name: '@email', value: email }]
            })
            .fetchAll();

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];

        // Validate password using bcrypt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Generate a secure JSON Web Token (JWT) valid for 2 hours
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        return res.status(200).json({ 
            message: 'Login successful.', 
            token, 
            user: { username: user.username, email: user.email } 
        });

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ error: 'Internal server error during login.' });
    }
});

// ==========================================
// SEVER EXECUTION
// ==========================================
app.listen(PORT, () => {
    console.log(`Application engine actively listening on port ${PORT}`);
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aquamind';

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, required: true },
    waterUsage: [{ date: Date, liters: Number }],
    createdAt: { type: Date, default: Date.now }
});

const highScoreSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

const communityPostSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const newsletterSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const HighScore = mongoose.model('HighScore', highScoreSchema);
const CommunityPost = mongoose.model('CommunityPost', communityPostSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);

// Authentication Middleware
const authenticateToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(decoded.userId);
        if (!req.user) return res.status(401).json({ error: 'Invalid token' });
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// API Routes
app.post('/api/register', [
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('username').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, username } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword, username });
        await user.save();

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token, username });
    } catch (error) {
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/login', [
    body('email').isEmail(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, username: user.username });
    } catch (error) {
        res.status(500).json({ error: 'Failed to login' });
    }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        res.json({
            email: req.user.email,
            username: req.user.username,
            waterUsage: req.user.waterUsage
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.post('/api/high-scores', authenticateToken, [
    body('score').isInt({ min: 0 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { score } = req.body;

    try {
        const highScore = new HighScore({ userId: req.user._id, score });
        await highScore.save();

        io.emit('newHighScore', {
            username: req.user.username,
            score,
            date: highScore.createdAt
        });

        res.json({ message: 'Score submitted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit score' });
    }
});

app.get('/api/high-scores', async (req, res) => {
    try {
        const highScores = await HighScore.find()
            .populate('userId', 'username')
            .sort({ score: -1 })
            .limit(10);
        res.json(highScores.map(score => ({
            username: score.userId.username,
            score: score.score,
            date: score.createdAt
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch high scores' });
    }
});

app.post('/api/calculate-water-cost', authenticateToken, [
    body('people').isInt({ min: 1 }),
    body('shower').isInt({ min: 0 }),
    body('dishes').isInt({ min: 0 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { people, shower, dishes } = req.body;

    const liters = (people * shower * 15) + (dishes * 20);
    const cost = liters * 0.005;

    req.user.waterUsage.push({ date: new Date(), liters });
    await req.user.save();

    res.json({
        liters,
        cost: cost.toFixed(2),
        message: `You use ${liters} liters/day, costing approximately ${cost.toFixed(2)} THB/day`
    });
});

app.post('/api/newsletter', [
    body('email').isEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;

    try {
        const existingSubscription = await Newsletter.findOne({ email });
        if (existingSubscription) return res.status(400).json({ error: 'Email already subscribed' });

        const subscription = new Newsletter({ email });
        await subscription.save();

        io.emit('newSubscription', { email });
        res.json({ message: 'Subscribed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

app.post('/api/community-posts', authenticateToken, [
    body('content').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { content } = req.body;

    try {
        const post = new CommunityPost({ userId: req.user._id, content });
        await post.save();

        io.emit('newCommunityPost', {
            id: post._id,
            username: req.user.username,
            content,
            createdAt: post.createdAt,
            likes: 0
        });

        res.json({ message: 'Post created successfully', post });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create post' });
    }
});

app.get('/api/community-posts', async (req, res) => {
    try {
        const posts = await CommunityPost.find()
            .populate('userId', 'username')
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(posts.map(post => ({
            id: post._id,
            username: post.userId.username,
            content: post.content,
            likes: post.likes.length,
            createdAt: post.createdAt
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

app.post('/api/community-posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const post = await CommunityPost.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const userId = req.user._id;
        if (post.likes.includes(userId)) {
            post.likes = post.likes.filter(id => id.toString() !== userId.toString());
        } else {
            post.likes.push(userId);
        }

        await post.save();

        io.emit('postLiked', { postId: post._id, likes: post.likes.length });
        res.json({ message: 'Like updated', likes: post.likes.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update like' });
    }
});

io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

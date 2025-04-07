const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const User = require('./models/modeluser');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

mongoose.connect('mongodb+srv://goplanidhir:Dhir1000@cluster1.cj3xb2t.mongodb.net/loginApp?retryWrites=true&w=majority&appName=Cluster1')
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.log("❌ MongoDB connection error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true
}));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

const client = new MongoClient('mongodb+srv://goplanidhir:Dhir1000@cluster1.cj3xb2t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1');
let db;

client.connect().then(() => {
  db = client.db('loginApp');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists!' });
    const newUser = new User({ username, password });
    await newUser.save();
    req.session.user = { id: newUser._id, username: newUser.username };
    res.status(200).json({ message: 'Registration successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed.' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && user.password === password) {
      req.session.user = { id: user._id, username: user.username };
      return res.status(200).json({ message: 'Login successful!' });
    } else {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Login failed.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('Logout failed');
    res.clearCookie('connect.sid');
    res.status(200).send('Logged out');
  });
});

app.get('/api/user', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const userData = await db.collection('users').findOne({ username: req.session.user.username });
  const selling = userData?.selling || [];
  res.json({
    username: req.session.user.username,
    bought: userData?.bought || 0,
    sold: userData?.sold || 0,
    selling
  });
});

app.post('/sell', upload.single('image'), async (req, res) => {
  if (!req.file || !req.body.price || !req.body.itemName || !req.body.description || !req.body.category) {
    return res.status(400).send('Missing fields');
  }
  const imagePath = req.file.filename;
  const price = parseInt(req.body.price);
  const itemName = req.body.itemName;
  const description = req.body.description;
  const category = req.body.category;
  const item = { username: req.session.user.username, imagePath, price, itemName, description, category };
  const result = await db.collection('items').insertOne(item);
  const fullItem = { ...item, _id: result.insertedId };
  await db.collection('users').updateOne(
    { username: req.session.user.username },
    { $push: { selling: fullItem }, $setOnInsert: { bought: 0, sold: 0 } },
    { upsert: true }
  );
  res.redirect('/sell.html?success=1');
});

app.delete('/cancel-sell/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  const username = req.session.user.username;
  await db.collection('items').deleteOne({ _id: new ObjectId(itemId), username });
  await db.collection('users').updateOne(
    { username },
    { $pull: { selling: { _id: new ObjectId(itemId) } } }
  );
  res.sendStatus(200);
});

app.get('/api/items', async (req, res) => {
  const items = await db.collection('items').find({}).toArray();
  res.json(items);
});

app.post('/buy/:itemId', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Not logged in');
  const itemId = new ObjectId(req.params.itemId);
  const buyerUsername = req.session.user.username;
  try {
    const item = await db.collection('items').findOne({ _id: itemId });
    if (!item) return res.status(404).send('Item not found');
    if (item.username === buyerUsername) return res.status(403).send('Cannot buy your own item');
    const result = await db.collection('items').deleteOne({ _id: itemId });
    if (result.deletedCount === 0) return res.status(400).send("Item already sold or doesn't exist.");
    await db.collection('users').updateOne(
      { username: item.username },
      { $pull: { selling: { _id: itemId } }, $inc: { sold: 1 } }
    );
    await db.collection('users').updateOne(
      { username: buyerUsername },
      { $inc: { bought: 1 } },
      { upsert: true }
    );
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error processing purchase');
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

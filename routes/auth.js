const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// Show register form
router.get('/register', (req, res) => {
  res.render('register');
});

// Handle register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  try {
    await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, hashed]
    );
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    res.send('Error registering');
  }
});

// Show login form
router.get('/login', (req, res) => {
  res.render('login');
});

// Handle login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) return res.send('Invalid credentials');

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.send('Invalid credentials');

    req.session.user = { id: user.id, email: user.email };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('Error logging in');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;

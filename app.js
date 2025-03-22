require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { ensureAuth } = require('./middleware/auth');
const db = require('./db');


// Routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
}));

// Route mounting
app.use('/auth', authRoutes);
app.use('/files', fileRoutes);




app.get('/dashboard', ensureAuth, async (req, res) => {
  try {
    const stores = await db.query('SELECT * FROM stores ORDER BY id DESC');
    res.render('dashboard', { user: req.session.user, stores: stores.rows });
  } catch (err) {
    console.error(err);
    res.send('Error loading dashboard');
  }
});

app.use(express.static('public')); // Serve all files in /public folder

// For subdomain requests like studyfitnotes.norulesvpn.com
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/download.html'));
});



app.get('*', async (req, res, next) => {
  try {
    const host = req.headers.host?.toLowerCase().replace(/^www\./, '');

    // Check if domain matches any custom store
    const result = await db.query('SELECT * FROM stores WHERE custom_domain = $1', [host]);
    const store = result.rows[0];

    if (!store) return res.status(404).send('Store not found for this domain');

    // Get files for this domain
    const files = await db.query(
      'SELECT * FROM files WHERE store_id = $1 ORDER BY uploaded_at DESC',
      [store.id]
    );

    // Render simple page
    let html = `<h2>Files for ${store.store_name}</h2><ul>`;
    files.rows.forEach(file => {
      const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.file_key}`;
      html += `<li>${file.file_name} - <a href="${fileUrl}" target="_blank">Download</a></li>`;
    });
    html += '</ul>';

    res.send(html);
  } catch (err) {
    console.error('Error serving custom domain:', err);
    res.status(500).send('Something went wrong');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

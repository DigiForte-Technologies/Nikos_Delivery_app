const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3-v3');
const s3 = require('../utils/s3');
const db = require('../db');
const { ensureAuth } = require('../middleware/auth');

// Setup multer for AWS SDK v3
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    key: async (req, file, cb) => {
      // Get store info from DB using storeId
      const storeId = req.params.storeId;
      const result = await db.query('SELECT * FROM stores WHERE id = $1', [storeId]);
      const store = result.rows[0];

      const folder = store.custom_domain.replace(/^https?:\/\//, '').replace(/\//g, ''); // clean domain
      const filename = `${folder}/${Date.now()}-${file.originalname}`;
      cb(null, filename);
    }
  }),
});


// GET: View files for a specific store
router.get('/:storeId', ensureAuth, async (req, res) => {
  const { storeId } = req.params;

  const storeRes = await db.query('SELECT * FROM stores WHERE id = $1', [storeId]);
  const store = storeRes.rows[0];

  const filesRes = await db.query('SELECT * FROM files WHERE store_id = $1 ORDER BY uploaded_at DESC', [storeId]);

  res.render('store-files', {
    store,
    files: filesRes.rows,
  });
});

// POST: Upload a file to a specific store
router.post('/upload/:storeId', ensureAuth, upload.single('file'), async (req, res) => {
  const { storeId } = req.params;
  const file = req.file;

  try {
    await db.query(
      `INSERT INTO files (store_id, file_name, file_key, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        storeId,
        file.originalname,
        file.key,
        file.size,
        file.mimetype
      ]
    );

    res.redirect(`/files/${storeId}`);
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).send('Error uploading file');
  }
});

// POST: Add a new store/domain
router.post('/add-store', ensureAuth, async (req, res) => {
  const { store_name, custom_domain } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO stores (user_id, store_name, custom_domain) VALUES (1, $1, $2) RETURNING *`,
      [store_name, custom_domain]
    );

    // Optionally create a folder in S3 (not required by S3, but keeps UI expectations)
    const folderKey = `${custom_domain}/`;
    await s3.send({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: folderKey,
      Body: '',
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('Error adding store');
  }
});

// GET: Preview a file
router.get('/preview/:id', ensureAuth, async (req, res) => {
  const result = await db.query('SELECT * FROM files WHERE id = $1', [req.params.id]);
  const file = result.rows[0];

  const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.file_key}`;

  if (file.mime_type.startsWith('image') || file.mime_type === 'application/pdf' || file.mime_type.startsWith('video')) {
    res.send(`
      <h2>Preview: ${file.file_name}</h2>
      <iframe src="${fileUrl}" width="100%" height="600px"></iframe>
      <p><a href="${fileUrl}" download>Download</a></p>
    `);
  } else {
    res.redirect(fileUrl);
  }
});

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Use memory storage to process uploads without saving locally indefinitely
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Serve static files
app.use(express.static(__dirname));

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload endpoint
app.post('/xenoUpload.php', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.file;
        const deleteKey = req.body.deleteKey || crypto.randomBytes(8).toString('hex');

        // Push file to an actual public CDN (Catbox API)
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('userhash', ''); // Anonymous upload
        form.append('fileToUpload', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
        });

        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        // Catbox returns the raw URL containing the file hash (e.g. https://files.catbox.moe/1234.jpg)
        const publicUrl = response.data;
        const catboxFilename = publicUrl.split('/').pop();

        // Wrap the real link in our custom tracker namespace 'xenocdn' and serve it using express
        const fileUrl = `${req.protocol}://${req.get('host')}/xenocdn/${catboxFilename}`;

        res.json({
            success: true,
            size: formatFileSize(file.size),
            name: file.originalname,
            path: `/xenocdn/${catboxFilename}`,
            url: fileUrl,
            deleteKey: deleteKey,
            expiry: 'PERMANENT'
        });
    } catch (error) {
        console.error('Error during online proxy upload:', error.message);
        res.status(500).json({ error: 'Server error during secure node stream' });
    }
});

// Proxy route for 'xenocdn' to load images from the public CDN transparently
app.get('/xenocdn/:filename', async (req, res) => {
    const filename = req.params.filename;
    res.redirect(`https://files.catbox.moe/${filename}`);
});

// Fallback route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

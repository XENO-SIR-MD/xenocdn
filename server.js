const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

const os = require('os');

// Set up local storage in the system temp directory (read-only filesystem bypass for Vercel)
const uploadDir = os.tmpdir();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max limit
});

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.post('/xenoUpload.php', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'NO PAYLOAD DETECTED' });
        }

        const { originalname, size, path: filePath } = req.file;

        // Use Catbox.moe as the CDN backend, as proxying is standard for these replicate CDNs
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', fs.createReadStream(filePath), {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            knownLength: req.file.size
        });

        const catboxResponse = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        const finalUrl = catboxResponse.data.trim();

        // Cleanup local file after upload
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({
            name: originalname,
            size: formatSize(size),
            path: `cdn-nodes/${originalname}`, 
            url: finalUrl
        });
    } catch (error) {
        let errorReason = error.message;
        if (error.response && error.response.data) {
            errorReason = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
        }
        console.error('Transmission error:', errorReason);
        
        // Cleanup on failure
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: `CDN NODE ERROR: ${errorReason}` });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`[ XENO SIR PROTOCOL ACTIVE ] - Server running on port ${PORT}`);
    });
}

module.exports = app;

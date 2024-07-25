const express = require('express');
const multer = require('multer');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const vosk = require('vosk');
const wav = require('wav');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 3000;

const MODEL_PATH = "models/vosk-model-small-en-us-0.15";
const SAMPLE_RATE = 16000;
const OUTPUT_DIR = 'converted_files';

if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Please download the model from https://alphacephei.com/vosk/models and unpack as ${MODEL_PATH} in the current folder.`);
    process.exit(1);
}

vosk.setLogLevel(-1);
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

function convertAudio(inputFile, outputFile, callback) {
    ffmpeg(inputFile)
        .audioChannels(1)
        .audioFrequency(SAMPLE_RATE)
        .audioCodec('pcm_s16le')
        .toFormat('wav')
        .on('end', () => {
            callback(null, outputFile);
        })
        .on('error', (err) => {
            callback(err);
        })
        .save(outputFile);
}

/**
 * @swagger
 * components:
 *   schemas:
 *     TranscriptionResult:
 *       type: object
 *       properties:
 *         text:
 *           type: string
 *
 * /transcribe:
 *   post:
 *     summary: Transcribe an audio file to text
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: The audio file to transcribe
 *     responses:
 *       200:
 *         description: The transcription result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TranscriptionResult'
 *       400:
 *         description: Invalid file format
 *       500:
 *         description: Failed to convert or process the audio file
 */
app.post('/transcribe', upload.single('audio'), (req, res) => {
    const inputFile = req.file.path;
    const outputFile = path.join(OUTPUT_DIR, `${Date.now()}-converted.wav`);

    convertAudio(inputFile, outputFile, (err, outputFilePath) => {
        if (err) {
            console.error('Failed to convert audio file:', err);
            fs.unlinkSync(inputFile);
            return res.status(500).send('Failed to convert audio file.');
        }

        const file = fs.createReadStream(outputFilePath);
        const reader = new wav.Reader();

        let finalResult = '';

        reader.on('format', function (format) {
            if (format.audioFormat !== 1 || format.sampleRate !== SAMPLE_RATE || format.channels !== 1) {
                console.error("Invalid WAV file format. Must be 16-bit PCM, mono, 16kHz.");
                fs.unlinkSync(inputFile);
                fs.unlinkSync(outputFilePath);
                return res.status(400).send("Invalid WAV file format. Must be 16-bit PCM, mono, 16kHz.");
            }
        });

        reader.on('data', function (data) {
            rec.acceptWaveform(data);
        });

        reader.on('end', function () {
            finalResult += rec.finalResult().text;
            rec.free();
            model.free();
            fs.unlinkSync(inputFile); // Clean up uploaded file
            fs.unlinkSync(outputFilePath); // Clean up converted file
            res.json({ text: finalResult });
        });

        file.pipe(reader);
    });
});

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'XIDNAAudio Transcription API',
            version: '1.0.0',
            description: 'API for transcribing audio files to text using XIDNA AI',
        },
    },
    apis: ['./app.js'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

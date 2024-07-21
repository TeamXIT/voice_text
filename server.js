const fs = require('fs');
const vosk = require('vosk');
const wav = require('wav');

const MODEL_PATH = "models/vosk-model-small-en-us-0.15";
const SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Please download the model from https://alphacephei.com/vosk/models and unpack as ${MODEL_PATH} in the current folder.`);
    process.exit(1);
}

vosk.setLogLevel(-1);
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

// Read the WAV file using the 'wav' module to ensure correct format
const file = fs.createReadStream('./arctic_a0024_converted.wav');
const reader = new wav.Reader();

reader.on('format', function (format) {
    if (format.audioFormat !== 1 || format.sampleRate !== SAMPLE_RATE || format.channels !== 1) {
        console.error("Invalid WAV file format. Must be 16-bit PCM, mono, 16kHz.");
        process.exit(1);
    }
});

reader.on('data', function (data) {
    rec.acceptWaveform(data);
});

reader.on('end', function () {
    console.log(rec.finalResult());
    rec.free();
    model.free();
});

file.pipe(reader);

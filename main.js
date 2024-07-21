const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const vosk = require('vosk');
const wav = require('wav');

const MODEL_PATH = "models/vosk-model-small-en-us-0.15";
const SAMPLE_RATE = 16000;
const INPUT_FILE = './demodon.wav'; // Change to your input file
const OUTPUT_FILE = './converted.wav';

if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Please download the model from https://alphacephei.com/vosk/models and unpack as ${MODEL_PATH} in the current folder.`);
    process.exit(1);
}

vosk.setLogLevel(-1);
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

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

convertAudio(INPUT_FILE, OUTPUT_FILE, (err, outputFilePath) => {
    if (err) {
        console.error('Failed to convert audio file:', err);
        process.exit(1);
    }

    // Read the converted WAV file using the 'wav' module to ensure correct format
    const file = fs.createReadStream(outputFilePath);
    const reader = new wav.Reader();

    let finalResult = '';

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
        finalResult += rec.finalResult().text;
        console.log(finalResult);
        rec.free();
        model.free();
    });

    file.pipe(reader);
});

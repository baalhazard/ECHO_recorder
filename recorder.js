// Kontrollera om webbläsaren stöder nödvändiga API:er
if (!navigator.mediaDevices || !window.AudioContext) {
    alert("Din webbläsare stöder inte nödvändiga API:er för att spela in ljud.");
}

let audioContext, mediaRecorder, audioChunks = [];

// Hämta knappar och status-element
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const downloadButton = document.getElementById("download");
const statusElement = document.getElementById("status");

// Koppla händelser till knappar
startButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);

// Starta ljudinspelning
async function startRecording() {
    try {
        updateStatus("Förbereder inspelning...");
        
        // Be om åtkomst till mikrofonen
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();

        // Skapa en AudioNode från streamen
        const source = audioContext.createMediaStreamSource(stream);

        // Skapa ett bandpassfilter
        const bandpassFilter = audioContext.createBiquadFilter();
        bandpassFilter.type = "bandpass";
        bandpassFilter.frequency.value = 2000; // Central frekvens
        bandpassFilter.Q = 1.0; // Kvalitetsfaktor (bandbredd)

        // Koppla filter och ljudkälla
        source.connect(bandpassFilter);
        bandpassFilter.connect(audioContext.destination);

        // Skapa MediaRecorder för att spela in ljud
        mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            updateStatus("Bearbetar ljud...");
            
            // Kombinera ljudklippen
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            audioChunks = [];

            // Konvertera till WAV
            try {
                const wavBlob = await convertToWav(audioBlob);
                setupDownloadButton(wavBlob, "filtered_audio.wav");
                updateStatus("Inspelning klar! Klicka på nedladdningsknappen.");
            } catch (error) {
                console.error("Fel vid WAV-konvertering:", error);
                updateStatus("Fel uppstod vid bearbetning av ljudet.");
            }
        };

        mediaRecorder.start();
        updateStatus("Inspelning startad...");
    } catch (error) {
        console.error("Fel vid inspelning:", error);
        updateStatus("Fel: kunde inte starta inspelningen.");
    }
}

// Stoppa ljudinspelning
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        updateStatus("Inspelning stoppad. Vänta medan filen bearbetas...");
    }
}

// Konvertera WebM till WAV
async function convertToWav(audioBlob) {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const sampleRate = 16000; // 16 kbps
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * (sampleRate / audioBuffer.sampleRate);

    // Skapa en ny ljudbuffer med rätt inställningar
    const offlineContext = new OfflineAudioContext(numChannels, length, sampleRate);
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;

    // Koppla in filtret igen
    const bandpassFilter = offlineContext.createBiquadFilter();
    bandpassFilter.type = "bandpass";
    bandpassFilter.frequency.value = 2000;
    bandpassFilter.Q = 1.0;

    bufferSource.connect(bandpassFilter);
    bandpassFilter.connect(offlineContext.destination);

    // Rendera och exportera
    bufferSource.start(0);
    const renderedBuffer = await offlineContext.startRendering();

    // Skapa WAV-fil
    return audioBufferToWav(renderedBuffer);
}

// Konvertera AudioBuffer till WAV
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const wav = new ArrayBuffer(length);
    const view = new DataView(wav);

    // Skapa WAV-header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + buffer.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, buffer.length * numChannels * 2, true);

    // Skriv ljuddata
    const interleaved = interleave(buffer);
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++, offset += 2) {
        view.setInt16(offset, interleaved[i] * 0x7fff, true);
    }

    return new Blob([view], { type: "audio/wav" });
}

function interleave(buffer) {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length * numChannels;
    const result = new Float32Array(length);

    let offset = 0;
    for (let i = 0; i < buffer.length; i++) {
        for (let j = 0; j < numChannels; j++) {
            result[offset++] = buffer.getChannelData(j)[i];
        }
    }
    return result;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Uppdatera statusmeddelande
function updateStatus(message) {
    statusElement.textContent = message;
}

// Ställ in nedladdningsknappen
function setupDownloadButton(blob, filename) {
    downloadButton.style.display = "inline-block";
    downloadButton.href = URL.createObjectURL(blob);
    downloadButton.download = filename;
    downloadButton.textContent = "Ladda ner inspelad fil";
}

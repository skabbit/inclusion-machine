/* face-api.js face detector with age and gender */

// SsdMobilenetv1Options works slower, but much better
let optionsTinyFace = new faceapi.TinyFaceDetectorOptions({
    // inputSize: 640,
    scoreThreshold: 0.2 })
let optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({
    minConfidence: 0.2,
    maxResults: 10 });

async function calculateFaces(webcamCanvas) {
    let results;
    // compute face landmarks to align faces for better accuracy
    results = await faceapi.detectAllFaces(webcamCanvas, optionsSSDMobileNet)
        .withFaceLandmarks()
        .withAgeAndGender()

    faces = await faceapi.resizeResults(results, canvas_el)
}

async function faceapiInit() {
    // await faceapi.tf.setBackend('webgpu');
    // // or
    // await faceapi.tf.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.20.0/wasm-out/')
    // await faceapi.tf.setBackend('wasm');

    let loadpath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'
    if (typeof NOINTERNET !== 'undefined' && NOINTERNET) {
        console.log('NOINTERNET')
        loadpath = '/npm/vladmandic'
    }
    await faceapi.nets.tinyFaceDetector.load(loadpath)
    await faceapi.nets.ssdMobilenetv1.load(loadpath)
    await faceapi.nets.ageGenderNet.load(loadpath)
    await faceapi.loadFaceLandmarkModel(loadpath)
}
// configuration variables
let DEBUG = false;
let LOW_QUALITY = false;
let SHOW_INFO = false;
// draw full canvas with webcam data, or draw only masked parts on top of the webcam video element
let USE_WEBCAM_CANVAS = true;
let USE_BUFFER = true;
let MIN_MATCH_PROPORTION = 0.2;


if (typeof NOINTERNET !== 'undefined' && NOINTERNET) {
    // Handle no internet connection
} else if (window.location.href.includes('localhost')) {
    DEBUG = true;
    LOW_QUALITY = true;
    SHOW_INFO = true;
}

const ageMap = {
    'child': [0, 18],
    'teen': [18, 30],
    'adult': [30, 65],
    'senior': [65, 200]
}

// cached elements
const webcam = document.getElementById("webcam")
webcam.autoplay = true;
const canvas = $('#canvas')
const canvas_el = canvas.get(0)
const canvasCtx = canvas_el.getContext('2d', { willReadFrequently: true })
const initialFrame = document.createElement('canvas');
const initialCtx = initialFrame.getContext('2d', { willReadFrequently: true })
const initialFrameDelayed = document.createElement('canvas');
const initialCtxDelayed = initialFrame.getContext('2d', { willReadFrequently: true })
const webcamCanvas = document.createElement('canvas');
const webcamCtx = webcamCanvas.getContext('2d', { willReadFrequently: true })
let backgroundFrameInitialized = false;

// Define constraints for the video resolution
let webcamConstraints = {
    video: {
        width: { ideal: 1280 }, // Ideal width in pixels
        height: { ideal: 720 }  // Ideal height in pixels
    }
};
if (LOW_QUALITY) {
    webcamConstraints = {
        video: {
            width: { ideal: 640 }, // Ideal width in pixels
            height: { ideal: 480 }  // Ideal height in pixels
        }
    };
}

// control variables
let people = []; // segmentation results from bodypix
let faces = []; // faces with resized boxes to fit video element (most probably 640x480)
let peopleBuffer = []; // segmentation results from bodypix
let facesBuffer = []; // faces with resized boxes to fit video element (most probably 640x480)
let initialFrameData;
let previousFrameTime;
let stopRequested = false;
let initialized = false;
const opacity = 1;
const flipHorizontal = false;
let lastTimePerson = new Date(2020, 1, 1); // far past
let noPerson = true;
let checkedCategories = [];

// performance measures
let performanceTimes = {};

// segmentation configuration
let segmentationConfig;
let segmenterConfig;
if (LOW_QUALITY) {
    segmentationConfig = {
        multiSegmentation: true,
        segmentBodyParts: false,
        flipHorizontal: false,
        maxDetections: 5,
        scoreThreshold: 0.2,
        nmsRadius: 20,
        internalResolution: 'low',
    };
    segmenterConfig = {
        architecture: "MobileNetV1",
        outputStride: 8,
        multiplier: 0.5,
        quantBytes: 1,
    };
} else {
    segmentationConfig = {
        multiSegmentation: true,
        segmentBodyParts: false,
        flipHorizontal: false,
        maxDetections: 10,
        scoreThreshold: 0.05,
        nmsRadius: 20,
        internalResolution: 'full',
        refineSteps: 5,
    };
    segmenterConfig = {
        architecture: "ResNet50",
        outputStride: 16,
        multiplier: 1,
        quantBytes: 4,
    };
}

// audio setup
const mp3_filenames = ['welcome'];
for (const age of Object.keys(ageMap)) {
    for (const gender of ['male', 'female']) {
        for (const turn of ['off', 'on']) {
            mp3_filenames.push(turn + '-' + gender + '-' + age);
        }
    }
}
let audio_files = {}
let postfix = ''
if (LANGUAGE == 'eng') {
    postfix = '-en'
}
for (let i = 0; i < mp3_filenames.length; i++) {
    audio_files[mp3_filenames[i]] = new Audio('mp3/' + mp3_filenames[i] + postfix + '.mp3');
}
let lastTimeAudioPlayed = new Date(2020, 1, 1); // far past


if (DEBUG) {
    //// video file for debug:
    //// debug.mp4: one photo of multiple races
    //// debug2.mp4: superslow on my computer because of the resolution
    //// debug2_640x480.mp4: 640x480 resolution for faster processing
    // $('#fullscreen').append('<video id="video" autoplay muted loop><source src="debug.mp4" type="video/mp4"></video>')
    webcam.src = 'gray-cake-1.mov';
    webcam.loop = true;
    webcam.play();
    webcam.onloadedmetadata = () => {
        setInitialPositions();
        setInitialFrame();
        initialized = true;
    };
} else {
    // capture webcam frame
    navigator.mediaDevices.getUserMedia(webcamConstraints).then(stream => {
        webcam.srcObject = stream;
        webcam.onloadedmetadata = () => {
            console.log(`Actual video dimensions: ${webcam.videoWidth}x${webcam.videoHeight}`);
            setInitialPositions();
            setInitialFrame();
            initialized = true;
        };
    }).catch(error => {
        console.error('Error accessing webcam: ', error);
        $('#results').html('Error accessing webcam: ' + error);
    });;
}

function setInitialPositions() {
    // get video resolution
    let videoWidth = webcam.videoWidth;
    let videoHeight = webcam.videoHeight;

    // set initial frame size to video resolution
    initialFrame.width = videoWidth
    initialFrame.height = videoHeight
    webcamCanvas.width = videoWidth
    webcamCanvas.height = videoHeight
    initialFrameDelayed.width = videoWidth
    initialFrameDelayed.height = videoHeight
    console.log("initialFrame", initialFrame.width, initialFrame.height)

    // set canvas width and left position to fit the video position on the fullscreen
    const fullscreen = $('#fullscreen')
    // set internal canvas resolution to webcam size
    canvas_el.width = webcam.videoWidth
    canvas_el.height = webcam.videoHeight

    // but real canvas size to fullscreen size
    canvas.width(fullscreen.height() * videoWidth / videoHeight)
    canvas.height(fullscreen.height())
    // set left position to center the videobox
    canvas.css('left', (fullscreen.width() - canvas.width()) / 2)
}

function setInitialFrame() {
    initialCtx.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
    initialFrameData = initialCtx.getImageData(0, 0, initialFrame.width, initialFrame.height);
}

async function updateResults() {
    let timeStart;
    if (!initialized) {
        console.log("not initialized")
        setTimeout(updateResults, 1000)
        return
    }

    if (Date.now() - lastTimeAudioPlayed > 20000) {
        audio_files['welcome'].play();
        lastTimeAudioPlayed = Date.now();
    }

    // put webcam frame to the canvas
    timeStart = performance.now();
    webcamCtx.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
    var webcamData = webcamCtx.getImageData(0, 0, webcam.videoWidth, webcam.videoHeight);
    performanceTimes['webcamCtx.drawImage'] = performance.now() - timeStart
    
    timeStart = performance.now();
    try {
        await calculateFaces(webcamCanvas)
    } catch (error) {
        console.error('Error calculating faces: ', error);
        $('#results').html('Error calculating faces: ' + error);
        window.requestAnimationFrame(updateResults);
        return
    }
    performanceTimes['calculateFaces'] = performance.now() - timeStart

    timeStart = performance.now();
    people = await segmenter.segmentPeople(webcamCanvas, segmentationConfig)
    performanceTimes['segmenter.segmentPeople'] = performance.now() - timeStart

    // reset initial frame if there are no people found for a long time (5 seconds)
    if (people.length == 0) {
        if (Date.now() - lastTimePerson > 3000) {
            console.log('updating initial frame with empty space')
            initialCtx.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
            initialFrameData = initialCtx.getImageData(0, 0, initialFrame.width, initialFrame.height);
            initialCtxDelayed.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
            lastTimePerson = Date.now()
            noPerson = true;
            backgroundFrameInitialized = true;
            if ($('.alert').length == 1) {
                $('.alert').remove();
            }
        }
    } else {
        if (backgroundFrameInitialized == false) {
            if (USE_WEBCAM_CANVAS) {
                canvasCtx.putImageData(
                    webcamData,
                    0, 0,
                    0, 0, canvas_el.width, canvas_el.height);
            }

            // show message box that no people should be on a screen
            if ($('.alert').length == 0) {
                $('#results').html('<div class="alert alert-danger" role="alert" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; min-width: 300px; text-align: center;">To initialize Inclusion Machine<br>No people should be on a screen</div>');
            }
            window.requestAnimationFrame(updateResults);
            return
        }
        lastTimePerson = Date.now()
        // if (noPerson) {
        //     audio_files['welcome'].play();
        //     noPerson = false;
        // }
    }

    // check buffer and compare with current
    if (USE_BUFFER) {
        newFaces = faces
        for (let i = 0; i < newFaces.length; i++) {
            newFace = newFaces[i]
            newFace.bufferProb = 0
            newFace.framesWithoutMatch = 0
            newFace.bufferFace = null
            newFace.ageList = [newFace.age]
            newFace.genderList = [newFace.gender]
            newFace.segmentation = null
            let box1 = newFace.detection.box
            for (let j = 0; j < facesBuffer.length; j++) {
                let box2 = facesBuffer[j].detection.box
                // count how many pixels overlap
                let overlap = Math.max(0, Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x)) *
                    Math.max(0, Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y))
                let proportion = overlap / (box1.width * box1.height)
                if (proportion > MIN_MATCH_PROPORTION && proportion > newFace.bufferProb) {
                    newFace.bufferProb = proportion
                    newFace.bufferFace = facesBuffer[j]
                    facesBuffer[j].newFace = newFace
                }
            }
            if (newFace.bufferFace) {
                // concatenate age list and set average age
                newFace.ageList = newFace.ageList.concat(newFace.bufferFace.ageList)
                newFace.age = newFace.ageList.reduce((a, b) => a + b, 0) / newFace.ageList.length
                newFace.genderList = newFace.genderList.concat(newFace.bufferFace.genderList)
                // set most frequent gender from the list
                newFace.gender = newFace.genderList.reduce((a, b, i, arr) =>
                    (arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b), null)
            }
        }
        // all faces = newFaces + facesBuffer without newFace set if 
        allFaces = newFaces
        for (let i = 0; i < facesBuffer.length; i++) {
            if (!facesBuffer[i].newFace && facesBuffer[i].framesWithoutMatch < 5) {
                facesBuffer[i].framesWithoutMatch++;
                allFaces.push(facesBuffer[i])
            }
        }
    } else {
        allFaces = faces
    }

    // clear drawing context
    timeStart = performance.now();
    canvasCtx.clearRect(0, 0, canvas_el.width, canvas_el.height);
    performanceTimes['canvasCtx.clearRect'] = performance.now() - timeStart

    var data = initialFrameData.data;

    // loop through faces list
    timeStart = performance.now();
    for (let j = 0; j < allFaces.length; j++) {
        let face = allFaces[j]
        face.prob = 0
        let box = face.detection.box
        let { x, y, width, height } = box
        // round the box coordinates to integers
        x = Math.round(x)
        y = Math.round(y)
        width = Math.round(width)
        height = Math.round(height)

        // loop through people segmentation to match the face box with the person mask
        for (let i = 0; i < people.length; i++) {
            const person = people[i]
            const imageData = person.mask.mask

            // count all pixels having alpha channel non zero in the imageData
            // but only for x, y, width, height of the box
            let count = 0
            for (let i = x; i < x + width; i++) {
                for (let j = y; j < y + height; j++) {
                    let address = (i + j * imageData.width) * 4 + 3
                    if (imageData.data[address] > 0) {
                        count++
                    }
                }
            }
            prob = count / (width * height)
            if (prob > 0.2) {
                if (prob > face.prob) {
                    face.segmentation = person
                    face.prob = prob
                }
            }
        }

        if (face.segmentation === null) {
            // if there is no segmentation mask for the face, set from the buffer
            face.segmentation = face.bufferFace ? face.bufferFace.segmentation : null
        }

        // do we need to exclude the person from the image
        let drawBool = (face.segmentation !== null) && isCategoryExcluded(face.gender, face.age);

        if (drawBool) {
            const segmentData = face.segmentation.mask.mask.data;
            const foregroundColor = { r: 255, g: 255, b: 255, a: 255 };
            const backgroundColor = { r: 0, g: 0, b: 0, a: 0 };

            // instead of drawMask we copy pixel by pixel the initial frame for masked pixels
            let coloredPartImage = await bodySegmentation.toBinaryMask(face.segmentation, foregroundColor, backgroundColor);
            let bufferedPartImage = null;
            // use previous frame to smooth segmentation artefacts
            if (face.bufferFace && face.bufferFace.segmentation)
                bufferedPartImage = await bodySegmentation.toBinaryMask(face.bufferFace.segmentation, foregroundColor, backgroundColor);

            for (let i = 0; i < segmentData.length; i += 4) {
                let count = 0;
                let steps = 10;
                count += coloredPartImage.data[i + 3] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 - coloredPartImage.width * 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 + coloredPartImage.width * 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 + 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 - 4 * steps] > 0 ? 1 : 0;

                // count previous frame to smooth segmentation artefacts
                if (bufferedPartImage) {
                    count += bufferedPartImage.data[i + 3] > 0 ? 1 : 0;
                    count += bufferedPartImage.data[i + 3 - bufferedPartImage.width * 4 * steps] > 0 ? 1 : 0;
                    count += bufferedPartImage.data[i + 3 + bufferedPartImage.width * 4 * steps] > 0 ? 1 : 0;
                    count += bufferedPartImage.data[i + 3 + 4 * steps] > 0 ? 1 : 0;
                    count += bufferedPartImage.data[i + 3 - 4 * steps] > 0 ? 1 : 0;
                }

                if (count !== 0) {
                    if (USE_WEBCAM_CANVAS) {
                        webcamData.data[i] = data[i];     // red
                        webcamData.data[i + 1] = data[i + 1]; // green
                        webcamData.data[i + 2] = data[i + 2]; // blue
                        webcamData.data[i + 3] = data[i + 3]; // alpha
                    } else {
                        coloredPartImage.data[i] = data[i];     // red
                        coloredPartImage.data[i + 1] = data[i + 1]; // green
                        coloredPartImage.data[i + 2] = data[i + 2]; // blue
                        coloredPartImage.data[i + 3] = data[i + 3]; // alpha
                    }
                } else {
                    if (!USE_WEBCAM_CANVAS) {
                        // transparent
                        coloredPartImage.data[i] = 0;
                        coloredPartImage.data[i + 1] = 0;
                        coloredPartImage.data[i + 2] = 0;
                        coloredPartImage.data[i + 3] = 0;
                    }
                }
            }
            // draw each person mask on the empty canvas
            if (!USE_WEBCAM_CANVAS) {
                canvasCtx.putImageData(
                    coloredPartImage,
                    0, 0,
                    0, 0, canvas_el.width, canvas_el.height);
            }
        }
    }
    performanceTimes['exclude people'] = performance.now() - timeStart

    timeStart = performance.now();
    if (USE_WEBCAM_CANVAS) {
        canvasCtx.putImageData(
            webcamData,
            0, 0,
            0, 0, canvas_el.width, canvas_el.height);
    }
    performanceTimes['draw webcam canvas'] = performance.now() - timeStart

    if (window.calcRace === undefined) {
        // console.log("calcRace is undefined")
    } else {
        await calcRace()
    }
    // await boxesDraw()

    // if (DEBUG) stopRequested = true

    if (!stopRequested) {
        // setTimeout(updateResults, 10)
        facesBuffer = faces;
        window.requestAnimationFrame(updateResults);
        // count fps from the last run of the function
        if (previousFrameTime) {
            // put fps info the results div
            // console.log('fps', 1000 / (Date.now() - lastTime))
            text = '<b>fps</b>: ' + 1000 / (Date.now() - previousFrameTime)
            text += '<br><b>persons</b>: ' + facesBuffer.length
            // add performance times results
            text += '<br><b>performance times:</b> <br>';
            for (const [key, value] of Object.entries(performanceTimes)) {
                text += key + ': ' + value.toFixed(2) + 'ms <br>'
            }
            if (SHOW_INFO)
                $('#results').html(text)
        }
        previousFrameTime = Date.now()
    }
}

let segmenter;

async function run() {
    // load face detection and age and gender recognition models
    // and load face landmark model for face alignment
    // await tf.setBackend('wasm')
    await faceapiInit()
    if (window.loadRaceModels === undefined) {
        console.log("loadRaceModels is undefined")
    } else {
        await loadRaceModels()
    }

    /* BodyPix segmenter */
    await loadSegmenter()

    // start processing
    updateCheckedCategories();
    updateResults();
}

async function loadSegmenter() {
    const model = bodySegmentation.SupportedModels.BodyPix;
    segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
}

async function boxesDraw() {
    for (let i = 0; i < faces.length; i++) {
        const result_resized = faces[i]
        drawBox(canvas, result_resized, true)
    }
}

function drawBox(canvas, result_resized, withScore = false) {
    box = result_resized.detection.box
    let { x, y, width, height } = box

    const ctx = canvas_el.getContext('2d')
    ctx.beginPath()
    ctx.rect(x, y, width, height)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'red'
    ctx.stroke()

    if (!result_resized.prob)
        result_resized.prob = 0.0

    if (withScore) {
        const text = result_resized.gender + ', '
            + result_resized.race + ', '
            + result_resized.age.toFixed(0) + ' years, score: '
            + result_resized.prob.toFixed(2);
        const { width, actualBoundingBoxAscent, actualBoundingBoxDescent } = ctx.measureText(text)
        ctx.fillStyle = 'red'
        ctx.fillRect(x, y, width + 4, actualBoundingBoxAscent + actualBoundingBoxDescent)
        ctx.fillStyle = 'white'
        ctx.fillText(text, x, y + actualBoundingBoxAscent)
    }
}

function stopAll() {
    stopRequested = true;
}

function isCategoryExcluded(gender, age) {
    let result = false;
    for (let i = 0; i < checkedCategories.length; i++) {
        let category = checkedCategories[i]
        let [genderCategory, ageCategory] = category.split('-')
        let ageMin = ageMap[ageCategory][0]
        let ageMax = ageMap[ageCategory][1]
        if (genderCategory == gender && age >= ageMin && age < ageMax) {
            result = true;
            break;
        }
    }
    return result;
}

function updateCheckedCategories() {
    checkedCategories = []
    $('input[name=category]:checked').each(function () {
        checkedCategories.push($(this).val())
    });
    console.log('checkedCategories=', checkedCategories);
}

$(document).ready(function () {
    run();
    $('#navbar-bootstrap .btn-check').click(function () {
        updateCheckedCategories();
        var value = $(this).attr('value');
        var checked = $(this).prop('checked') ? 'off' : 'on';
        value = checked + '-' + value
        audio_files[value].play();
        lastTimeAudioPlayed = Date.now();
    });

    /* if escape key pressed then stop */
    $(document).keyup(function (e) {
        if (e.key === "Escape") {
            stopAll();
        }
    });
})


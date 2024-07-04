// configuration variables
const DEBUG = false;
const LOW_QUALITY = false;
// draw full canvas with webcam data, or draw only masked parts on top of the webcam video element
const USE_WEBCAM_CANVAS = true;
const USE_BUFFER = true;
const MIN_MATCH_PROPORTION = 0.2;

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
const webcamFrame = document.createElement('canvas');
const webcamCtx = webcamFrame.getContext('2d', { willReadFrequently: true })

// Define constraints for the video resolution
const webcamConstraints = {
    video: {
        width: { ideal: 1280 }, // Ideal width in pixels
        height: { ideal: 720 }  // Ideal height in pixels
    }
};

// control variables
let people = []; // segmentation results from bodypix
let faces = []; // faces with resized boxes to fit video element (most probably 640x480)
let peopleBuffer = []; // segmentation results from bodypix
let facesBuffer = []; // faces with resized boxes to fit video element (most probably 640x480)
let previousFrameTime;
let stopRequested = false;
let initialized = false;
const opacity = 1;
const flipHorizontal = false;
let lastTimePerson = new Date(2020, 1, 1); // far past

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
        refineSteps: 20,
    };
    segmenterConfig = {
        architecture: "ResNet50",
        outputStride: 16,
        multiplier: 1,
        quantBytes: 4,
    };
}


if (DEBUG) {
    //// video file for debug:
    //// debug.mp4: one photo of multiple races
    //// debug2.mp4: superslow on my computer because of the resolution
    //// debug2_640x480.mp4: 640x480 resolution for faster processing
    // $('#fullscreen').append('<video id="video" autoplay muted loop><source src="debug.mp4" type="video/mp4"></video>')
    webcam.src = 'gray-cake-1.mov';
    webcam.loop = true;
    webcam.play();
    // $('#webcam_frame').css('visibility', 'show');
    setInitialPositions();
    setInitialFrame();
    initialized = true;
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
    webcamFrame.width = videoWidth
    webcamFrame.height = videoHeight
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
}

///// SOLUTION FOR RACE DETECTOR: convert webcam frame to tensor
// input_frame = tf.browser.fromPixels(webcam, 3);
// input_frame = tf.image.resizeBilinear(input_frame, [SIZE, SIZE]).toFloat();
// tf.browser.toPixels(input_frame.toFloat().div(tf.scalar(255.)), canvas);
// input_frame = input_frame.expandDims(0)

async function updateResults() {
    if (!initialized) {
        console.log("not initialized")
        setTimeout(updateResults, 1000)
        return
    }
    // await segmenterDraw()
    const ageValue = ageMap[$('input[name=age]:checked').val()]
    const sexValue = $('input[name=sex]:checked').val()

    // put webcam frame to the canvas
    webcamCtx.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
    var webcamData = webcamCtx.getImageData(0, 0, webcam.videoWidth, webcam.videoHeight);
    
    try {
        await calculateFaces()
    } catch (error) {
        console.error('Error calculating faces: ', error);
        $('#results').html('Error calculating faces: ' + error);
        window.requestAnimationFrame(updateResults);
        return
    }

    people = await segmenter.segmentPeople(webcam, segmentationConfig)

    // reset initial frame if there are no faces found for a long time (5 seconds)
    if (faces.length == 0) {
        if (Date.now() - lastTimePerson > 3000) {
            console.log('updating initial frame with empty space')
            initialCtx.drawImage(initialFrameDelayed, 0, 0, webcam.videoWidth, webcam.videoHeight)
            initialCtxDelayed.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
            lastTimePerson = Date.now()
        }
    } else {
        lastTimePerson = Date.now()
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
    canvasCtx.clearRect(0, 0, canvas_el.width, canvas_el.height);

    // TODO we can do it once in setInitialFrame
    var initialFrameData = initialCtx.getImageData(0, 0, initialFrame.width, initialFrame.height);
    var data = initialFrameData.data;

    // loop through faces list
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
        let drawBool = face.segmentation &&
            ageValue[0] < face.age &&
            ageValue[1] > face.age &&
            sexValue == face.gender

        if (drawBool) {
            const segmentData = face.segmentation.mask.mask.data;
            const foregroundColor = { r: 255, g: 255, b: 255, a: 255 };
            const backgroundColor = { r: 0, g: 0, b: 0, a: 0 };

            // instead of drawMask we copy pixel by pixel the initial frame for masked pixels
            let coloredPartImage = await bodySegmentation.toBinaryMask(face.segmentation, foregroundColor, backgroundColor);

            for (let i = 0; i < segmentData.length; i += 4) {
                let count = 0;
                let steps = 10;
                count += coloredPartImage.data[i + 3] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 - coloredPartImage.width * 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 + coloredPartImage.width * 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 + 4 * steps] > 0 ? 1 : 0;
                count += coloredPartImage.data[i + 3 - 4 * steps] > 0 ? 1 : 0;

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

    if (USE_WEBCAM_CANVAS) {
        canvasCtx.putImageData(
            webcamData,
            0, 0,
            0, 0, canvas_el.width, canvas_el.height);
    }

    if (window.calcRace === undefined) {
        // console.log("calcRace is undefined")
    } else {
        await calcRace()
    }
    await boxesDraw()

    // if (DEBUG) stopRequested = true

    if (!stopRequested) {
        // setTimeout(updateResults, 10)
        facesBuffer = faces;
        window.requestAnimationFrame(updateResults);
        // count fps from the last run of the function
        if (previousFrameTime) {
            // put fps info the results div
            // console.log('fps', 1000 / (Date.now() - lastTime))
            text = 'fps: ' + 1000 / (Date.now() - previousFrameTime)
            text += '<br> persons: ' + facesBuffer.length
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

    $('#navbar').append('')

    /* BodyPix segmenter */
    await loadSegmenter()

    // start processing
    updateResults();
}

async function loadSegmenter() {
    const model = bodySegmentation.SupportedModels.BodyPix;
    segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
}

function ageChange() {
    console.log("ageChange", $('#ageSelect').val())
}


async function boxesDraw() {

    // // clear canvas
    // canvas_el.getContext('2d').clearRect(0, 0, canvas_el.width, canvas_el.height)

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

$(document).ready(function () {
    run();
})

function stopAll() {
    // webcam.srcObject.getTracks().forEach(track => track.stop());
    stopRequested = true;
}

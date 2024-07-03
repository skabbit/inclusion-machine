// configuration variables
const DEBUG = true;
const LOW_QUALITY = true;
// draw full canvas with webcam data, or draw only masked parts on top of the webcam video element
const USE_WEBCAM_CANVAS = true;
const ageMap = {
    'child': [0, 10],
    'teen': [10, 22],
    'adult': [22, 70],
    'senior': [70, 200]
}

// cached elements
const webcam = document.getElementById("webcam")
webcam.autoplay = true;
const canvas = $('#canvas')
const canvas_el = canvas.get(0)
const canvasCtx = canvas_el.getContext('2d', { willReadFrequently: true })
const initialFrame = $('#initial_frame').get(0)
const initialCtx = initialFrame.getContext('2d', { willReadFrequently: true })
const webcamFrame = $('#webcam_frame').get(0)
const webcamCtx = webcamFrame.getContext('2d', { willReadFrequently: true })

// Define constraints for the video resolution
const webcamConstraints = {
    video: {
        width: { ideal: 1280 }, // Ideal width in pixels
        height: { ideal: 720 }  // Ideal height in pixels
    }
};

// control variables
let previousFrameTime;
let stopRequested = false;
const opacity = 1;
const flipHorizontal = false;
const segmentationConfig = {
    multiSegmentation: true,
    segmentBodyParts: false,
    flipHorizontal: false,
    maxDetections: 5,
    scoreThreshold: 0.2,
    nmsRadius: 20
};
let lastTimePerson = new Date(2020, 1, 1); // far past


if (DEBUG) {
    //// video file for debug:
    //// debug.mp4: one photo of multiple races
    //// debug2.mp4: superslow on my computer because of the resolution
    //// debug2_640x480.mp4: 640x480 resolution for faster processing
    // $('#fullscreen').append('<video id="video" autoplay muted loop><source src="debug.mp4" type="video/mp4"></video>')
    webcam.src = 'gray-cake-1.mov';
    webcam.loop = true;
    webcam.play();
    $('#webcam_frame').css('visibility', 'show');
} else {
    // capture webcam frame
    navigator.mediaDevices.getUserMedia(webcamConstraints).then(stream => {
        webcam.srcObject = stream;
        webcam.onloadedmetadata = () => {
            console.log(`Actual video dimensions: ${webcam.videoWidth}x${webcam.videoHeight}`);
        };        
    }).catch(error => {
        console.error('Error accessing webcam: ', error);
        $('#results').html('Error accessing webcam: ' + error);
    });;
}

let people = []; // segmentation results from bodypix
let faces = []; // faces with resized boxes to fit video element (most probably 640x480)

function setInitialPositions() {
    // get video resolution
    let videoWidth = webcam.videoWidth;
    let videoHeight = webcam.videoHeight;
    if (DEBUG) {
        let videoWidth = webcam.videoWidth;
        let videoHeight = webcam.videoHeight;
    }

    // set initial frame size to video resolution
    initialFrame.width = videoWidth
    initialFrame.height = videoHeight
    webcamFrame.width = videoWidth
    webcamFrame.height = videoHeight
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
    // get real resolution of webcam
    const videoWidth = webcam.videoWidth
    const videoHeight = webcam.videoHeight

    // set canvas resolution to webcam size
    console.log("initialFrame", initialFrame.width, initialFrame.height)
    initialCtx.drawImage(webcam, 0, 0, videoWidth, videoHeight)
}

///// SOLUTION FOR RACE DETECTOR: convert webcam frame to tensor
// input_frame = tf.browser.fromPixels(webcam, 3);
// input_frame = tf.image.resizeBilinear(input_frame, [SIZE, SIZE]).toFloat();
// tf.browser.toPixels(input_frame.toFloat().div(tf.scalar(255.)), canvas);
// input_frame = input_frame.expandDims(0)

async function updateResults() {
    // await segmenterDraw()
    await calculateFaces()
    people = await segmenter.segmentPeople(webcam, segmentationConfig)
    
    // clear drawing context
    canvasCtx.clearRect(0, 0, canvas_el.width, canvas_el.height);

    // put webcam frame to the canvas
    webcamCtx.drawImage(webcam, 0, 0, webcam.videoWidth, webcam.videoHeight)
    var webcamData = webcamCtx.getImageData(0, 0, webcam.videoWidth, webcam.videoHeight);
    
    // TODO we can do it once in setInitialFrame
    var initialFrameData = initialCtx.getImageData(0, 0, initialFrame.width, initialFrame.height);
    var data = initialFrameData.data;

    for (let i = 0; i < people.length; i++) {
        const segment = people[i];
        segmentData = segment.mask.mask.data;

        // loop through people to match the box with the person
        const person = segment
        const imageData = person.mask.mask
        // loop through faces list
        for (let j = 0; j < faces.length; j++) {
            box = faces[j].detection.box
            let { x, y, width, height } = box
            x = Math.round(x)
            y = Math.round(y)
            width = Math.round(width)
            height = Math.round(height)
            // count all pixels having alpha channel non zero in the imageData
            let count = 0
            // but only for x, y, width, height of the box
            for (let i = x; i < x + width; i++) {
                for (let j = y; j < y + height; j++) {
                    let address = (i + j * imageData.width) * 4 + 3
                    if (imageData.data[address] > 0) {
                        count++
                    }
                }
            }
            prob = count / (width * height)
            // console.log('face number', j, count, width * height, prob, x, y, width, height, imageData.width, imageData.height)
            faces[j].prob = prob
            if (prob > 0.2) {
                people[i].face = faces[j]
            }
        }
        
        const ageValue = ageMap[$('input[name=age]:checked').val()]
        const sexValue = $('input[name=sex]:checked').val()
        let drawBool = people[i].face && 
                       ageValue[0] < people[i].face.age && 
                       ageValue[1] > people[i].face.age && 
                       sexValue == people[i].face.gender

        const foregroundColor = {r: 255, g: 255, b: 255, a: 255};
        const backgroundColor = {r: 0, g: 0, b: 0, a: 0};

        // instead of drawMask we copy pixel by pixel the initial frame for masked pixels
        let coloredPartImage = await bodySegmentation.toBinaryMask(people[i], foregroundColor, backgroundColor);

        if (drawBool) {
            for (let i = 0; i < segmentData.length; i += 4) {
                if (coloredPartImage.data[i + 3] !== 0) {
                    if (USE_WEBCAM_CANVAS) {
                        webcamData.data[i]     = data[i];     // red
                        webcamData.data[i + 1] = data[i + 1]; // green
                        webcamData.data[i + 2] = data[i + 2]; // blue
                        webcamData.data[i + 3] = data[i + 3]; // alpha
                    } else {
                        coloredPartImage.data[i]     = data[i];     // red
                        coloredPartImage.data[i + 1] = data[i + 1]; // green
                        coloredPartImage.data[i + 2] = data[i + 2]; // blue
                        coloredPartImage.data[i + 3] = data[i + 3]; // alpha
                    }
                } else {
                    if (USE_WEBCAM_CANVAS) {} else {
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
        window.requestAnimationFrame(updateResults);
        // count fps from the last run of the function
        if (previousFrameTime) {
            // put fps info the results div
            // console.log('fps', 1000 / (Date.now() - lastTime))
            text = 'fps: ' + 1000 / (Date.now() - previousFrameTime)
            $('#results').html('fps: ' + 1000 / (Date.now() - previousFrameTime))
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

    // start processing image
    setTimeout(setInitialPositions, 1000)
    setTimeout(setInitialFrame, 2000) // give time to webcam auto adjust brightness
    setTimeout(updateResults, 3000)
}

async function loadSegmenter() {
    const model = bodySegmentation.SupportedModels.BodyPix;
    let segmenterConfig;
    if (LOW_QUALITY) {
        segmenterConfig = {
            architecture: "MobileNetV1",
            outputStride: 16,
            internalResolution: "low",
            multiplier: 0.5,
            quantBytes: 1,
        };
    } else {
        segmenterConfig = {
            architecture: "ResNet50",
            outputStride: 16,
            internalResolution: "full",
            multiplier: 1,
            quantBytes: 4,
        };
    }
    segmenter = await bodySegmentation.createSegmenter(model, segmenterConfig);
}

function ageChange() {
    console.log("ageChange", $('#ageSelect').val())
}

const legendColors = [
    [255, 197, 0, 255], // Vivid Yellow
    [128, 62, 117, 255], // Strong Purple
    [255, 104, 0, 255], // Vivid Orange
    [166, 189, 215, 255], // Very Light Blue
    [193, 0, 32, 255], // Vivid Red
    [206, 162, 98, 255], // Grayish Yellow
    [129, 112, 102, 255], // Medium Gray
    [0, 125, 52, 255], // Vivid Green
    [246, 118, 142, 255], // Strong Purplish Pink
    [0, 83, 138, 255], // Strong Blue
    [255, 112, 92, 255], // Strong Yellowish Pink
    [83, 55, 112, 255], // Strong Violet
    [255, 142, 0, 255], // Vivid Orange Yellow
    [179, 40, 81, 255], // Strong Purplish Red
    [244, 200, 0, 255], // Vivid Greenish Yellow
    [127, 24, 13, 255], // Strong Reddish Brown
    [147, 170, 0, 255], // Vivid Yellowish Green
    [89, 51, 21, 255], // Deep Yellowish Brown
    [241, 58, 19, 255], // Vivid Reddish Orange
    [35, 44, 22, 255], // Dark Olive Green
    [0, 161, 194, 255] // Vivid Blue
    ];

async function boxesDraw() {

    // // clear canvas
    // canvas_el.getContext('2d').clearRect(0, 0, canvas_el.width, canvas_el.height)

    for (let i = 0; i < faces.length; i++) {
        const result_resized = faces[i]
        // const result = results[i]
        // copy this box content from initial frame to canvas,
        // const { x, y, width, height } = result_resized.detection.box
        // const box = result.detection.box
        // const ctx = canvas_el.getContext('2d')
        // ctx.drawImage(initialFrame,
        //     box.x, box.y, box.width, box.height,
        //     x, y, width, height,
        // )
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

const DEBUG = false
let layers = ['segmenter', 'faceapi', 'races']
const ageMap = {
    'child': [0, 10],
    'teen': [10, 22],
    'adult': [22, 50],
    'senior': [50, 200]
}
const webcam = document.getElementById("webcam")
webcam.autoplay = true;
const canvas = $('#canvas')
const canvas_el = canvas.get(0)
const canvasCtx = canvas_el.getContext('2d', { willReadFrequently: true })
const initialFrame = $('#initial_frame').get(0)
const initialCtx = initialFrame.getContext('2d', { willReadFrequently: true })
let lastTime;
let stopRequested = false;
const opacity = 1;
const flipHorizontal = false;
const maskBlurAmount = 0;
const segmentationConfig = {
    multiSegmentation: true,
    segmentBodyParts: false,
    flipHorizontal: false,
    maxDetections: 5,
    scoreThreshold: 0.2,
    nmsRadius: 20
};

async function testPerformance() {
    let resulted_html = '';
    const NUM = 10;

    async function testFaceAPIPerformance() {
        console.log('testFaceAPIPerformance')
        const start = Date.now();
        for (let i = 0; i < NUM; i++) {
            let result = await faceapi.detectAllFaces(webcam, optionsSSDMobileNet)
                // compute face landmarks to align faces for better accuracy
                .withFaceLandmarks()
                .withAgeAndGender();
        }
        const end = Date.now();
        const time = end - start;
        resulted_html += 'calculateFaces()<br>'
        + 'time: ' + time + 'ms<br>' 
        + NUM + ' iterations' + '<br>'
        + 'average: ' + time / NUM + 'ms' + '<br>'
        + 'fps: ' + 1000 / (time / NUM) + '<br><hr>';
        return time;
    }

    async function testSegmenterPerformance() {
        console.log('testSegmenterPerformance')
        const start = Date.now();
        for (let i = 0; i < NUM; i++) {
            people = await segmenter.segmentPeople(webcam, segmentationConfig);
        }
        const end = Date.now();
        const time = end - start;
        resulted_html += 'testSegmenterPerformance()<br>'
        + 'time: ' + time + 'ms<br>' 
        + NUM + ' iterations' + '<br>'
        + 'average: ' + time / NUM + 'ms' + '<br>'
        + 'fps: ' + 1000 / (time / NUM) + '<br><hr>';
        return time;
    }

    // test performance of the faceapi
    const faceapiTime = await testFaceAPIPerformance();
    const segmenterTime = await testSegmenterPerformance();

    $('#results').html(resulted_html)
    
}


if (DEBUG) {
    //// video file for debug:
    //// debug.mp4: one photo of multiple races
    //// debug2.mp4: superslow on my computer because of the resolution
    //// debug2_640x480.mp4: 640x480 resolution for faster processing
    $('#fullscreen').append('<video id="video" autoplay muted loop><source src="debug.mp4" type="video/mp4"></video>')

} else {
    //// capture webcam frame OR use debug video file
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        webcam.srcObject = stream;
    });
}

let people = []; // segmentation results from bodypix
let faces = []; // faces with resized boxes to fit video element (most probably 640x480)

function setInitialPositions() {
    // get video resolution
    const videoWidth = webcam.videoWidth
    const videoHeight = webcam.videoHeight

    // set initial frame size to video resolution
    initialFrame.width = videoWidth
    initialFrame.height = videoHeight
    console.log("initialFrame", initialFrame.width, initialFrame.height)

    // set canvas width and left position to fit the video position on the fullscreen
    const fullscreen = $('#fullscreen')
    // set internal canvas resolution to webcam size
    canvas_el.width = webcam.videoWidth
    canvas_el.height = webcam.videoHeight

    // but real canvas size to fullscreen size
    canvas.width(fullscreen.width() * videoHeight / videoWidth - 25)
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
    const ctx = initialFrame.getContext('2d')
    ctx.drawImage(webcam, 0, 0, videoWidth, videoHeight)
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

    var initialFrameData = initialCtx.getImageData(0, 0, initialFrame.width, initialFrame.height);
    var data = initialFrameData.data;
    console.log('people=', people)
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
        // bodySegmentation.drawMask(canvas_el, initialFrame, coloredPartImage, 0.5, maskBlurAmount, flipHorizontal);

        if (drawBool) {
            for (let i = 0; i < segmentData.length; i += 4) {
                if (coloredPartImage.data[i + 3] !== 0) {
                    coloredPartImage.data[i]     = data[i];     // red
                    coloredPartImage.data[i + 1] = data[i + 1]; // green
                    coloredPartImage.data[i + 2] = data[i + 2]; // blue
                    coloredPartImage.data[i + 3] = data[i + 3]; // alpha
                } else {
                    coloredPartImage.data[i] = 0;
                    coloredPartImage.data[i + 1] = 0;
                    coloredPartImage.data[i + 2] = 0;
                    coloredPartImage.data[i + 3] = 0;
                }
            }
            canvasCtx.putImageData(
                coloredPartImage,
                0, 0,
                0, 0, canvas_el.width, canvas_el.height);
        }
    }

    if (window.calcRace === undefined) {
        console.log("calcRace is undefined")
    } else {
        await calcRace()
    }
    await boxesDraw()

    if (DEBUG) stopRequested = true

    if (!stopRequested) {
        // setTimeout(updateResults, 10)
        window.requestAnimationFrame(updateResults);
        // count fps from the last run of the function
        if (lastTime) {
            // put fps info the results div
            console.log('fps', 1000 / (Date.now() - lastTime))
            $('#results').html('fps: ' + 1000 / (Date.now() - lastTime))
        }
        lastTime = Date.now()
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
    const segmenterConfig = {
        architecture: "MobileNetV1",
        outputStride: 16,
        internalResolution: "low",
        multiplier: 0.5,
        quantBytes: 1,
    };
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

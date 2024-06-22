/* face-api.js face detector with age and gender */
// faceapi.detectAllFaces(input).withFaceLandmarks().withAgeAndGender()
let inputSize = 224
let scoreThreshold = 0.5
const inputImgEl = $('#inputImg').get(0)
let options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
let minScore = 0.2
let maxResults = 5
// SsdMobilenetv1Options works slower, but much better
let optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({ minConfidence: minScore, maxResults });

async function calculateFaces() {
    let results = await faceapi.detectAllFaces(webcam, optionsSSDMobileNet)
    // compute face landmarks to align faces for better accuracy
    .withFaceLandmarks()
    .withAgeAndGender()
    faces = faceapi.resizeResults(results, canvas_el)
    console.log('faces=', faces)
}


async function faceapiDraw() {

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

async function faceapiInit() {
    const loadpath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'
    await faceapi.nets.tinyFaceDetector.load(loadpath)
    await faceapi.nets.ssdMobilenetv1.load(loadpath)
    await faceapi.loadFaceLandmarkModel(loadpath)
    await faceapi.nets.ageGenderNet.load(loadpath)
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
        const text = result_resized.gender + ' ' 
            + result_resized.age.toFixed(0) + ' ' 
            + result_resized.prob.toFixed(2)
        const { width, actualBoundingBoxAscent, actualBoundingBoxDescent } = ctx.measureText(text)
        ctx.fillStyle = 'red'
        ctx.fillRect(x, y, width + 4, actualBoundingBoxAscent + actualBoundingBoxDescent)
        ctx.fillStyle = 'white'
        ctx.fillText(text, x, y + actualBoundingBoxAscent)
    }

}

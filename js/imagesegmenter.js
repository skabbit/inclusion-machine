import {        
    ImageSegmenter,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";
console.log(ImageSegmenter)

/* ------------- */
const audio = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
);
let runningMode = "VIDEO"
let imageSegmenter = await ImageSegmenter.createFromOptions(audio, {
    baseOptions: {
        modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite",
        delegate: "GPU"
    },
    runningMode: runningMode,
    outputCategoryMask: true,
    outputConfidenceMasks: false
});
let labels = imageSegmenter.getLabels();
console.log(labels)

async function segmenterDraw() {
    // Start segmenting the stream.
    let startTimeMs = performance.now();
    imageSegmenter.segmentForVideo(webcam, startTimeMs, callbackForVideo);
}

function callbackForVideo(result) {
    console.log("callbackForVideo", webcam.videoWidth, webcam.videoHeight)
    let imageData = canvasCtx.getImageData(
        0,
        0,
        webcam.videoWidth,
        webcam.videoHeight
    ).data;
    const mask = result.categoryMask.getAsFloat32Array();
    console.log(result)
    console.log(mask)
    let j = 0;
    for (let i = 0; i < mask.length; ++i) {
        const maskVal = Math.round(mask[i] * 255.0);
        const legendColor = legendColors[maskVal % legendColors.length];
        if (legendColor == undefined)
            console.log("undefined", legendColor, mask[i] % legendColors.length)
        imageData[j] = (legendColor[0] + imageData[j]) / 2;
        imageData[j + 1] = (legendColor[1] + imageData[j + 1]) / 2;
        imageData[j + 2] = (legendColor[2] + imageData[j + 2]) / 2;
        imageData[j + 3] = (legendColor[3] + imageData[j + 3]) / 2;
        j += 4;
    }
    const uint8Array = new Uint8ClampedArray(imageData.buffer);
    const dataNew = new ImageData(
        uint8Array,
        webcam.videoWidth,
        webcam.videoHeight
    );
    canvasCtx.putImageData(dataNew, 0, 0);
    console.log(dataNew)
}

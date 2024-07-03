const canvas1 = document.getElementById('canvas1');

// for example
const SIZE = 224;
const im = new Image()
im.src = "face.png";


let model_race;
let input_frame;
const labels = ["asian",
                "indian",
                "black",
                "white",
                "middle eastern",
                "latino hispanic"]

async function calcRace() {
    if (model_race === undefined) {
        console.log("Model not loaded yet");
        return;
    }
    if (faces === undefined) {
        console.log("faces not calculated yet");
        return;
    }
    // console.time("Loading Time");
    // example = tf.browser.fromPixels(im, 3);
    // tf.browser.toPixels(example.toFloat().div(tf.scalar(255.)), canvas1);
    // example = tf.image.resizeBilinear(example.expandDims(0), [SIZE, SIZE]).toFloat();
    // console.timeEnd("Loading Time");

    // console.time("Prediction Time");
    // prediction = model_race.predict(example);
    // console.log(prediction);
    // data = await prediction.data()
    // console.timeEnd("Prediction Time");

    //////// on my MacBook Pro 2014, this takes around 1 second. could play with webgpu or wasm to speed up
    console.time("Webcam Loading and Prediction Time");
    // convert webcam frame to tensor
    input_frame = tf.browser.fromPixels(webcam, 3);
    for (let i = 0; i < faces.length; i++) {
        // slice each face from the webcam frame
        let height = faces[i].detection.box.y + faces[i].detection.box.height > input_frame.shape[0] ? input_frame.shape[0] - faces[i].detection.box.y : faces[i].detection.box.height;
        let width = faces[i].detection.box.x + faces[i].detection.box.width > input_frame.shape[1] ? input_frame.shape[1] - faces[i].detection.box.x : faces[i].detection.box.width;
        face_input = input_frame.slice([
            Math.round(faces[i].detection.box.y),
            Math.round(faces[i].detection.box.x), 0
        ], [
            Math.round(height),
            Math.round(width), 3
        ]);
        face_input = tf.image.resizeBilinear(face_input.expandDims(0), [SIZE, SIZE]).toFloat();
        prediction = await model_race.predict(face_input);
        data = await prediction.data()
        const first_index = data.findIndex(element => element === 1);
        faces[i].race = labels[first_index];
    }
    console.timeEnd("Webcam Loading and Prediction Time");

}

async function loadRaceModels() {
    // load trained deepface race detection model
    model_race = await tf.loadLayersModel('./racejs/model.json');
}

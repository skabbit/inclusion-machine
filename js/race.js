const canvas1 = document.getElementById('canvas1');

// for example
const SIZE = 224;
const im = new Image()
im.src = "face.png";

// load trained mobilenet
const model_race = tf.loadLayersModel('./racejs/model.json');
model = undefined;
model_race.then(m => model = m);

function start() {
  console.time("Loading Time");
  example = tf.browser.fromPixels(im, 3);
  tf.browser.toPixels(example.toFloat().div(tf.scalar(255.)), canvas1);
  example = tf.image.resizeBilinear(example.expandDims(0), [SIZE, SIZE]).toFloat();
  console.timeEnd("Loading Time");

  console.time("Prediction Time");
  prediction = model.predict(example);
  console.log(prediction);
  console.timeEnd("Prediction Time");

  // convert webcam frame to tensor
  input_frame = tf.browser.fromPixels(webcam, 3);
  // input_frame = tf.image.resizeBilinear(input_frame, [SIZE, SIZE]).toFloat();
  tf.browser.toPixels(input_frame.toFloat().div(tf.scalar(255.)), canvas1);
  input_frame = input_frame.expandDims(0);

}

// capture webcam frame
const webcam = document.createElement('video');
webcam.width = SIZE;
webcam.height = SIZE;
webcam.autoplay = true;
document.body.appendChild(webcam);
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
  webcam.srcObject = stream;
});

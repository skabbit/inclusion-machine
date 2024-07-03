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

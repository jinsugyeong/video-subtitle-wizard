const express = require('express')
const app = express()
const port = 3000

// Imports the Google Cloud Video Intelligence library + Node's fs library
const Video = require('@google-cloud/video-intelligence');
const fs = require('fs');
const util = require('util');

app.get('/', async function(req, res) {
    // Creates a client
    const video = new Video.VideoIntelligenceServiceClient();

    /**
     * TODO(developer): Uncomment the following line before running the sample.
     */
    const path = './data/20240327.mp4';

    // Reads a local video file and converts it to base64
    const file = await util.promisify(fs.readFile)(path);
    const inputContent = file.toString('base64');

    const request = {
        inputContent: inputContent,
        features: ['TEXT_DETECTION'],
    };

    // Detects text in a video
    const [operation] = await video.annotateVideo(request);
    const results = await operation.promise();
    console.log('Waiting for operation to complete...');

    // Gets annotations for video
    const textAnnotations = results[0].annotationResults[0].textAnnotations;

    var outfile = fs.createWriteStream('./subtitle/20240327.txt', {flag: 'w'});
    var cnt = 0;

    //타임스탬프 포맷 얻는 함수
    var getTimestamp = function(tt) {
                
        if(tt != 0) {
            let hh = parseInt(tt / 60 / 60);
            let mm = parseInt(tt / 60 % 60);
            let ss = parseInt(tt % 60);

            hh = (hh < 10) ? '0'+hh : hh;
            mm = (mm < 10) ? '0'+mm : mm;
            ss = (ss < 10) ? '0'+ss : ss;

            return hh + `:` + mm + ':' + ss;
        }else {
            return `00:00:00`
        }
        
    }

    textAnnotations.forEach(textAnnotation => {

        textAnnotation.segments.forEach(segment => {
            if(segment.confidence >= 0.7) {
                console.log(textAnnotation.text);

                const time = segment.segment;

                if (time.startTimeOffset.seconds === undefined) {
                    time.startTimeOffset.seconds = 0;
                }
                if (time.startTimeOffset.nanos === undefined) {
                    time.startTimeOffset.nanos = 0;
                }
                if (time.endTimeOffset.seconds === undefined) {
                    time.endTimeOffset.seconds = 0;
                }
                if (time.endTimeOffset.nanos === undefined) {
                    time.endTimeOffset.nanos = 0;
                }

                let startTime = time.startTimeOffset.seconds || 0;
                let endTime = time.endTimeOffset.seconds || 0;

                outfile.write(
                    cnt + `\n` + 
                    getTimestamp(startTime) + `.${(time.startTimeOffset.nanos / 1e6).toFixed(0)}` +
                    ` --> ` +
                    getTimestamp(endTime) + `.${(time.endTimeOffset.nanos / 1e6).toFixed(0)}\n` +
                    `${textAnnotation.text}\n\n`   
                );
            } 
        });

        cnt += 1;
    });

    res.send('Waiting for operation to complete...');

    outfile.end(function(){
        console.log('파일 쓰기 종료.');
    })

});


app.use(function(req, res, next) {
    res.status(404).send('Sorry cant find that!');
});

app.use(function (err, req, res, next) {
    console.error(err.stack)
    res.status(500).send('Something broke!')
});



app.listen(port, function() {
    console.log(`Example app listening on port ${port}`)
});
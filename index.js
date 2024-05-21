const express = require('express');
const app = express();
const port = 3000;

const Video = require('@google-cloud/video-intelligence');
const fs = require('fs');
const util = require('util');
const pathModule = require('path');

const getTimestamp = function(time) {
    const arr = time.split(',');
    const tt = arr[0];

    if(tt != 0) {
        let hh = parseInt(tt / 60 / 60);
        let mm = parseInt(tt / 60 % 60);
        let ss = parseInt(tt % 60);

        hh = (hh < 10) ? '0'+hh : hh;
        mm = (mm < 10) ? '0'+mm : mm;
        ss = (ss < 10) ? '0'+ss : ss;

        return hh + `:` + mm + ':' + ss + ',' + arr[1];

    }else {
        return `00:00:00` + ',' + arr[1];
    }
    
}

app.get('/', async function(req, res) {
    const startTime = Date.now(); // 작업 시작 시간 기록

    const video = new Video.VideoIntelligenceServiceClient();

    const path = './data/20240327.mp4';
    const baseFilename = pathModule.basename(path, pathModule.extname(path));
    const srtFilename = `./subtitle/${baseFilename}.srt`;

    try {
        const file = await util.promisify(fs.readFile)(path);
        const inputContent = file.toString('base64');

        const request = {
            inputContent: inputContent,
            features: ['TEXT_DETECTION'],
        };

        const [operation] = await video.annotateVideo(request);
        const results = await operation.promise();

        console.log('Video annotation completed.'); // 비디오 주석 완료 시간 기록

        const textAnnotations = results[0].annotationResults[0].textAnnotations;

        let outfile = fs.createWriteStream(srtFilename, {flag: 'w'});
        let cnt = 1;
        let lastText = '';
        let lastStartTime = 0;
        let lastEndTime = 0;

        const allSegments = [];

        // Collect all segments and their corresponding text
        textAnnotations.forEach(textAnnotation => {
            if (/^[\u4e00-\u9fff]+$/.test(textAnnotation.text)) {
                textAnnotation.segments.forEach(segment => {
                    if (segment.confidence >= 0.65) {
                        const time = segment.segment;
                        const startTime = (time.startTimeOffset.seconds || 0) + `,${(time.startTimeOffset.nanos / 1e6).toFixed(0)}`;
                        const endTime = (time.endTimeOffset.seconds || 0) + `,${(time.endTimeOffset.nanos / 1e6).toFixed(0)}`;
                        allSegments.push({ startTime, endTime, text: textAnnotation.text });
                    }
                });
            }
        });

        // Sort segments by startTime
        allSegments.sort((a, b) => a.startTime - b.startTime);

        // Write segments to SRT file
        allSegments.forEach(segment => {
            const { startTime, endTime, text } = segment;

            // Merge consecutive duplicate subtitles
            if (text === lastText && startTime <= lastEndTime + 1) {
                lastEndTime = endTime;
            } else {
                if (lastText !== '') {
                    outfile.write(
                        `${cnt}\n` +
                        `${getTimestamp(lastStartTime)} --> ${getTimestamp(lastEndTime)}\n` +
                        `${lastText}\n\n`
                    );
                    cnt++;
                }
                lastText = text;
                lastStartTime = startTime;
                lastEndTime = endTime;
            }
        });

        // Write the last subtitle
        if (lastText !== '') {
            outfile.write(
                `${cnt}\n` +
                `${getTimestamp(lastStartTime)} --> ${getTimestamp(lastEndTime)}\n` +
                `${lastText}\n\n`
            );
        }

        outfile.end(() => {
            console.log('Subtitles generated successfully.'); // 자막 생성 완료 시간 기록
        });

        const endTime = Date.now();
        console.log(`Total processing time: ${endTime - startTime} ms`); // 전체 처리 시간 출력

        res.send('Waiting for operation to complete...');
    } catch (err) {
        console.error('Error processing video:', err);
        res.status(500).send('Error processing video');
    }
});

app.use(function(req, res, next) {
    res.status(404).send('Sorry cant find that!');
});

app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(port, function() {
    console.log(`Example app listening on port ${port}`);
});


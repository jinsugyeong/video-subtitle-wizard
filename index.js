const express = require('express');
const app = express();
const port = 3000;

const Video = require('@google-cloud/video-intelligence');
const fs = require('fs');
const util = require('util');
const pathModule = require('path');

const getTimestamp = (timeInSeconds) => {
    const pad = (num, size) => ('000' + num).slice(size * -1);
    const hours = pad(Math.floor(timeInSeconds / 3600), 2);
    const minutes = pad(Math.floor((timeInSeconds % 3600) / 60), 2);
    const seconds = pad(Math.floor(timeInSeconds % 60), 2);
    const milliseconds = pad(Math.floor((timeInSeconds % 1) * 1000), 3);
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
};

app.get('/', async function(req, res) {
    const startTime = Date.now(); // 작업 시작 시간 기록

    const video = new Video.VideoIntelligenceServiceClient();

    const path = './data/20240327.mp4';
    const baseFilename = pathModule.basename(path, pathModule.extname(path));
    const srtFilename = `./subtitle/${baseFilename}.srt`;
    const segmentsFilename = `./subtitle/${baseFilename}_segments.txt`;

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

        let outfile = fs.createWriteStream(srtFilename, { flag: 'w' });
        let segmentsFile = fs.createWriteStream(segmentsFilename, { flag: 'w' });
        let cnt = 1;
        let lastText = '';
        let lastStartTime = 0;
        let lastEndTime = 0;

        const allSegments = [];

        // Collect all segments and their corresponding text
        textAnnotations.forEach(textAnnotation => {
            if (/^[\u4e00-\u9fff]+$/.test(textAnnotation.text)) {
                textAnnotation.segments.forEach(segment => {
                    if (segment.confidence >= 0.8) {
                        const time = segment.segment;
                        const startTime = (time.startTimeOffset.seconds || 0) + (time.startTimeOffset.nanos || 0) / 1e9;
                        const endTime = (time.endTimeOffset.seconds || 0) + (time.endTimeOffset.nanos || 0) / 1e9;
                        allSegments.push({ startTime, endTime, text: textAnnotation.text });
                    }
                });
            }
        });

        // Sort segments by startTime
        allSegments.sort((a, b) => a.startTime - b.startTime);

        // Write segments to SRT file and segments.txt file
        allSegments.forEach(segment => {
            const { startTime, endTime, text } = segment;

            // Write to segments.txt file
            segmentsFile.write(`Start: ${getTimestamp(startTime)} End: ${getTimestamp(endTime)} Text: ${text}\n`);

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

        segmentsFile.end(() => {
            console.log('Segments file generated successfully.');
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

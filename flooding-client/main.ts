import * as fs   from "fs";
import * as http from "http";

const oneGigabyte = 1073741824;
const floodUrl = process.env.TARGET_URL || 'http://localhost:3000/';
const numSenders = ensureNaturalInt(process.env.NUM_REQUESTS, 10);
const requestSize = oneGigabyte; //(2 * 1024 * 1024) - 1024;

let failures = 0;
let socketFailures = 0;
let success = 0;
let timeouts = 0;
let requests: Promise<number|null>[] = [];

console.log(`Sending ${numSenders} requests to ${floodUrl} ...\n`);

for (let i = 0; i < numSenders; i++) {
    requests.push(sendLargeRequest(floodUrl, i));
}

Promise.all(requests)
    .then((results) => {
        console.log('\nSUMMARY\n=======\n');
        console.log(`Total:      ${numSenders}`);
        console.log(`Successful: ${success}`);
        console.log(`Failures:   ${failures} unexpected responses, ${socketFailures} socket failures`);
        console.log(`Timeouts:   ${timeouts}`);

        const responseTimes = results.filter(item => item !== null);

        if (responseTimes.length >= 1) {
            const total = responseTimes.reduce((sum, time) => sum + time, 0);
            const avg   = responseTimes.length > 0 ? total / responseTimes.length : 0;

            console.log(`Avg Time:   ${avg}ms`);
        }

        process.exit(0);
    });

function ensureNaturalInt(value: any, defaultValue: number = 0): number
{
    if (typeof value === 'string') {
        value = parseInt(value, 10);
    }

    return typeof value === 'number' && !isNaN(value) && value >= 1
           ? value
           : defaultValue;
}

function sendLargeRequest(url: string, id: number): Promise<number|null>
{
    return new Promise((resolve) => {
        const start = process.hrtime();
        const options: http.RequestOptions = {
            method: 'POST',
            timeout: 2000,
        };

        const data = fs.createReadStream('/dev/urandom', {end: requestSize});
        const request = http.request(url, options, (response): void => {
            const processedSize = ensureNaturalInt(response.headers["x-processed-size"]);
            if (
                response.statusCode !== 204
                || response.statusMessage !== 'Stream processed'
                || processedSize < requestSize
            ) {
                console.warn(
                    'Unexpected Response for client request '
                    + `#${id}: ${response.statusCode} - ${response.statusMessage} (Processed size: ${processedSize})`
                );
                failures++;
                response.resume();
                resolve(null);
                return;
            }

            success++;
            response.resume();
            tryClose(data);
            resolve(toMilliSeconds(process.hrtime(start)));
        });

        request.on('timeout', () => {
            timeouts++;

            tryClose(data);
            resolve(null);
        });

        request.on('error', (err) => {
            socketFailures++;

            console.warn(`Socket Error for client request #${id}: `, err.message);
            tryClose(data);
            resolve(null);
        });

        request.setHeader('Content-Type', 'application/octet-stream');
        request.setHeader('Connection', 'close');
        request.setHeader('User-Agent', 'NodeJs/12');
        request.setHeader('Accept', '*/*');
        request.setHeader('Content-Length', `${requestSize}`);
        data.pipe(request);
    });
}

function tryClose(stream: fs.ReadStream|null): void
{
    try {
        if (stream) {
            stream.close();
        }
    } catch (e) {
        // Fall through
    }
}

function toMilliSeconds(tuple: [number, number]): number
{
    const ms = Math.round(tuple[1] / 1000000);
    return ms + (tuple[0] * 1000);
}

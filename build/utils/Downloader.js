"use strict";
/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 * Fork author: Benjas333
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const events_1 = require("events");
/**
 * A class responsible for downloading single or multiple files,
 * emitting events for progress, speed, estimated time, and errors.
 */
class Downloader extends events_1.EventEmitter {
    /**
     * Downloads a single file from the given URL to the specified local path.
     * Emits "progress" events with the number of bytes downloaded and total size.
     *
     * @param url - The remote URL to download from
     * @param dirPath - Local folder path where the file is saved
     * @param fileName - Name of the file (e.g., "mod.jar")
     */
    async downloadFile(url, dirPath, fileName) {
        if (!fs_1.default.existsSync(dirPath))
            fs_1.default.mkdirSync(dirPath, { recursive: true });
        const writer = fs_1.default.createWriteStream(`${dirPath}/${fileName}`);
        const response = await (0, node_fetch_1.default)(url);
        const contentLength = response.headers.get('content-length');
        const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
        let downloaded = 0;
        return new Promise((resolve, reject) => {
            response.body.on('data', (chunk) => {
                downloaded += chunk.length;
                // Emit progress with the current number of bytes vs. total size
                this.emit('progress', downloaded, totalSize);
                writer.write(chunk);
            });
            response.body.on('end', () => {
                writer.end();
                resolve();
            });
            response.body.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });
        });
    }
    /**
     * Downloads multiple files concurrently (up to the specified limit).
     * Emits "progress" events with cumulative bytes downloaded vs. total size,
     * as well as "speed" and "estimated" events for speed and ETA calculations.
     *
     * @param files - An array of DownloadOptions describing each file
     * @param size - The total size (in bytes) of all files to be downloaded
     * @param limit - The maximum number of simultaneous downloads
     * @param timeout - A timeout in milliseconds for each fetch request
     */
    async downloadFileMultiple(files, size, limit = 1, timeout = 10000) {
        if (limit > files.length) {
            limit = files.length;
        }
        let completed = 0; // Number of downloads completed
        let downloaded = 0; // Cumulative bytes downloaded
        let queued = 0; // Index of the next file to download
        let start = Date.now();
        let before = 0;
        let speeds = [];
        // A repeating interval to calculate speed and ETA
        const estimated = setInterval(() => {
            const duration = (Date.now() - start) / 1000; // seconds
            const chunkDownloaded = downloaded - before; // new bytes in this interval
            if (speeds.length >= 5) {
                speeds.shift(); // keep last 4 measurements
            }
            speeds.push(chunkDownloaded / duration);
            // Average of speeds
            const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
            this.emit('speed', avgSpeed);
            const timeRemaining = (size - downloaded) / avgSpeed;
            this.emit('estimated', timeRemaining);
            start = Date.now();
            before = downloaded;
        }, 500);
        // Recursive function that downloads the next file in the queue
        const downloadNext = async () => {
            if (queued < files.length) {
                const file = files[queued];
                queued++;
                if (!fs_1.default.existsSync(file.folder))
                    fs_1.default.mkdirSync(file.folder, { recursive: true, mode: 0o777 });
                // Create a write stream for the file
                const writer = fs_1.default.createWriteStream(file.path, { flags: 'w', mode: 0o777 });
                try {
                    const response = await (0, node_fetch_1.default)(file.url, { timeout });
                    // On data reception, increase the global downloaded counter
                    response.body.on('data', (chunk) => {
                        downloaded += chunk.length;
                        // Emit progress with the current total downloaded vs. full size
                        this.emit('progress', downloaded, size, file.type);
                        writer.write(chunk);
                    });
                    response.body.on('end', () => {
                        writer.end();
                        completed++;
                        downloadNext();
                    });
                    response.body.on('error', (err) => {
                        writer.end();
                        completed++;
                        downloadNext();
                        this.emit('error', err);
                    });
                }
                catch (e) {
                    writer.end();
                    completed++;
                    downloadNext();
                    this.emit('error', e);
                }
            }
        };
        // Start "limit" concurrent downloads
        for (let i = 0; i < limit; i++) {
            downloadNext();
        }
        // Wait until all downloads complete
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (completed === files.length) {
                    clearInterval(estimated);
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }
    /**
     * Performs a HEAD request on the given URL to check if it is valid (status=200)
     * and retrieves the "content-length" if available.
     *
     * @param url The URL to check
     * @param timeout Time in ms before the request times out
     * @returns An object containing { size, status } or rejects with false
     */
    async checkURL(url, timeout = 10000) {
        return new Promise(async (resolve) => {
            try {
                const res = await (0, node_fetch_1.default)(url, { method: 'HEAD', timeout });
                if (res.status === 200) {
                    const contentLength = res.headers.get('content-length');
                    const size = contentLength ? parseInt(contentLength, 10) : 0;
                    resolve({ size, status: 200 });
                }
                else
                    resolve(false);
            }
            catch (e) {
                resolve(false);
            }
        });
    }
    /**
     * Tries each mirror in turn, constructing an URL (mirror + baseURL). If a valid
     * response is found (status=200), it returns the final URL and size. Otherwise, returns false.
     *
     * @param baseURL The relative path (e.g. "group/id/artifact.jar")
     * @param mirrors An array of possible mirror base URLs
     * @returns An object { url, size, status } if found, or false if all mirrors fail
     */
    async checkMirror(baseURL, mirrors) {
        for (const mirror of mirrors) {
            const testURL = `${mirror}/${baseURL}`;
            const res = await this.checkURL(testURL);
            if (res === false || res.status !== 200)
                continue;
            return {
                url: testURL,
                size: res.size,
                status: 200
            };
        }
        return false;
    }
}
exports.default = Downloader;

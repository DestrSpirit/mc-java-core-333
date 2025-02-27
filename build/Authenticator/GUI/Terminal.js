"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 * Fork author: Benjas333
 */
const prompt_1 = __importDefault(require("prompt"));
module.exports = async function (url) {
    console.log(`Open browser: ${url}`);
    prompt_1.default.start();
    const { 'copy-URL': copyUrl } = await prompt_1.default.get(['copy-URL']);
    return new URLSearchParams(copyUrl.split("?")[1]).get("code") || "cancel";
};

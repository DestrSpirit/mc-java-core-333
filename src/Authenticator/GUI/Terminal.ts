"use strict";
/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 * Fork author: Benjas333
 */

import prompt from 'prompt';

module.exports = async function (url: string) {
    console.log(`Open browser: ${url}`);
    prompt.start();
    const { 'copy-URL': copyUrl } = await prompt.get(['copy-URL']);
    return new URLSearchParams(copyUrl.split("?")[1]).get("code") || "cancel";
};

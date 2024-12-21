"use strict";
/**
 * @author Benjas333
 */

import prompt from 'prompt';

module.exports = async function (url: string) {
    console.log(`Open browser: ${url}`);
    prompt.start();
    const { 'copy-URL': copyUrl } = await prompt.get(['copy-URL']);
    return new URLSearchParams(copyUrl.split("?")[1]).get("code") || "cancel";
};

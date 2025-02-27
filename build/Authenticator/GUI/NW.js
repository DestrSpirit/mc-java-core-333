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
const path_1 = __importDefault(require("path"));
const defaultProperties = {
    width: 1000,
    height: 650,
    resizable: false,
    position: "center",
    frame: true,
    icon: path_1.default.join(__dirname, '../../../assets/icons/Microsoft.png')
};
module.exports = async function (url, doRemoveCookies = true) {
    if (doRemoveCookies) {
        await new Promise((resolve) => {
            //@ts-ignore
            nw.Window.get().cookies.getAll({ domain: "live.com" }, async (cookies) => {
                for await (let cookie of cookies) {
                    const cookieUrl = `http${cookie.secure ? "s" : ""}://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
                    //@ts-ignore
                    nw.Window.get().cookies.remove({ url: cookieUrl, name: cookie.name });
                }
                resolve();
            });
        });
    }
    return new Promise((resolve) => {
        //@ts-ignore
        nw.Window.open(url, defaultProperties, (Window) => {
            let code = "cancel";
            let interval = setInterval(() => {
                const currentUrl = Window.window.document.location.href;
                if (!currentUrl.startsWith("https://login.live.com/oauth20_desktop.srf"))
                    return;
                clearInterval(interval);
                const urlParams = new URLSearchParams(currentUrl.split("?")[1]);
                code = urlParams.get("code") || "cancel";
                Window.close();
            }, 100);
            Window.on('closed', () => {
                clearInterval(interval);
                resolve(code);
            });
        });
    });
};

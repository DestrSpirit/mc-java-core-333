"use strict";
/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 * Fork author: Benjas333
 */
const path = require('path');
const { app, BrowserWindow, session } = require('electron');
const defaultProperties = {
    width: 1000,
    height: 650,
    resizable: false,
    center: true,
    icon: path.join(__dirname, '../../../assets/icons', `Microsoft.${(process.platform === 'win32') ? 'ico' : 'png'}`),
};
module.exports = async function (url, doRemoveCookies = true) {
    await app.whenReady();
    if (doRemoveCookies) {
        const cookies = await session.defaultSession.cookies.get({ domain: 'live.com' });
        for (const cookie of cookies) {
            const cookieUrl = `http${cookie.secure ? "s" : ""}://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
            await session.defaultSession.cookies.remove(cookieUrl, cookie.name);
        }
    }
    return new Promise((resolve) => {
        const mainWindow = new BrowserWindow(defaultProperties);
        mainWindow.setMenu(null);
        mainWindow.loadURL(url);
        var loading = false;
        mainWindow.on("close", () => {
            if (!loading)
                resolve("cancel");
        });
        mainWindow.webContents.on("did-finish-load", () => {
            const currentUrl = mainWindow.webContents.getURL();
            if (!currentUrl.startsWith("https://login.live.com/oauth20_desktop.srf"))
                return;
            const code = new URLSearchParams(currentUrl.split("?")[1]).get("code");
            resolve(code || "cancel");
            loading = true;
            try {
                mainWindow.close();
            }
            catch {
                console.error("Failed to close window!");
            }
        });
    });
};

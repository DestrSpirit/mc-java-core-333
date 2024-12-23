"use strict";
/**
 * @author Benjas333
 */

import nodeFetch from 'node-fetch';
import crypto from 'crypto';


export default class Microsoft {
    client_id: string;
    type: 'electron' | 'nwjs' | 'terminal';

    constructor(client_id: string) {
        this.client_id = client_id || '00000000402b5328';

        if (!!process?.versions?.electron) {
            this.type = 'electron';
        } else if (!!process?.versions?.nw) {
            this.type = 'nwjs';
        } else {
            this.type = 'terminal';
        }
    }

    async getAuth(type: string, url: string, doRemoveCookies: boolean = true) {
        url = url || `https://login.live.com/oauth20_authorize.srf?client_id=${this.client_id}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=XboxLive.signin%20offline_access&cobrandid=8058f65d-ce06-4c30-9559-473c9275a65d&prompt=select_account`;
        type = type || this.type;

        let usercode;
        switch (type) {
            case "electron":
                usercode = await (require('./GUI/Electron.js'))(url, doRemoveCookies);
                break;
            case "nwjs":
                usercode = await (require('./GUI/NW.js'))(url, doRemoveCookies);
                break;
            case "terminal":
                usercode = await (require('./GUI/Terminal.js'))(url);
                break;
            default:
                break;
        }
        return !usercode || usercode === "cancel" ? false : await this.url(usercode);
    }

    async url(code: string) {
        let oauth2 = await nodeFetch("https://login.live.com/oauth20_token.srf", {
            method: "POST",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `client_id=${this.client_id}&code=${code}&grant_type=authorization_code&redirect_uri=https://login.live.com/oauth20_desktop.srf`
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (oauth2.error) return {
            ...oauth2,
            errorType: "oauth2"
        };

        return await this.getAccount(oauth2)
    }

    async refresh(acc: any) {
        let timeStamp = Math.floor(Date.now() / 1000)

        if (timeStamp < (acc?.meta?.access_token_expires_in - 7200)) {
            let profile = await this.getProfile(acc)
            acc.profile = {
                skins: profile.skins,
                capes: profile.capes
            }
            return acc;
        }

        let oauth2 = await nodeFetch("https://login.live.com/oauth20_token.srf", {
            method: "POST",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=refresh_token&client_id=${this.client_id}&refresh_token=${acc.refresh_token}`
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (oauth2.error) return {
            ...oauth2,
            errorType: "oauth2 refresh"
        };

        return await this.getAccount(oauth2);
    }

    async getAccount(oauth2: any) {
        let xboxLive = await nodeFetch("https://user.auth.xboxlive.com/user/authenticate", {
            method: "post",
            body: JSON.stringify({
                Properties: {
                    AuthMethod: "RPS",
                    SiteName: "user.auth.xboxlive.com",
                    RpsTicket: "d=" + oauth2.access_token
                },
                RelyingParty: "http://auth.xboxlive.com",
                TokenType: "JWT"
            }),
            headers: { "Content-Type": "application/json", Accept: "application/json" },
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (xboxLive.error) return {
            ...xboxLive,
            errorType: "Xbox Live Authentication"
        };

        let xsts = await nodeFetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Properties: {
                    SandboxId: "RETAIL",
                    UserTokens: [xboxLive.Token]
                },
                RelyingParty: "rp://api.minecraftservices.com/",
                TokenType: "JWT"
            })
        }).then(res => res.json());
        if (xsts.error) return {
            ...xsts,
            errorType: "xsts - Minecraft API"
        };

        let mcLogin = await nodeFetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ "identityToken": `XBL3.0 x=${xboxLive.DisplayClaims.xui[0].uhs};${xsts.Token}` })
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (mcLogin.error) return {
            ...mcLogin,
            errorType: "Minecraft Login"
        };

        let hasGame = await nodeFetch("https://api.minecraftservices.com/entitlements/mcstore", {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${mcLogin.access_token}`
            }
        }).then(res => res.json());
        if (!hasGame.items.find(i => i.name == "product_minecraft" || i.name == "game_minecraft")) {
            return {
                error: "You don't own the game",
                errorType: "game"
            };
        }

        let profile = await this.getProfile(mcLogin);
        if (profile.error) return {
            ...profile,
            errorType: "profile"
        };

        return {
            access_token: mcLogin.access_token,
            client_token: crypto.randomBytes(16).toString('hex'),
            uuid: profile.id,
            name: profile.name,
            refresh_token: oauth2.refresh_token,
            user_properties: '{}',
            meta: {
                type: "Xbox",
                access_token_expires_in: mcLogin.expires_in + Math.floor(Date.now() / 1000),
                demo: false
            },
            profile: {
                skins: profile.skins,
                capes: profile.capes
            }
        }
    }

    async getProfile(mcLogin: any) {
        let profile = await nodeFetch("https://api.minecraftservices.com/minecraft/profile", {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${mcLogin.access_token}`
            }
        }).then(res => res.json()).catch(err => { return { error: err } });;
        if (profile.error) return profile

        let skins = profile.skins;
        let capes = profile.capes;

        for (let skin of skins) {
            skin.base64 = `data:image/png;base64,${await getBass64(skin.url)}`
        }
        for (let cape of capes) {
            cape.base64 = `data:image/png;base64,${await getBass64(cape.url)}`
        }

        return {
            id: profile.id,
            name: profile.name,
            skins: profile.skins || [],
            capes: profile.capes || []
        }
    }
}

async function getBass64(url: string) {
    let response = await nodeFetch(url);
    let buffer = await response.buffer();
    return buffer.toString('base64');
}

"use strict";
/**
 * @author Benjas333
 */

import nodeFetch from 'node-fetch';
import crypto from 'crypto';


export default class Microsoft {
    client_id: string;
    type: 'electron' | 'nwjs' | 'terminal';
    doIncludeXboxAccount: boolean;

    constructor(client_id: string, doIncludeXboxAccount: boolean = true) {
        this.client_id = client_id || '00000000402b5328';
        this.doIncludeXboxAccount = doIncludeXboxAccount;

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

        return await this.getAccount(oauth2);
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

    async getAccount(oauth2: any, doIncludeXboxAccount: boolean = this.doIncludeXboxAccount) {
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
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (xsts.error || xsts.XErr) return {
            ...xsts,
            errorType: "xsts - Minecraft API",
            errorMessage: xsts.XErr ? await knownTokenErrors(xsts.XErr) : 'No XErr code provided.'
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

        let response = {
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
            xboxAccount: null,
            profile: {
                skins: profile.skins,
                capes: profile.capes
            }
        }
        if (doIncludeXboxAccount) {
            response.xboxAccount = await this.getXboxAccount(xboxLive.Token);
        }
        return response;
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

    async getXboxAccount(accessToken: string) {
        let xboxAccount = await nodeFetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Properties: {
                    SandboxId: "RETAIL",
                    UserTokens: [accessToken]
                },
                RelyingParty: "http://xboxlive.com",
                TokenType: "JWT"
            })
        }).then(res => res.json()).catch(err => { return { error: err } });
        if (xboxAccount.error) {
            return {
                ...xboxAccount,
                errorType: "Get Xbox Account"
            };
        }
        return {
            xuid: xboxAccount.DisplayClaims.xui[0].xid,
            gamertag: xboxAccount.DisplayClaims.xui[0].gtg,
            ageGroup: xboxAccount.DisplayClaims.xui[0].agg,
        };
    }
}

async function getBass64(url: string) {
    let response = await nodeFetch(url);
    let buffer = await response.buffer();
    return buffer.toString('base64');
}

async function knownTokenErrors(errorCode: Number) {
    switch (errorCode) {
        case 2148916227:
            return 'ENFORCEMENT_BAN';
        case 2148916229:
            return 'ACCOUNT_PARENTALLY_RESTRICTED';
        case 2148916233:
            return 'The user does not currently have an Xbox profile - https://signup.live.com/signup - ACCOUNT_CREATION_REQUIRED';
        case 2148916234:
            return 'ACCOUNT_TERMS_OF_USE_NOT_ACCEPTED';
        case 2148916235:
            return 'ACCOUNT_COUNTRY_NOT_AUTHORIZED';
        case 2148916236:
            return 'ACCOUNT_AGE_VERIFICATION_REQUIRED';
        case 2148916237:
            return 'ACCOUNT_UNDER_CURFEW';
        case 2148916238:
            return 'The account date of birth is under 18 years and cannot proceed unless the account is added to a Family by an adult - ACCOUNT_CHILD_NOT_IN_FAMILY'; // User is under 18
        case 2148916239:
            return 'ACCOUNT_CSV_TRANSITION_REQUIRED';
        case 2148916240:
            return 'ACCOUNT_MAINTENANCE_REQUIRED';
        case 2148916243:
            return 'ACCOUNT_NAME_CHANGE_REQUIRED';
        case 2148916242:
            return 'CONTENT_ISOLATION (Verify SCID / Sandbox)';
        case 2148916255:
            return 'EXPIRED_SERVICE_TOKEN';
        case 2148916258:
            return 'EXPIRED_USER_TOKEN';
        case 2148916257:
            return 'EXPIRED_TITLE_TOKEN';
        case 2148916256:
            return 'EXPIRED_DEVICE_TOKEN';
        case 2148916259:
            return 'INVALID_DEVICE_TOKEN';
        case 2148916260:
            return 'INVALID_TITLE_TOKEN';
        case 2148916261:
            return 'INVALID_USER_TOKEN';
        default:
            return `Unknown error code (${errorCode})`;
    }
}

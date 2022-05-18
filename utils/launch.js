'use strict';
// import librairies nodejs
const path = require('path');
const fetch = require('node-fetch');

//import modules minecraft-java-core
const gameJsonMinecraft = require('./Minecraft-utils/Minecraft-Json');
const gameAssetsMinecraft = require('./Minecraft-utils/Minecraft-Assets');
const gameLibrariesMinecraft = require('./Minecraft-utils/Minecraft-Libraries');
const gameVerifyMinecraft = require('./Minecraft-utils/Minecraft-Verify');

class Launch {
    async Launch(config = {}) {
        this.config = {
            url: config.url ? config.url : null,
            authenticator: config.authenticator ? config.authenticator : null,
            path: path.resolve(config.path ? config.path : './Minecraft').replace(/\\/g, '/'),
            version: config.version ? config.version : 'latest_release',
            detached: config.detached ? config.detached : false,

            custom: config.custom ? config.custom : false,
            verify: config.verify ? config.verify : false,
            ignored: config.ignored ? config.ignored : [],
            args: config.args ? config.args : [],

            javaPath: config.javaPath ? config.javaPath : null,
            java: config.java ? config.java : true,

            memory: {
                min: config.memory?.min ? config.memory.min : '1G',
                max: config.memory?.max ? config.memory.max : '2G'
            }
        }

        let gameJson = await this.GetJsonVersion();
        let gameAssets = await new gameAssetsMinecraft(gameJson.json.assetIndex.url).Getassets();
        let gameLibraries = await new gameLibrariesMinecraft(gameJson.json).Getlibraries();
        let gameVerify = await new gameVerifyMinecraft([...gameLibraries, ...gameAssets.assets], this.config).checkBundle();
        return gameVerify
    }

    async GetJsonVersion() {
        let InfoVersion = await new gameJsonMinecraft(this.config.version).GetInfoVersion();
        if (InfoVersion.error) {
            return InfoVersion;
        }
        let json = await fetch(InfoVersion.url).then(res => res.json());
        return { InfoVersion: InfoVersion, json: json };
    }
}
module.exports = Launch;
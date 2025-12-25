"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = void 0;
const livekit_server_sdk_1 = require("livekit-server-sdk");
const config_1 = require("../config");
const generateToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName, username, role } = req.body;
    if (!roomName || !username) {
        return res.status(400).json({ error: 'Room name and Username are required' });
    }
    try {
        const at = new livekit_server_sdk_1.AccessToken(config_1.config.livekit.apiKey, config_1.config.livekit.apiSecret, {
            identity: username,
        });
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true, // Default to true, can be restricted based on role
            canSubscribe: true,
        });
        const token = yield at.toJwt();
        return res.json({ token });
    }
    catch (err) {
        console.error('Token generation error:', err);
        return res.status(500).json({ error: 'Failed to generate token' });
    }
});
exports.generateToken = generateToken;

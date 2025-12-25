import { AccessToken } from 'livekit-server-sdk';
import { config } from '../config';

export const createLiveKitToken = async (username: string, roomName: string) => {
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
        identity: username,
    });

    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
    });

    return await at.toJwt();
};

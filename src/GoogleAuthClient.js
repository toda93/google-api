import HttpClient from '@azteam/http-client';


const END_POINT = 'https://www.googleapis.com/oauth2/v3';

class GoogleAuthClient {
    constructor(appSecret, appIds = []) {
        this.client = new HttpClient();
        this.appIds = appIds;
        this.appSecret = appSecret;
    }

    async getProfileInApp(token) {
        const res = await this.client.get(`${END_POINT}/tokeninfo`, {
            id_token: token
        });


        if (res.azp && appIds.includes(res.azp)) {
            return {
                id: res.sub,
                email: res.email,
                name: res.name,
                avatar: res.picture
            }
        }
        return null;
    }

}

export default GoogleAuthClient;
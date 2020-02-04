import querystring from 'querystring';

import HttpClient from '@azteam/http-client';
import {ErrorException} from '@azteam/error';

const OAUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth';
const OAUTH_TOKEN_ENDPOINT = 'https://www.googleapis.com/oauth2/v4/token';

class GoogleOAuth2API {
    constructor(option) {
        option = {
            token: null,
            redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
            ...option
        };

        if (!option.client_id || !option.client_secret) {
            throw new ErrorException('GOOGLE_OAUTH_INIT', {
                msg: 'client ID or client secret not found'
            });
        }
        this.client_id = option.client_id;
        this.client_secret = option.client_secret;
        this.redirect_uri = option.redirect_uri;
        this.scope = option.scope;
        this.token = option.token;
    }

    getTimeNow() {
        return Math.round((new Date()).getTime() / 1000);
    }

    getUrlAuthCode() {
        const params = {
            response_type: 'code',
            access_type: 'offline',
            client_id: this.client_id,
            redirect_uri: this.redirect_uri,
            scope: this.scope,
        };
        return `${OAUTH_ENDPOINT}?${querystring.stringify(params)}`;
    }

    async getTokenByCode(code) {
        const client = new HttpClient();

        const json = await client.responseJSON().post(OAUTH_TOKEN_ENDPOINT, {
            code,
            client_id: this.client_id,
            client_secret: this.client_secret,
            grant_type: 'authorization_code',
            access_type: 'offline',
            redirect_uri: this.redirect_uri,
        });
        if (json.expires_in) {
            json.expired = this.getTimeNow() + (json.expires_in - 500);

            this.token = json;
            return this.token;
        }
        throw new ErrorException('GOOGLE_OAUTH_VERIFY_CODE', json);
    }

    async refreshToken() {
        if (!this.token) {
            throw new ErrorException('GOOGLE_OAUTH_REFRESH_TOKEN', {
                msg: 'No token'
            });
        }

        if (!this.token.expired || this.token.expired <= this.getTimeNow()) {

            const client = new HttpClient();

            const json = await client.responseJSON().post(OAUTH_TOKEN_ENDPOINT, {
                refresh_token: this.token.refresh_token,
                client_id: this.client_id,
                client_secret: this.client_secret,
                grant_type: 'refresh_token',
            });
            if (!json.expires_in) {
                throw new ErrorException('GOOGLE_OAUTH_REFRESH_TOKEN', json);

            }
            this.token.access_token = json.access_token;
            this.token.token_type = json.token_type;
            this.token.expired = this.getTimeNow() + (json.expires_in - 500);
        }
        return this.token;
    }
}

export default GoogleOAuth2API;
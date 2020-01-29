import mime from 'mime-types';
import fs from 'fs';
import path from 'path';
import readChunk from 'read-chunk';
import HttpClient from 'toda-http-client';
import {ErrorException} from 'toda-error';

import GoogleOAuth2API from './GoogleOAuth2API';

const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const TEAM_DRIVE_ENDPOINT = 'https://www.googleapis.com/drive/v3/teamdrives';


class GoogleDriveAPI extends GoogleOAuth2API {
    async createFolder(name, parent = null) {
        const client = await this._getClient();

        const metadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parent) {
            metadata.parents = [parent];
        }

        return client.postJSON(DRIVE_ENDPOINT, metadata);
    }

    async findFolder(name) {
        const client = await this._getClient();

        const json = await client.responseJSON().get(DRIVE_ENDPOINT, {
            q: `name = "${name}" and trashed = false`,
            files: 'files(id,name)',
        });

        if (json.files.length > 0) {
            return json.files[0];
        }
        return null;
    }

    async getFolderTeam() {
        const client = await this._getClient();
        const json = await client.responseJSON().get(TEAM_DRIVE_ENDPOINT);
        if (json.teamDrives && json.teamDrives.length > 0) {
            return json.teamDrives[0].id;
        }
        return null;
    }

    async moveFileToFolder(file_id, folder_id) {
        const client = await this._getClient();
        const json = await client.patchQueryUrl(`${DRIVE_ENDPOINT}/${file_id}`, {
            addParents: folder_id,
            supportsAllDrives: true,
            supportsTeamDrives: true,
            alt: 'json',
        });
        return json;
    }

    async upload(file, options = {}) {

        if (fs.existsSync(file)) {
            options.file_size = fs.statSync(file).size;
            options.mime_type = mime.contentType(path.extname(file));
            options.name = options.name ? options.name : path.basename(file);

            if (options.file_size >= 4000000) {
                return this._resumableUpload(file, options);
            } else {
                return this._multipartUpload(file, options);
            }
        }

        throw new ErrorException('GOOGLE_DRIVE_UPLOAD', `File not ${file} exists`);
    }

    async _multipartUpload(file, options = {}) {

        const metadata = {
            name: options.name,
            mimeType: options.mime_type
        };
        if (options.parent) {
            metadata.parents = [options.parent];
        }

        const data = [
            {
                'Content-Disposition': 'application/json; charset=UTF-8',
                body: JSON.stringify(metadata)
            },
            {
                'content-type': options.mime_type,
                body: fs.createReadStream(file)
            }
        ];
        const client = await this._getClient();
        return await client.postMultipart(UPLOAD_ENDPOINT + '?uploadType=multipart', data);
    }

    async _resumableUpload(file, options = {}) {
        const metadata = {
            name: options.name,
            mimeType: options.mime_type
        };
        if (options.parent) {
            metadata.parents = [options.parent];
        }
        const client = await this._getClient();
        let res = await client.noFollow()
            .responseFull()
            .addHeader('Content-Type', 'application/json; charset=UTF-8')
            .addHeader('X-Upload-Content-Type', options.mime_type)
            .addHeader('X-Upload-Content-Length', options.file_size)
            .postJSON(UPLOAD_ENDPOINT + '?uploadType=resumable', metadata);

        if (res.headers.location) {
            const resumable_url = res.headers.location;
            const chunk_size = 4 * 1024 * 1024;
            let start = 0;

            while (start < options.file_size) {
                const chunk = readChunk.sync(file, start, chunk_size);
                const end = start + chunk.length - 1;
                const range = `bytes ${start}-${end}/${options.file_size}`;
                start = end + 1;

                let retry = 0;
                let res = null;
                do {
                    res = await client.responseFull()
                        .addHeader('Content-Length', chunk.length)
                        .addHeader('Content-Range', range)
                        .putRaw(resumable_url, chunk);
                    if (res.headers.range) {
                        retry = 100;
                        const current_upload = Number(res.headers.range.replace('bytes=0-', ''));
                        const process = 100 * current_upload / options.file_size;

                        console.log('Uploading: ', `${process.toFixed(2)}%`);
                    } else if(res.statusCode === 200) {
                        retry = 100;
                    }else {
                        console.log(`Error ${res.statusCode}: wait retry ${retry}`);
                        await timeout(1000);
                        retry++;

                    }
                } while (retry < 5);
                if (retry !== 100) {
                    console.error('error upload drive', res.statusCode, range, res.headers);
                }
            }

            const data = await client.responseFull()
                .addHeader('Content-Length', 0)
                .addHeader('Content-Range', `bytes */${options.file_size}`)
                .put(resumable_url);

            if (data.body) {
                return JSON.parse(data.body);
            }
            console.error('file size', options.file_size);
            console.error('error success drive', data.statusCode, data.headers);
            return false;
        }
        return false;
    }

    async _getClient() {
        const token = await this.refreshToken();

        console.log('token', token);

        return new HttpClient({
            headers: {
                'Authorization': `${token.token_type} ${token.access_token}`
            }
        });
    }
}

export default GoogleDriveAPI;


function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
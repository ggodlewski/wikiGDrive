'use strict';

// https://developers.google.com/drive/api/v3/reference

import {Logger} from 'winston';
import {OAuth2Client} from 'google-auth-library/build/src/auth/oauth2client';
import {Writable} from 'stream';
import {GoogleFile, MimeToExt, MimeTypes, SimpleFile} from '../model/GoogleFile';
import {Drive} from '../containers/folder_registry/FolderRegistryContainer';
import {FileId} from '../model/model';
import {driveFetch, driveFetchStream} from './driveFetch';
import {HasQuotaLimiter} from './AuthClient';

export interface Changes {
  token: string;
  files: GoogleFile[];
}

export interface ListContext {
  folderId?: string;
  fileId?: string;
  modifiedTime?: string;
  driveId?: string;
  retries?: number;
  // parentName?: string;
}

function apiFileToGoogleFile(apiFile): GoogleFile {
  const googleFile: GoogleFile = <GoogleFile>Object.assign({}, apiFile, {
    parentId: (apiFile.parents && apiFile.parents.length > 0) ? apiFile.parents[0] : undefined,
    size: apiFile.size ? +apiFile.size : undefined
  });

  if (googleFile['lastModifyingUser']) {
    googleFile.lastAuthor = apiFile['lastModifyingUser'].emailAddress
      ? `${apiFile['lastModifyingUser'].displayName} <${apiFile['lastModifyingUser'].emailAddress}>`
      : apiFile['lastModifyingUser'].displayName;
  }

  return googleFile;
}

export class GoogleDriveService {

  constructor(private logger: Logger) {
  }

  async getStartTrackToken(auth: OAuth2Client & HasQuotaLimiter, driveId?: string): Promise<string> {
    const params = {
      supportsAllDrives: true,
      driveId: undefined
    };

    if (driveId) {
      params.driveId = driveId;
    }

    const res = await driveFetch(auth, 'GET', 'https://www.googleapis.com/drive/v3/changes/startPageToken', params);
    return res.startPageToken;
  }

  async subscribeWatch(auth: OAuth2Client & HasQuotaLimiter, pageToken: string, driveId?: string) {
    try {
      const params = {
        pageToken,
          supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'newStartPageToken, nextPageToken, changes( file(id, name, mimeType, modifiedTime, size, md5Checksum, lastModifyingUser, parents, version, exportLinks, trashed), removed)',
        includeRemoved: true,
        driveId: driveId ? driveId : undefined
      };
      return await driveFetch(auth, 'POST', 'https://www.googleapis.com/drive/v3/changes/watch', params);
    } catch (err) {
      err.message = 'Error watching: ' + err.message;
      throw err;
    }
  }

  async watchChanges(auth: OAuth2Client & HasQuotaLimiter, pageToken: string, driveId?: string): Promise<Changes> {
    try {
      const params = {
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: 'newStartPageToken, nextPageToken, changes( file(id, name, mimeType, modifiedTime, size, md5Checksum, lastModifyingUser, parents, version, exportLinks, trashed), removed)',
        includeRemoved: true,
        driveId: driveId ? driveId : undefined
      };
      const res = await driveFetch(auth, 'GET', 'https://www.googleapis.com/drive/v3/changes', params);

      const files = res.changes
        .filter(change => !!change.file)
        .map(change => {
          if (change.removed) {
            change.file.trashed = true;
          }
          return change.file;
        })
        .map(apiFile => apiFileToGoogleFile(apiFile));

      return {
        token: res.nextPageToken || res.newStartPageToken,
        files: files
      };
    } catch (err) {
      err.message = 'Error watching changes: ' + err.message;
      throw err;
    }
  }

  async listFiles(auth: OAuth2Client & HasQuotaLimiter, context: ListContext, pageToken?: string) {
    let query = '';

    if (context.folderId) {
      query += ' \'' + context.folderId + '\' in parents and trashed = false';
    }
    if (context.fileId) {
      query += ' \'' + context.fileId + '\' = id and trashed = false';
    }
    if (context.modifiedTime) {
      query += ' and ( modifiedTime > \'' + context.modifiedTime + '\' or mimeType = \'' + MimeTypes.FOLDER_MIME + '\' )';
    }

    const listParams = {
      corpora: context.driveId ? 'drive' : 'allDrives',
      q: query,
      pageToken: pageToken,
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum, lastModifyingUser, version, exportLinks, trashed, parents)',
      // fields: 'nextPageToken, files(*)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      orderBy: 'modifiedTime desc',
      driveId: context.driveId ? context.driveId : undefined
    };

    try {
      const res = await driveFetch(auth, 'GET', 'https://www.googleapis.com/drive/v3/files', listParams);

      const apiFiles = [];

      if (res.nextPageToken) {
        const nextFiles = await this.listFiles(auth, context, res.nextPageToken);
        apiFiles.push(...nextFiles);
      }
      apiFiles.push(...res.files);

      return apiFiles.map(apiFile => apiFileToGoogleFile(apiFile));
    } catch (err) {
      err.message = 'Error listening directory ' + context.folderId;
      err.folderId = context.folderId;
      throw err;
    }
  }

  async listPermissions(auth: OAuth2Client & HasQuotaLimiter, fileId: string, pageToken?: string) {
    const params = {
      fileId: fileId,
      supportsAllDrives: true,
      // fields: 'id, name, mimeType, modifiedTime, size, md5Checksum, lastModifyingUser, version, exportLinks, trashed, parents'
      fields: '*',
      pageToken: pageToken
    };
    const res = await driveFetch(auth, 'GET', `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, params);

    const permissions = [];

    if (res.nextPageToken) {
      const nextItems = await this.listPermissions(auth, fileId, res.nextPageToken);
      permissions.push(...nextItems);
    }
    permissions.push(...res.permissions);

    return permissions;
  }

  async getFile(auth: OAuth2Client & HasQuotaLimiter, fileId: FileId) {
    try {
      const params = {
        fileId: fileId,
        supportsAllDrives: true,
        // fields: 'id, name, mimeType, modifiedTime, size, md5Checksum, lastModifyingUser, version, exportLinks, trashed, parents'
        fields: '*'
      };
      const res = await driveFetch(auth, 'GET', `https://www.googleapis.com/drive/v3/files/${fileId}`, params);

      return apiFileToGoogleFile(res);
    } catch (err) {
      err.message = 'Error downloading fileId: ' + fileId + ': ' + err.message;
      throw err;
    }
  }

  async download(auth: OAuth2Client & HasQuotaLimiter, file: SimpleFile, dest: Writable) {
    try {
      const params = {
        fileId: file.id,
        alt: 'media',
        supportsAllDrives: true
      };
      const res = await driveFetchStream(auth, 'GET', `https://www.googleapis.com/drive/v3/files/${file.id}`, params);

      return new Promise<void>((resolve, reject) => {
        res
            .on('end', () => {
              resolve();
            })
            .on('error', err => {
              reject(err);
            })
            .pipe(dest);
      });
    } catch (err) {
      err.message = 'Error download file: ' + file.id + ' ' + err.message;
      err.file = file;
      throw err;
    }
  }

  async exportDocument(auth: OAuth2Client & HasQuotaLimiter, file: SimpleFile, dest: Writable) {
    const ext = MimeToExt[file.mimeType] || '.bin';

    try {
      const params = {
        fileId: file.id,
        mimeType: file.mimeType,
        // includeItemsFromAllDrives: true,
        // supportsAllDrives: true
      };
      const res = await driveFetchStream(auth, 'GET', `https://www.googleapis.com/drive/v3/files/${file.id}/export`, params);

      return await new Promise((resolve, reject) => {
        let stream = res
          .on('error', err => {
            reject(err);
          });

        if (Array.isArray(dest)) {
          dest.forEach(pipe => stream = stream.pipe(pipe));
          stream.on('finish', () => {
            this.logger.info('Exported document: ' + file.id + ext + ' [' + file.name + ']');
            resolve(file);
          });
        } else {
          stream.pipe(dest);
          dest.on('finish', () => {
            this.logger.info('Exported document: ' + file.id + ext + ' [' + file.name + ']');
            resolve(file);
          });
        }
      });
    } catch (err) {
      if (!err.isQuotaError && err?.code != 404) {
        this.logger.error(err.message);
      }
      err.message = 'Error export document ' + (err.isQuotaError ? '(quota)' : '') + ': ' + file.id + ' ' + file.name;
      err.file = file;
      throw err;
    }
  }

  async about(auth: OAuth2Client & HasQuotaLimiter) {
    const params = {
      fields: '*'
    };
    return await driveFetch(auth, 'GET', 'https://www.googleapis.com/drive/v3/about', params);
  }

  async listDrives(auth: OAuth2Client & HasQuotaLimiter, pageToken?: string): Promise<Drive[]> {
    const listParams = {
      pageSize: 100,
      pageToken: pageToken
    };

    try {
      const res = await driveFetch(auth, 'GET', 'https://www.googleapis.com/drive/v3/drives', listParams);
      const drives = res.drives.map(drive => {
        return {
          id: drive.id,
          name: drive.name,
          kind: drive.kind
        };
      });

      if (res.nextPageToken) {
        const nextDrives = await this.listDrives(auth, res.nextPageToken);
        return drives.concat(nextDrives);
      } else {
        return drives;
      }
    } catch (err) {
      err.message = 'Error listening drives: ' + err.message;
      throw err;
    }
  }

  async getDrive(auth: OAuth2Client & HasQuotaLimiter, driveId: FileId): Promise<Drive> {
    const params = {
      driveId
    };
    const res = await driveFetch(auth, 'GET', `https://www.googleapis.com/drive/v3/drives/${driveId}`, params);
    return {
      id: driveId,
      name: res.name,
      kind: res.kind
    };
  }

  async shareDrive(auth: OAuth2Client & HasQuotaLimiter, fileId: string, email: string) {
    const params = {
      requestBody: {
        type: 'user',
        role: 'reader',
        emailAddress: email
      },
      fileId,
      fields: 'id',
    };
    return await driveFetch(auth, 'GET', `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, params);
  }
}

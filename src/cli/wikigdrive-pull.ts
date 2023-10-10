'use strict';

import path from 'path';
import minimist from 'minimist';
import dotenv from 'dotenv';
import {fileURLToPath} from 'url';

import {addTelemetry} from '../telemetry';
import {GoogleApiContainer} from '../containers/google_api/GoogleApiContainer';
import {getAuthConfig} from './getAuthConfig';
import {urlToFolderId} from '../utils/idParsers';
import {GoogleFolderContainer} from '../containers/google_folder/GoogleFolderContainer';
import {TransformContainer} from '../containers/transform/TransformContainer';
import {FolderRegistryContainer} from '../containers/folder_registry/FolderRegistryContainer';
import {usage} from './usage';
import {initEngine} from './initEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.GIT_SHA = process.env.GIT_SHA || 'dev';

dotenv.config();
await addTelemetry(process.env.ZIPKIN_SERVICE || 'wikigdrive', __dirname);

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (argv._.length < 1 || argv.h || argv.help) {
    await usage(__filename);
    process.exit(0);
  }

  const args = argv._.slice(1);

  const folderId = urlToFolderId(args[0]);
  if (!folderId) {
    throw new Error('No folderId');
  }

  // PWD is null on Windows, so we can set it here
  process.env.PWD = process.cwd();

  const filesIds = args.slice(1);
  const workdir = argv['workdir'] || process.env.WIKIGDRIVE_WORKDIR || '/data';

  const {mainFileService, containerEngine, logger} = await initEngine(workdir);

  const params = {
    client_id: argv['client_id'] || process.env.CLIENT_ID,
    client_secret: argv['client_secret'] || process.env.CLIENT_SECRET,
    service_account: argv['service_account'] || null,
  };
  const authConfig = await getAuthConfig(params, mainFileService);

  const apiContainer = new GoogleApiContainer({ name: 'google_api' }, authConfig);
  await apiContainer.mount(await mainFileService);
  await containerEngine.registerContainer(apiContainer);
  await apiContainer.run();

  const folderRegistryContainer = new FolderRegistryContainer({ name: 'folder_registry' });
  await folderRegistryContainer.mount(await mainFileService);
  await containerEngine.registerContainer(folderRegistryContainer);
  await folderRegistryContainer.run();

  const googleFileSystem = await mainFileService.getSubFileService(folderId, '/');
  const transformFileSystem = await mainFileService.getSubFileService(folderId + '_transform', '/');

  logger.info('Downloading');
  const downloadContainer = new GoogleFolderContainer({
    cmd: 'pull',
    name: folderId,
    folderId: folderId,
    apiContainer: 'google_api'
  }, { filesIds });

  await downloadContainer.mount(googleFileSystem);
  await containerEngine.registerContainer(downloadContainer);
  await downloadContainer.run();
  await containerEngine.unregisterContainer(downloadContainer.params.name);

  logger.info('Transforming');
  const transformContainer = new TransformContainer({ name: folderId }, { filesIds });
  await transformContainer.mount2(googleFileSystem, transformFileSystem);

  await containerEngine.registerContainer(transformContainer);
  await transformContainer.run(folderId);
  await containerEngine.unregisterContainer(transformContainer.params.name);

  await containerEngine.flushData();
}

try {
  await main();
  process.exit(0);
} catch (err) {
  if (err.isUsageError) {
    console.error(err.message);
    await usage(__filename);
  } else {
    console.error(err);
  }
  process.exit(1);
}

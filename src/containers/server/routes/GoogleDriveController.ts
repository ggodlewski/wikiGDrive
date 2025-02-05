import {Controller, RouteErrorHandler, RouteGet, RouteParamPath, RouteResponse} from './Controller';
import {FileContentService} from '../../../utils/FileContentService';
import {addPreviewUrl, getCachedChanges, outputDirectory, ShareErrorHandler} from './FolderController';
import {UserConfigService} from '../../google_folder/UserConfigService';
import {MarkdownTreeProcessor} from '../../transform/MarkdownTreeProcessor';
import {getContentFileService} from '../../transform/utils';
import {GoogleTreeProcessor} from '../../google_folder/GoogleTreeProcessor';

export class GoogleDriveController extends Controller {

  constructor(subPath: string, private readonly filesService: FileContentService, private readonly authContainer) {
    super(subPath);
  }

  @RouteGet('/:driveId/:fileId')
  @RouteResponse('stream')
  @RouteErrorHandler(new ShareErrorHandler())
  async getDocs(@RouteParamPath('driveId') driveId: string, @RouteParamPath('fileId') fileId: string) {
    const googleFileSystem = await this.filesService.getSubFileService(driveId, '/');
    const userConfigService = new UserConfigService(googleFileSystem);
    await userConfigService.load();
    const transformedFileSystem = await this.filesService.getSubFileService(driveId + '_transform', '');
    const contentFileService = await getContentFileService(transformedFileSystem, userConfigService);

    const markdownTreeProcessor = new MarkdownTreeProcessor(contentFileService);
    await markdownTreeProcessor.load();
    const [foundTreeItem] = await markdownTreeProcessor.findById(fileId);

    if (!foundTreeItem) {
      this.res.status(404).send({ message: 'No local' });
      return;
    }

    const treeItem = addPreviewUrl(userConfigService.config.hugo_theme, driveId)(foundTreeItem);

    const contentDir = userConfigService.config.transform_subdir ? '/' + userConfigService.config.transform_subdir : '/';

    this.res.setHeader('wgd-content-dir', contentDir);
    this.res.setHeader('wgd-google-parent-id', treeItem.parentId || '');
    this.res.setHeader('wgd-google-id', treeItem.id || '');
    this.res.setHeader('wgd-google-version', treeItem.version || '');
    this.res.setHeader('wgd-google-modified-time', treeItem.modifiedTime || '');
    this.res.setHeader('wgd-path', treeItem.path || '');
    this.res.setHeader('wgd-file-name', treeItem.fileName || '');
    this.res.setHeader('wgd-mime-type', treeItem.mimeType || '');
    this.res.setHeader('wgd-preview-url', treeItem.previewUrl || '');
    this.res.setHeader('wgd-last-author', treeItem.lastAuthor || '');

    const treeProcessor = new GoogleTreeProcessor(googleFileSystem);
    await treeProcessor.load();
    const [leaf] = await treeProcessor.findById(foundTreeItem.id);

    if (leaf) {
      this.res.setHeader('wgd-synced-version', leaf.version || '');
      this.res.setHeader('wgd-synced-modified-time', leaf.modifiedTime || '');
    }

    const changes = await getCachedChanges(this.logger, transformedFileSystem, contentFileService, googleFileSystem);
    const change = changes.find(change => change.path === (contentDir + treeItem.path).replace(/^\//, ''));
    if (change) {
      if (change.state.isNew) {
        treeItem['status'] = 'N';
      } else
      if (change.state.isModified) {
        treeItem['status'] = 'M';
      } else
      if (change.state.isDeleted) {
        treeItem['status'] = 'D';
      }
    }
    this.res.setHeader('wgd-git-status', treeItem['status'] || '');

    const filePath = contentDir + treeItem.path;
    if (!await transformedFileSystem.exists(filePath)) {
      this.res.status(404).send('Not exist in transformedFileSystem');
      return;
    }
    if (await transformedFileSystem.isDirectory(filePath)) {
      await outputDirectory(this.res, treeItem);
      return;
    } else {
      if (treeItem.mimeType) {
        this.res.setHeader('Content-type', treeItem.mimeType);
      }

      const buffer = await transformedFileSystem.readBuffer(filePath);
      this.res.send(buffer);
      return;
    }
  }

}

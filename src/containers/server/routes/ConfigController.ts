import {Controller, RouteGet, RouteParamBody, RouteParamPath, RoutePost, RoutePut} from './Controller';
import {FileContentService} from '../../../utils/FileContentService';
import {GitScanner} from '../../../git/GitScanner';
import {UserConfigService} from '../../google_folder/UserConfigService';
import {FolderRegistryContainer} from '../../folder_registry/FolderRegistryContainer';
import {ContainerEngine} from '../../../ContainerEngine';

export interface ConfigBody {
  config: {
    remote_branch: string;
    config_toml?: string;
    transform_subdir?: string;
    hugo_theme: HugoTheme;
    auto_sync: boolean;
    fm_without_version: boolean;
    actions_yaml?: string;
  };
  remote_url: string;
}

export interface HugoTheme {
  id: string;
  name: string;
  url: string;
  preview_img: string;
}

async function loadHugoThemes(filesService: FileContentService) {
  if (!await filesService.exists('hugo_themes.json')) {
    await filesService.writeJson('hugo_themes.json', [{
      id: 'ananke',
      name: 'Anake',
      url: 'https://github.com/budparr/gohugo-theme-ananke.git',
      preview_img: 'https://raw.githubusercontent.com/budparr/gohugo-theme-ananke/master/images/screenshot.png'
    }]);
  }
  return await filesService.readJson('hugo_themes.json');
}

export class ConfigController extends Controller {

  constructor(subPath: string, private readonly filesService: FileContentService, private folderRegistryContainer: FolderRegistryContainer, private engine: ContainerEngine) {
    super(subPath);
  }

  async returnConfig(userConfigService: UserConfigService) {
    const hugo_themes = await loadHugoThemes(this.filesService);

    return {
      config: userConfigService.config,
      public_key: await userConfigService.getDeployKey(),
      hugo_themes
    };
  }

  @RouteGet('/:driveId')
  async getConfig(@RouteParamPath('driveId') driveId: string) {
    const transformedFileSystem = await this.filesService.getSubFileService(driveId + '_transform', '');

    const gitScanner = new GitScanner(this.logger, transformedFileSystem.getRealPath(), 'wikigdrive@wikigdrive.com');
    await gitScanner.initialize();

    const googleFileSystem = await this.filesService.getSubFileService(driveId, '');
    const userConfigService = new UserConfigService(googleFileSystem);
    await userConfigService.load();

    return {
      ...await this.returnConfig(userConfigService),
      remote_url: await gitScanner.getRemoteUrl()
    };
  }

  @RoutePut('/:driveId')
  async putConfig(@RouteParamPath('driveId') driveId: string, @RouteParamBody() body: ConfigBody) {
    const transformedFileSystem = await this.filesService.getSubFileService(driveId + '_transform', '');

    const gitScanner = new GitScanner(this.logger, transformedFileSystem.getRealPath(), 'wikigdrive@wikigdrive.com');
    await gitScanner.initialize();

    const googleFileSystem = await this.filesService.getSubFileService(driveId, '');
    const userConfigService = new UserConfigService(googleFileSystem);
    await userConfigService.load();

    if (body.config?.remote_branch) {
      userConfigService.config.remote_branch = body.config?.remote_branch || 'master';
    }
    if (body.config?.hugo_theme) {
      userConfigService.config.hugo_theme = body.config?.hugo_theme;
    }
    if (body.config?.config_toml) {
      userConfigService.config.config_toml = body.config?.config_toml;
    }
    let modified = false;
    if ('string' === typeof body.config?.transform_subdir) {
      let trimmed = body.config?.transform_subdir.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('/')) {
        trimmed = '/' + trimmed;
      }
      if (userConfigService.config.transform_subdir !== trimmed) {
        modified = true;
      }
      userConfigService.config.transform_subdir = trimmed;
    }
    if (body.config?.actions_yaml) {
      userConfigService.config.actions_yaml = body.config?.actions_yaml;
    }
    userConfigService.config.auto_sync = !!body.config?.auto_sync;
    userConfigService.config.fm_without_version = !!body.config?.fm_without_version;

    await userConfigService.save();

    if (body.remote_url) {
      await gitScanner.setRemoteUrl(body.remote_url);
    } else
    if (body.remote_url === '') {
      await gitScanner.setRemoteUrl('');
    }

    if (modified) {
      this.engine.emit(driveId, 'toasts:added', {
        title: 'Config modified',
        type: 'tree:changed'
      });
    }

    return {
      ...await this.returnConfig(userConfigService),
      remote_url: await gitScanner.getRemoteUrl()
    };
  }

  @RoutePost('/:driveId/regenerate_key')
  async regenerateKey(@RouteParamPath('driveId') driveId: string) {
    const transformedFileSystem = await this.filesService.getSubFileService(driveId + '_transform', '');

    const gitScanner = new GitScanner(this.logger, transformedFileSystem.getRealPath(), 'wikigdrive@wikigdrive.com');
    await gitScanner.initialize();

    const googleFileSystem = await this.filesService.getSubFileService(driveId, '');
    const userConfigService = new UserConfigService(googleFileSystem);
    await userConfigService.load();

    await userConfigService.genKeys(true);

    return {
      ...await this.returnConfig(userConfigService),
      remote_url: await gitScanner.getRemoteUrl()
    };
  }

  @RoutePost('/:driveId/prune_transform')
  async pruneTransform(@RouteParamPath('driveId') driveId: string) {
    await this.folderRegistryContainer.pruneTransformFolder(driveId);
  }

  @RoutePost('/:driveId/prune_all')
  async pruneAll(@RouteParamPath('driveId') driveId: string) {
    await this.folderRegistryContainer.pruneFolder(driveId);
  }

  @RoutePost('/:driveId/prune_git')
  async pruneGit(@RouteParamPath('driveId') driveId: string) {
    await this.folderRegistryContainer.pruneGitFolder(driveId);
  }


}

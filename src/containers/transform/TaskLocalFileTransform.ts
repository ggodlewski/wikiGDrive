import {QueueTask} from '../google_folder/QueueTask';
import winston from 'winston';
import {FileContentService} from '../../utils/FileContentService';
import {GoogleFile, MimeTypes} from '../../model/GoogleFile';
import {BinaryFile, DrawingFile, LocalFile, MdFile} from '../../model/LocalFile';
import {SvgTransform} from '../../SvgTransform';
import {NavigationHierarchy} from './generateNavigationHierarchy';
import {generateDocumentFrontMatter} from './frontmatters/generateDocumentFrontMatter';
import {generateConflictMarkdown} from './frontmatters/generateConflictMarkdown';
import {OdtProcessor} from '../../odt/OdtProcessor';
import {UnMarshaller} from '../../odt/UnMarshaller';
import {DocumentStyles, LIBREOFFICE_CLASSES} from '../../odt/LibreOffice';
import {OdtToMarkdown} from '../../odt/OdtToMarkdown';
import {LocalLinks} from './LocalLinks';
import {SINGLE_THREADED_TRANSFORM} from './QueueTransformer';
import {JobManagerContainer} from '../job/JobManagerContainer';
import {UserConfig} from '../google_folder/UserConfigService';

export function googleMimeToExt(mimeType: string, fileName: string) {
  switch (mimeType) {
    case MimeTypes.APPS_SCRIPT:
      return 'gs';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/svg+xml':
      return 'svg';
    case 'application/vnd.google-apps.drawing':
      return 'svg';
    case 'application/vnd.google-apps.document':
      return 'odt';
    case 'text/csv':
      return 'csv';
  }

  if (fileName.indexOf('.') > -1) {
    return '';
  }
  return 'bin';
}

export class TaskLocalFileTransform extends QueueTask {
  constructor(protected logger: winston.Logger,
              private jobManagerContainer: JobManagerContainer,
              private realFileName: string,
              private googleFolder: FileContentService,
              private googleFile: GoogleFile,
              private destinationDirectory: FileContentService,
              private localFile: LocalFile,
              private hierarchy: NavigationHierarchy,
              private localLinks: LocalLinks,
              private userConfig: UserConfig
              ) {
    super(logger);

    if (!this.localFile.fileName) {
      throw new Error(`No fileName for: ${this.localFile.id}`);
    }
  }

  async run(): Promise<QueueTask[]> {
    await this.generate(this.localFile, this.hierarchy);

    return [];
  }

  async generateBinary(binaryFile: BinaryFile) {
    await new Promise<void>((resolve, reject) => {
      try {
        const dest = this.destinationDirectory.createWriteStream(this.realFileName);

        dest.on('error', err => {
          reject(err);
        });

        const ext = googleMimeToExt(this.googleFile.mimeType, this.googleFile.name);
        const stream = this.googleFolder.createReadStream(`${binaryFile.id}${ext ? '.' + ext : ''}`)
          .on('error', err => {
            reject(err);
          })
          .pipe(dest);

        stream.on('finish', () => {
          resolve();
        });
        stream.on('error', err => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async generateDrawing(drawingFile: DrawingFile) {
    await new Promise<void>((resolve, reject) => {
      try {
        // await this.destinationDirectory.mkdir(getFileDir(targetPath));
        const dest = this.destinationDirectory.createWriteStream(this.realFileName);
        const svgTransform = new SvgTransform(drawingFile.fileName);
        // const svgPath = this.googleScanner.getFilePathPrefix(drawingFile.id) + '.svg';

        dest.on('error', err => {
          reject(err);
        });

        const stream = this.googleFolder.createReadStream(`${drawingFile.id}.svg`)
          .on('error', err => {
            reject(err);
          })
          .pipe(svgTransform)
          .pipe(dest);

        stream.on('finish', () => {
          this.localLinks.append(drawingFile.id, drawingFile.fileName, Array.from(svgTransform.links));
          resolve();
        });
        stream.on('error', err => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async generateDocument(localFile: MdFile, googleFile: GoogleFile, hierarchy: NavigationHierarchy) {
    let frontMatter;
    let markdown;
    let links = [];
    let errors = [];

    const processor = new OdtProcessor(this.googleFolder, localFile.id, true);
    await processor.load();
    await processor.unzipAssets(this.destinationDirectory, this.realFileName);
    const content = processor.getContentXml();
    const stylesXml = processor.getStylesXml();
    const fileNameMap = processor.getFileNameMap();

    if (SINGLE_THREADED_TRANSFORM) {
      const parser = new UnMarshaller(LIBREOFFICE_CLASSES, 'DocumentContent');
      const document = parser.unmarshal(content);

      const parserStyles = new UnMarshaller(LIBREOFFICE_CLASSES, 'DocumentStyles');
      const styles: DocumentStyles = parserStyles.unmarshal(stylesXml);
      if (!styles) {
        throw Error('No styles unmarshalled');
      }

      const converter = new OdtToMarkdown(document, styles, fileNameMap);
      if (this.realFileName === '_index.md') {
        converter.setPicturesDir('./' + this.realFileName.replace(/.md$/, '.assets/'));
      } else {
        converter.setPicturesDir('../' + this.realFileName.replace(/.md$/, '.assets/'));
      }
      markdown = await converter.convert();
      links = Array.from(converter.links);
      frontMatter = generateDocumentFrontMatter(localFile, hierarchy, links, this.userConfig.fm_without_version);
      errors = converter.getErrors();
      this.warnings = errors.length;
    } else {
      interface WorkerResult {
        links: Array<string>;
        frontMatter: string;
        markdown: string;
        errors: Array<string>;
      }

      const workerResult: WorkerResult = await this.jobManagerContainer.scheduleWorker('OdtToMarkdown', {
        localFile,
        hierarchy,
        realFileName: this.realFileName,
        fileNameMap,
        content,
        stylesXml,
        fm_without_version: this.userConfig.fm_without_version
      });

      links = workerResult.links;
      frontMatter = workerResult.frontMatter;
      markdown = workerResult.markdown;
      errors = workerResult.errors;
      this.warnings = errors.length;
    }

    for (const errorMsg of errors) {
      this.logger.warn('Error in: ['+ this.localFile.fileName +'](' + this.localFile.fileName + ') ' + errorMsg, {
        errorMdFile: this.localFile.fileName,
        errorMdMsg: errorMsg
      });
    }

    await this.destinationDirectory.writeFile(this.realFileName, frontMatter + markdown);
    if (process.env.VERSION === 'dev') {
      await this.destinationDirectory.writeFile(this.realFileName.replace(/.md$/, '.debug.xml'), content);
    }
    this.localLinks.append(localFile.id, localFile.fileName, links);
  }

  async generate(localFile: LocalFile, hierarchy: NavigationHierarchy): Promise<void> {
    try {
      const verStr = this.localFile.version ? ' #' + this.localFile.version : ' ';
      if (localFile.type === 'conflict') {
        this.logger.info('Transforming conflict: ' + this.localFile.fileName);
        const md = generateConflictMarkdown(localFile);
        await this.destinationDirectory.writeFile(this.realFileName, md);
      } else if (localFile.type === 'redir') { // TODO
        this.logger.info('Transforming redir: ' + this.localFile.fileName);
        // const redirectToFile = this.toGenerate.find(f => f.id === localFile.redirectTo);
        // const redirectToFile = this.generatedScanner.getFileById(localFile.redirectTo);
        // const md = generateRedirectMarkdown(localFile, redirectToFile, this.linkTranslator);
        // await this.destinationDirectory.mkdir(getFileDir(targetPath));
        // await this.destinationDirectory.writeFile(targetPath, md);
        // await this.generatedScanner.update(targetPath, md);
      } else if (localFile.type === 'md') {
        this.logger.info('Transforming markdown: ' + this.localFile.fileName + verStr);
        // const googleFile = await this.googleScanner.getFileById(localFile.id);
        // const downloadFile = await this.downloadFilesStorage.findFile(f => f.id === localFile.id);
        if (this.googleFile) { // && downloadFile
          await this.generateDocument(localFile, this.googleFile, hierarchy);
        }
      } else if (localFile.type === 'drawing') {
        this.logger.info('Transforming drawing: ' + this.localFile.fileName + verStr);
        // const googleFile = await this.googleScanner.getFileById(localFile.id);
        // const downloadFile = await this.downloadFilesStorage.findFile(f => f.id === localFile.id);
        if (this.googleFile) { // && downloadFile
          await this.generateDrawing(localFile);
        }
      } else if (localFile.type === 'binary') {
        this.logger.info('Transforming binary: ' + this.localFile.fileName + verStr);
        if (this.googleFile) { // && downloadFile
          await this.generateBinary(localFile);
        }
      }
      this.logger.info('Transformed: ' + this.localFile.fileName + verStr);
    } catch (err) {
      this.logger.error('Error transforming ' + localFile.fileName + ' ' + err.stack ? err.stack : err.message);
    }
  }

}

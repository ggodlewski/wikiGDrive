import * as casual from 'casual';
import * as winston from 'winston';
import {FileContentService} from './utils/FileContentService';
import {QueueObject} from 'async';
import {QueueTask} from './containers/google_folder/QueueTask';

export interface ContainerConfig {
  name?: string;
  [key: string]: string;
}

export interface ContainerConfigArr {
  [key: string]: string[];
}

export class Container {
  protected engine: ContainerEngine;
  protected filesService: FileContentService;

  constructor(public readonly params: ContainerConfig, public readonly paramsArr: ContainerConfigArr = {}) {
    if (!this.params.name) {
      this.params.name = casual.array_of_words(2).join('_');
    }
  }

  async mount(fileService: FileContentService) {
    this.filesService = fileService;
  }

  async init(engine: ContainerEngine): Promise<void> {
    this.engine = engine;
  }

  async run(command) {
    switch (command) {
      case 'scan':
        break;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async destroy(): Promise<void> {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async flushData() {
  }

  getQueue(): QueueObject<QueueTask> {
    return null;
  }
}

export class ContainerError extends Error {
  constructor(msg) {
    super(msg);
  }
}

export class ContainerEngine {
  constructor(public readonly logger: winston.Logger, public readonly rootFileService: FileContentService) {
    process.on('SIGINT', async () => {
      console.log('SIGINT');
      await this.flushData();
      process.exit();
    });
  }

  private readonly containers: { [name: string]: Container } = {};

  async registerContainer(container: Container): Promise<Container> {
    if (this.containers[container.params.name]) {
      throw new ContainerError(`Container already exists: ${container.params.name}`);
    }

    try {
      await container.init(this);
      this.containers[container.params.name] = container;
    } catch (err) {
      this.logger.error(`Error starting container ${container.params.name}`, err);
    }

    return container;
  }

  async unregisterContainer(name: string): Promise<void> {
    const container = this.containers[name];
    if (!container) {
      throw new ContainerError(`No such container: ${name}`);
    }
    await container.destroy();
    delete this.containers[container.params.name];
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async run() {
  }

  getContainer(name: string) {
    if (!this.containers[name]) {
      throw new Error(`Unknown container: ${name}`);
    }
    return this.containers[name];
  }

  async flushData() {
    for (const container of Object.values(this.containers)) {
      await container.flushData();
    }
  }
}

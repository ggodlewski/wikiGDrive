import fs from 'fs';
import path from 'path';
import {spawn} from 'child_process';

import NodeGit from 'nodegit';
const { Cred, Remote, Repository, Revwalk, Signature, Merge } = NodeGit;

async function execAsync(cmd, params: string[] = []) {
  const process = spawn(cmd, params);

  process.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  process.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  await new Promise<void>((resolve, reject) => {
    process.on('exit', (code) => {
      if (code) {
        reject(code);
      } else {
        resolve();
      }
    });
  });
}


export class GitScanner {

  constructor(private rootPath: string, private email: string) {
  }

  async isRepo() {
    try {
      await Repository.open(this.rootPath);
      return true;
    } catch (err) {
      return false;
    }
  }

  async commit(message: string, fileName: string, author_str: string): Promise<string> {
    if (fileName.startsWith('/')) {
      fileName = fileName.substring(1);
    }
    const repo = await Repository.open(this.rootPath);
    const index = await repo.refreshIndex();
    if (fileName) {
      await index.addByPath(fileName);
    } else {
      await index.addAll();
    }
    await index.write();

    const oid = await index.writeTree();
    const parent = await repo.getHeadCommit();

    const parts = author_str.split(/[<>]+/);
    const author_name = parts[0].trim();
    const author_email = parts[1].trim();

    const author = Signature.now(author_name, author_email);
    const committer = Signature.now('WikiGDrive', this.email);

    const parents = [];
    if (parent) {
      parents.push(parent);
    }

    const commitId = await repo.createCommit('HEAD', author, committer, message, oid, parents);
    return commitId.tostrS();
  }

  async push(branch) {
    try {
      const repo = await Repository.open(this.rootPath);

      const publicKey = await this.getDeployKey();
      const privateKey = await this.getDeployPrivateKey();
      const passphrase = 'sekret';

      await repo.fetch('origin', {
        callbacks: {
          credentials: (url, username) => {
            return Cred.sshKeyMemoryNew(username, publicKey, privateKey, passphrase);
          }
        }
      });

      const headCommit = await repo.getReferenceCommit('refs/heads/master');
      const remoteCommit = await repo.getReferenceCommit('refs/remotes/origin/' + branch);

      const index = await Merge.commits(repo, headCommit, remoteCommit, {
        fileFavor: Merge.FILE_FAVOR.OURS
      });

      if (!index.hasConflicts()) {
        const oid = await index.writeTreeTo(repo);
        const committer = Signature.now('WikiGDrive', this.email);
        await repo.createCommit('refs/remotes/origin/' + branch, committer, committer, 'Merge remote repo', oid, [remoteCommit, headCommit]);
        const commit = await repo.getReferenceCommit('refs/remotes/origin/' + branch);
        await NodeGit.Reset.reset(repo, commit, NodeGit.Reset.TYPE.HARD, {});
      }

      const origin = await repo.getRemote('origin');
      const refs = ['refs/heads/master:refs/heads/' + branch];
      await origin.push(refs, {
        callbacks: {
          credentials: (url, username) => {
            return Cred.sshKeyMemoryNew(username, publicKey, privateKey, passphrase);
          }
        }
      });
    } catch (err) {
      console.warn(err.message);
    }
  }

  async getRemoteUrl(): Promise<string> {
    const repo = await Repository.open(this.rootPath);
    try {
      const origin = await repo.getRemote('origin');
      return origin.url();
    } catch (e) {
      return null;
    }
  }

  async setRemoteUrl(url) {
    const repo = await Repository.open(this.rootPath);
    await this.genKeys();
    try {
      await Remote.delete(repo, 'origin');
      // eslint-disable-next-line no-empty
    } catch (ignore) {}
    await Remote.create(repo, 'origin', url);
  }

  async getDeployPrivateKey() {
    const privatePath = path.join(this.rootPath, '.private');
    if (fs.existsSync(`${privatePath}/id_rsa`)) {
      return fs.readFileSync(`${privatePath}/id_rsa`).toString('utf-8');
    }
    return null;
  }

  async getDeployKey() {
    const privatePath = path.join(this.rootPath, '.private');
    if (fs.existsSync(`${privatePath}/id_rsa.pub`)) {
      return fs.readFileSync(`${privatePath}/id_rsa.pub`).toString('utf-8');
    }
    return null;
  }

  async history(fileName: string) {
    if (fileName.startsWith('/')) {
      fileName = fileName.substring(1);
    }

/*
    const s = await this.repository.status({
      file: fileName
    });
    console.log('s', s);
*/

    try {
      const repo = await Repository.open(this.rootPath);
      const firstCommitOnMaster = await repo.getMasterCommit();

      const walker = repo.createRevWalk();
      walker.push(firstCommitOnMaster.id());
      walker.sorting(Revwalk.SORT.TIME);

      const retVal = [];
      const resultingArrayOfCommits = await walker.fileHistoryWalk(fileName, 500);
      resultingArrayOfCommits.forEach(function(entry) {
        const author = entry.commit.author();
        const item = {
          date: entry.commit.date(),
          author_name: author.name() + ' <' + author.email() + '>',
          message: entry.commit.message()
        };
        retVal.push(item);
      });

      return retVal;
    } catch (err) {
      if (err.message.indexOf('does not have any commits yet') > 0) {
        return [];
      }
      console.error(err.message);
      return [];
    }
  }

  async genKeys() {
    const privatePath = path.join(this.rootPath, '.private');
    if (!fs.existsSync(privatePath)) {
      fs.mkdirSync(privatePath);
      if (fs.existsSync(`${privatePath}/id_rsa`)) {
        fs.unlinkSync(`${privatePath}/id_rsa`);
      }
      if (fs.existsSync(`${privatePath}/id_rsa.pub`)) {
        fs.unlinkSync(`${privatePath}/id_rsa.pub`);
      }
      await execAsync('ssh-keygen', ['-t', 'ecdsa', '-b', '521', '-f', `${privatePath}/id_rsa`, '-q',  '-N', 'sekret']);
    }
  }

  async initialize() {
    if (!await this.isRepo()) {
      fs.writeFileSync(path.join(this.rootPath, '.gitignore'), '.private\n');
      await Repository.init(this.rootPath, 0);
      await this.genKeys();
    }
  }
}

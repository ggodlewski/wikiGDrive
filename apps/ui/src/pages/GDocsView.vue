<template>
  <GitCommit v-if="activeTab === 'git_commit'" :folderPath="folderPath" :content-dir="contentDir" :selectedFile="selectedFile" :active-tab="activeTab" />

  <BaseLayout v-else :sidebar="false" :share-email="shareEmail">
    <template v-slot:navbar>
      <NavBar :sidebar="false">
        <NavTabs :folder-path="folderPath" :activeTab="activeTab" :selectedFile="selectedFile" @sync="syncSingle($event.$event, $event.file)">
          <li class="wgd-nav-item" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Preview">
            <a class="position-relative" @click.prevent.stop="setActiveTab('html')" :href="fullDrivePath + '#html'">
              <i class="fa-solid fa-eye"></i>
            </a>
          </li>

          <li class="wgd-nav-item" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Markdown">
            <a class="position-relative" @click.prevent.stop="setActiveTab('markdown')" :href="fullDrivePath + '#markdown'">
              <i class="fa-brands fa-markdown"></i>
            </a>
          </li>
        </NavTabs>
      </NavBar>
    </template>

    <template v-slot:default>
      <NotRegistered v-if="notRegistered" :share-email="shareEmail" />
      <div v-else>
        <div class="card mb-3" v-if="isDocument(selectedFile) || isImage(selectedFile) || isMarkdown(selectedFile)">
          <div class="card-header">Markdown</div>
          <div class="card-body">
            <table class="table table-hover table-clickable table-bordered table-layout-fixed">
              <tbody>
              <tr v-if="selectedFile.path">
                <td>
                  <div class="d-flex" data-bs-toggle="tooltip" data-bs-placement="bottom" :title="selectedFile.path">
                    <strong>Path:&nbsp;</strong>
                    <span class="text-overflow"><span class="small text-muted">{{ selectedFile.path }}</span></span>
                  </div>
                </td>
              </tr>

              <tr v-if="selectedFile.modifiedTime">
                <td class="text-overflow">
                  <strong>Modified: </strong>
                  <span>
                    <span class="small text-muted">{{ selectedFile.modifiedTime }}</span>
                    <div class="small text-muted text-end">
                      <span v-html="agoStr(selectedFile)"></span>
                      <button class="btn btn-white bg-white text-primary btn-sm" v-if="selectedFile.id" @click="syncSingle($event, selectedFile)" title="Sync single">
                        <i class="fa-solid fa-rotate" :class="{'fa-spin': syncing}"></i>
                      </button>
                    </div>
                  </span>
                </td>
              </tr>
              <tr v-if="selectedFile.version">
                <td>
                  <strong>Version: </strong>
                  <span class="small text-muted">#{{ selectedFile.version }}</span>
                </td>
              </tr>
              <tr v-if="selectedFile.lastAuthor">
                <td>
                  <strong>Last author: </strong>
                  <span class="small text-muted text-overflow">{{ selectedFile.lastAuthor }}</span>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card mb-3" v-if="!syncing && change">
          <div class="card-header alert-warning">
            Change available
            <button class="btn btn-white bg-white text-primary btn-sm float-end" v-if="change.id" @click="syncSingle($event, selectedFile)" title="Sync single">
              <i class="fa-solid fa-rotate" :class="{'fa-spin': syncing}"></i>
            </button>
          </div>
          <div class="card-body">
            <table class="table table-hover table-clickable table-bordered table-layout-fixed">
              <tbody>
              <tr v-if="change.modifiedTime">
                <td class="text-overflow">
                  <strong>Modified: </strong>
                  <span>
                    <span class="small text-muted">{{ change.modifiedTime }}</span>
                    <div class="small text-muted text-end">
                      <span v-html="agoStr(change)"></span>
                    </div>
                  </span>
                </td>
              </tr>
              <tr v-if="change.version">
                <td>
                  <strong>Version: </strong>
                  <span class="small text-muted">#{{ change.version }}</span>
                </td>
              </tr>
              <tr v-if="change.lastAuthor">
                <td>
                  <strong>Last author: </strong>
                  <span class="small text-muted">{{ change.lastAuthor }}</span>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card mb-3" v-if="!syncing && untransformed">
          <div class="card-header alert-danger">
            Not transformed
            <button class="btn btn-white bg-white text-primary btn-sm float-end" @click="transformAll" title="Update your entire tree now">
              <i class="fa-solid fa-rotate" :class="{'fa-spin': syncing}"></i>
            </button>
          </div>
          <div class="card-body">
            <table class="table table-hover table-clickable table-bordered table-layout-fixed">
              <tbody>
              <tr v-if="untransformed.modifiedTime">
                <td class="text-overflow">
                  <strong>Modified: </strong>
                  <span>
                    <span class="small text-muted">{{ untransformed.modifiedTime }}</span>
                    <div class="small text-muted text-end">
                      <span v-html="agoStr(untransformed)"></span>
                    </div>
                  </span>
                </td>
              </tr>
              <tr v-if="untransformed.version">
                <td>
                  <strong>Version: </strong>
                  <span class="small text-muted">#{{ untransformed.version }}</span>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card-header d-flex" v-if="!syncing">
          Git
          <ul class="nav flex-row flex-grow-1 flex-shrink-0 justify-content-end">
            <ToolButton
                v-if="gitStats.initialized"
                class="pl-1 p-0"
                :active="activeTab === 'git_log'"
                @click="setActiveTab('git_log')"
                title="History"
                icon="fa-solid fa-timeline">
                  <span class="badge" v-if="gitStats.headAhead > 0">
                    {{ gitStats.headAhead }} commits ahead remote
                  </span>
              <span class="badge" v-if="gitStats.headAhead < 0">
                    {{ -gitStats.headAhead }} commits behind remote
                  </span>
            </ToolButton>

            <ToolButton
                v-if="gitStats.initialized"
                class="pl-1 p-0"
                :active="activeTab === 'git_commit'"
                @click="setActiveTab('git_commit')"
                title="Commit"
                icon="fa-solid fa-code-commit" >
                  <span class="badge" v-if="gitStats.unstaged > 0">
                    {{ gitStats.unstaged }} unstaged files
                  </span>
            </ToolButton>

            <ToolButton
                v-if="github_url"
                class="pl-1 p-0"
                :href="github_url"
                target="github"
                title="GitHub"
                icon="fa-brands fa-github"
            />
          </ul>
        </div>
        <GitFooter class="mt-3 mb-3" v-if="!syncing">
          <div v-if="selectedFile.status">
            <div class="input-groups">
              <textarea v-grow class="form-control" placeholder="Commit message" v-model="commitMsg"></textarea>
            </div>
          </div>
          <div v-if="selectedFile.status" class="mb-3">
            <button v-if="git_remote_url" type="button" class="btn btn-primary" @click="commitSinglePush"><i v-if="active_jobs.length > 0" class="fa-solid fa-rotate fa-spin"></i> Commit &amp; push</button>
            <button type="button" class="btn btn-primary" @click="commitSingle">Commit</button>
          </div>
        </GitFooter>

        <div class="card">
          <div class="card-header">Backlinks</div>
          <div class="card-body">
            <BackLinks :selectedFile="selectedFile" :contentDir="contentDir">
              <template v-slot:header><span></span></template>
            </BackLinks>
          </div>
        </div>
      </div>
    </template>
  </BaseLayout>
</template>
<script lang="js">
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {DEFAULT_TAB, UiMixin} from '../components/UiMixin.ts';
import {disableElement, UtilsMixin} from '../components/UtilsMixin.ts';
import {GitMixin} from '../components/GitMixin.ts';
import BaseLayout from '../layout/BaseLayout.vue';
import NotRegistered from './NotRegistered.vue';
import NavBar from '../components/NavBar.vue';
import NavTabs from '../components/NavTabs.vue';
import GitCommit from '../components/GitCommit.vue';
import BackLinks from '../components/BackLinks.vue';
import GitFooter from '../components/GitFooter.vue';
import ToolButton from '../components/ToolButton.vue';

dayjs.extend(relativeTime);

export default {
  name: 'GDocsView',
  mixins: [UtilsMixin, UiMixin, GitMixin],
  components: {
    NavBar,
    NavTabs,
    BackLinks,
    BaseLayout,
    NotRegistered,
    GitCommit,
    GitFooter,
    ToolButton
  },
  data() {
    return {
      untransformed: null,
      commitMsg: '',
      activeTab: DEFAULT_TAB,
      folderPath: '',
      contentDir: '',
      selectedFile: {},
      selectedFolder: {},
      notRegistered: false,
      logsState: {
        from: undefined,
        until: undefined
      },
      agoStr: (val) => { // For some reason displays "[object Promise]" while used as method on PROD
        if (!val || !val.modifiedTime) {
          return '';
        }
        return '(' + dayjs().to(dayjs(val.modifiedTime)) + ')';
      }
    };
  },
  created() {
    this.fetch();
  },
  computed: {
    change() {
      if (!this.selectedFile) {
        return null;
      }
      return this.changes.find(change => change.id === this.selectedFile.id);
    },
    git_remote_url() {
      return this.gitStats.remote_url || '';
    },
    fullDrivePath() {
      if (this.isAddon) {
        if ('undefined' !== typeof this.selectedFile?.fileName) {
          return '/drive/' + this.driveId + this.folderPath + this.selectedFile?.fileName;
        } else {
          return '/drive/' + this.driveId + this.folderPath;
        }
      }
      return '';
    },
    jobs() {
      return this.$root.jobs || [];
    },
    active_jobs() {
      return this.jobs.filter(job => ['waiting', 'running'].includes(job.state));
    }
  },
  watch: {
    async $route() {
      await this.fetch();
      this.activeTab = this.$route.hash.replace(/^#/, '') || DEFAULT_TAB;
    },
    async active_jobs() {
      await this.fetch();
    }
  },
  mounted() {
    this.activeTab = this.$route.hash.replace(/^#/, '') || DEFAULT_TAB;
  },
  methods: {
    async commitSinglePush(event) {
      if (!await this.commitSingle()) {
        return;
      }
      await this.push(event);
    },
    async commitSingle() {
      if (!this.commitMsg) {
        alert('No commit message');
        return false;
      }

      const folderPath = this.folderPath.endsWith('/') ? this.folderPath : this.folderPath + '/';
      const filePath = folderPath + this.selectedFile.fileName;

      await this.commit({
        message: this.commitMsg,
        filePath
      });
      this.commitMsg = '';
      return true;
    },
    async push(event) {
      await disableElement(event, async () => {
        await this.authenticatedClient.fetchApi(`/api/git/${this.driveId}/push`, {
          method: 'post',
          headers: {
            'Content-type': 'application/json'
          },
          body: JSON.stringify({})
        });
      });
    },
    async fetch() {
      await this.fetchFileById();
    },
    async fetchFileById() {
      const fileId = this.$route.params.fileId;

      this.untransformed = null;

      if (fileId) {
        try {
          const response = await this.authenticatedClient.fetchApi(`/api/gdrive/${this.driveId}/${fileId}`);

          const path = response.headers.get('wgd-path') || '';
          const fileName = response.headers.get('wgd-file-name') || '';

          const contentDir = (response.headers.get('wgd-content-dir') || '/').replace(/\/$/, '');
          this.folderPath = contentDir + path.substring(0, path.length - fileName.length);
          this.contentDir = contentDir;
          this.selectedFile = {
            id: fileId,
            fileName,
            path,
            folderId: response.headers.get('wgd-google-parent-id'),
            version: response.headers.get('wgd-google-version'),
            modifiedTime: response.headers.get('wgd-google-modified-time'),
            fileId: response.headers.get('wgd-google-id'),
            mimeType: response.headers.get('wgd-mime-type'),
            previewUrl: response.headers.get('wgd-preview-url'),
            status: response.headers.get('wgd-git-status'),
            lastAuthor: response.headers.get('wgd-last-author')
          };

          if (response.headers.get('wgd-synced-modified-time')) {
            if (response.headers.get('wgd-synced-modified-time') !== response.headers.get('wgd-google-modified-time') ||
                response.headers.get('wgd-synced-version') !== response.headers.get('wgd-google-version')) {
              this.untransformed = {
                version: response.headers.get('wgd-synced-version'),
                modifiedTime: response.headers.get('wgd-synced-modified-time'),
              };
            }
          }

          this.notRegistered = false;
        } catch (err) {
          if (err.code === 404) {
            this.shareEmail = err.share_email;
            this.notRegistered = true;
          }
        }
      }
    }
  }
};
</script>

'use strict';

import {FileClientService} from './services/FileClientService.mjs';
import {DriveClientService} from './services/DriveClientService.mjs';
import {GitClientService} from './services/GitClientService.mjs';

import * as Vue from 'vue';
import * as VueRouter from 'vue-router';

import App from './App.vue';
import {AuthenticatedClient} from "./services/AuthenticatedClient.mjs";

const app = Vue.createApp({
  data: {
    drive: {},
    jobs: [],
    changes: []
  },
  components: {
    'App': App
  },
  template: '<App />',
  methods: {
    async changeDrive(toDriveId) {
      this.drive = await vm.DriveClientService.changeDrive(toDriveId, vm);
      const titleEl = document.querySelector('title');
      if (titleEl) {
        if (this.drive?.name) {
          titleEl.innerText = this.drive?.name + ' - wikigdrive';
        } else {
          titleEl.innerText = 'wikigdrive';
        }
      }
    },
    setJobs(jobs) {
      this.jobs = jobs;
    },
    setChanges(jobs) {
      this.changes = jobs;
    }
  }
});

app.mixin({
  data() {
    const authenticatedClient = new AuthenticatedClient();
    return {
      authenticatedClient,
      DriveClientService: new DriveClientService(authenticatedClient),
      FileClientService: new FileClientService(authenticatedClient),
      GitClientService: new GitClientService(authenticatedClient)
    }
  }
});

const router = new VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes: [
    {
      path: '/drive/',
      name: 'drives',
      component: () => import('./pages/DrivesView.vue'),
    },
    {
      path: '/drive/:driveId*',
      name: 'drive',
      component: () => import('./pages/FolderView.vue')
    },
    {
      path: '/gdocs/:driveId/:fileId',
      name: 'gdocs',
      component: () => import('./pages/GDocsView.vue')
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('./pages/LogsView.vue')
    },
    {
      path: '/',
      component: () => import('./pages/MainView.vue')
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('./pages/NotFound.vue')
    }
  ]
});

app.use(router);

const vm = app.mount('#app');

router.beforeEach(async (to, from, next) => {
  const toDriveId = Array.isArray(to.params?.driveId) ? to.params.driveId[0] : to.params.driveId;
  const fromDriveId = Array.isArray(from.params?.driveId) ? from.params.driveId[0] : from.params.driveId;
  if (toDriveId !== fromDriveId) {
    await vm.changeDrive(toDriveId);
  }
  next();
});

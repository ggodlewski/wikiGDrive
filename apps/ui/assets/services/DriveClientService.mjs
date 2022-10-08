export class DriveClientService {

  constructor(authenticatedClient) {
    this.authenticatedClient = authenticatedClient;
  }

  async getDrives() {
    const response = await this.authenticatedClient.fetchApi(`/api/drive`);
    return response.json();
  }

  async changeDrive(driveId, vm) {
    this.vm = vm;
    const oldDrive = this.driveId;
    this.driveId = driveId;
    if (oldDrive !== driveId) {
      await this.connectSocket(this.driveId)
    }
    if (!driveId) {
      return {};
    }
    const response = await this.authenticatedClient.fetchApi(`/api/drive/${driveId}`);

    const drive = await response.json();
    drive.GIT_SHA = this.authenticatedClient.GIT_SHA;
    return drive;
  }

  connectSocket(driveId) {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (!driveId) {
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${wsProtocol}//${window.location.host}/api/${driveId}`);
    this.socket.onopen = () => {
    };

    this.socket.onmessage = (event) => {
      const json = JSON.parse(event.data);

      if (!this.vm) {
        return;
      }

      switch (json.cmd) {
        case 'jobs:changed':
          this.vm.setJobs(json.payload?.jobs || []);
          break;
        case 'changes:changed':
          this.vm.setChanges(json.payload || []);
          break;
      }
    }

    this.socket.onclose = () => {
      setTimeout(() => {
        this.connectSocket(this.driveId);
      }, 1000);
    }
  }

}

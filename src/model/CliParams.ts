import {LinkMode} from './model';

export interface CliParams {
  link_mode: LinkMode;
  workdir: string;
  drive_id: string;
  drive: string;
  command: string;
  args: string[];
  debug: string[];
  force: boolean;

  client_id?: string;
  client_secret?: string;
  service_account?: string;
  git_update_delay: number;
  server_port?: number;
  share_email?: string;
}

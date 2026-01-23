import * as gelfPro from 'gelf-pro';

gelfPro.setConfig({
  adapterOptions: {
    host: '34.18.48.21',
    port: 12201,
    protocol: 'udp4',
  },
  fields: {
    app_name: 'LMS-BE',
    profile: 'prod',
    app_port: '3009'
  }
});

export default gelfPro;

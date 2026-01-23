import { DataSource } from 'typeorm';
import config from './Config';

const mongoUrl = config.mongo.url.endsWith('/')
  ? `${config.mongo.url}${config.mongo.database}`
  : `${config.mongo.url}/${config.mongo.database}`;

export const AppDataSource = new DataSource({
  type: 'mongodb',
  url: mongoUrl,
  entities: [__dirname + '/../domain/*.{ts,js}'],
  synchronize: false,
  logging: config.env === 'development',
});

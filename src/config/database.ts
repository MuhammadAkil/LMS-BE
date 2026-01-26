import { DataSource } from 'typeorm';
import config from './Config';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: config.mysql.host,
  port: config.mysql.port,
  username: config.mysql.username,
  password: config.mysql.password,
  database: config.mysql.database,
  entities: [__dirname + '/../domain/**/*.{ts,js}'],
  synchronize: false, // Set to true only for development, not for production
  logging: config.env === 'development',
  timezone: '+00:00', // UTC timezone
  connectorPackage: 'mysql2',
});

export async function initializeDatabase(): Promise<void> {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('MySQL Database connection established successfully');
    }
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  }
}

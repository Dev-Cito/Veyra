import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source.options.js';

// Entry point for the TypeORM CLI (see the `typeorm` script in package.json).
export default new DataSource(buildDataSourceOptions());

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from './database-options';

// ---------------------------------------------
// Fonte de dados compartilhada pela aplicação e CLI
// ---------------------------------------------
export const dataSourceOptions = createDataSourceOptions(process.env);

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;

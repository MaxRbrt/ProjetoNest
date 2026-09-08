import 'dotenv/config';
import { DataSource } from 'typeorm';
import { criarOpcoesDaFonteDeDados } from './opcoes-do-banco';

// ---------------------------------------------
// Fonte de dados compartilhada pela aplicação e CLI
// ---------------------------------------------
export const opcoesDaFonteDeDados = criarOpcoesDaFonteDeDados(process.env);

const dataSource = new DataSource(opcoesDaFonteDeDados);
export default dataSource;

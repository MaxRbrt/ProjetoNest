import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailMontado,
  montarRecuperacaoDeSenha,
  montarVerificacaoDeEmail,
} from './conteudo-do-email';
import {
  AuthEmailInput,
  EmailDeAutenticacaoService,
} from './email-de-autenticacao.service';

const PASTA = '.emails-dev';

@Injectable()
export class ArquivoEmailService extends EmailDeAutenticacaoService {
  private readonly logger = new Logger(ArquivoEmailService.name);
  private readonly destino = resolve(process.cwd(), PASTA);
  private readonly frontendUrl: string;

  constructor(config: ConfigService) {
    super();
    this.frontendUrl = config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
  }

  // ---------------------------------------------
  // Envio de verificação de email
  // ---------------------------------------------
  enviarVerificacaoDeEmail(input: AuthEmailInput): Promise<void> {
    return this.gravar(montarVerificacaoDeEmail(input, this.frontendUrl));
  }

  // ---------------------------------------------
  // Envio de recuperação de senha
  // ---------------------------------------------
  enviarRedefinicaoDeSenha(input: AuthEmailInput): Promise<void> {
    return this.gravar(montarRecuperacaoDeSenha(input, this.frontendUrl));
  }

  // ---------------------------------------------
  // Gravação em disco no lugar do envio
  // Substitui o provedor real em desenvolvimento, onde a conta do Resend em
  // domínio de teste só entrega para o próprio dono e qualquer outro
  // destinatário volta 403. O HTML vai para um arquivo que pode ser aberto no
  // navegador, e o link sai no log para completar o fluxo sem abrir o arquivo.
  //
  // O link é credencial: quem o tem verifica a conta ou troca a senha. Por
  // isso a validação de ambiente recusa este provedor com NODE_ENV=production,
  // e a pasta está no .gitignore — token em claro não pode chegar num commit.
  // ---------------------------------------------
  private async gravar(email: EmailMontado): Promise<void> {
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const caminho = join(this.destino, `${carimbo}-${email.arquivo}.html`);

    await mkdir(this.destino, { recursive: true });
    await writeFile(caminho, email.html, 'utf8');

    this.logger.log(`Email gravado em ${caminho}`);
    this.logger.log(`Link: ${email.url}`);
  }
}

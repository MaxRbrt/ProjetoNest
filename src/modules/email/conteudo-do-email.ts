import { AuthEmailInput } from './email-de-autenticacao.service';

export interface EmailMontado {
  subject: string;
  html: string;
  idempotencyKey: string;
  arquivo: string;
  url: string;
}

// ---------------------------------------------
// Identidade visual do email
// Mesma paleta do frontend (marca escura, acento laranja, cantos
// arredondados), para que o email pareça vir do mesmo produto que a tela de
// login. Layout em tabelas, não em div/flex: é o único jeito de um email
// renderizar de forma previsível em clientes como o Outlook desktop, que
// ignora boa parte do CSS moderno.
// ---------------------------------------------
const COR_MARCA = '#10233f';
const COR_ACENTO = '#ea580c';
const COR_TINTA = '#0f172a';
const COR_TINTA_SUAVE = '#475569';
const COR_TINTA_FRACA = '#94a3b8';
const COR_FUNDO = '#f1f5f9';

// ---------------------------------------------
// Verificação de email
// O caminho é "verificar-email" (PT-BR), casado com a rota real do frontend —
// não "verify-email": um link para uma rota inexistente caía no catch-all da
// SPA e devolvia o usuário à tela de login sem nunca chamar a API, fazendo a
// conta parecer verificada quando não estava.
// ---------------------------------------------
export function montarVerificacaoDeEmail(
  input: AuthEmailInput,
  frontendUrl: string,
): EmailMontado {
  return montar({
    input,
    frontendUrl,
    subject: 'Confirme seu email',
    path: 'verificar-email',
    idempotencyPrefix: 'verify-email',
    arquivo: 'verificacao',
    linkText: 'Confirmar email',
    descricao:
      'Falta só confirmar seu email para começar a usar sua conta. ' +
      'O link abaixo vale por 24 horas.',
  });
}

// ---------------------------------------------
// Recuperação de senha
// ---------------------------------------------
export function montarRecuperacaoDeSenha(
  input: AuthEmailInput,
  frontendUrl: string,
): EmailMontado {
  return montar({
    input,
    frontendUrl,
    subject: 'Redefina sua senha',
    path: 'redefinir-senha',
    idempotencyPrefix: 'reset-password',
    arquivo: 'recuperacao',
    linkText: 'Redefinir senha',
    descricao:
      'Recebemos um pedido para redefinir sua senha. Se foi você, o link ' +
      'abaixo vale por 15 minutos. Se não foi, pode ignorar este email.',
  });
}

// ---------------------------------------------
// Montagem comum das duas mensagens
// O token vai no fragmento da URL: fragmento fica no navegador e não é enviado
// pelo HTTP ao servidor que entrega a página, o que reduz a exposição do token
// em logs de acesso. A chave de idempotência impede que repetir a mesma ação
// após uma falha transitória gere múltiplos emails para o usuário.
// ---------------------------------------------
function montar(opcoes: {
  input: AuthEmailInput;
  frontendUrl: string;
  subject: string;
  path: string;
  idempotencyPrefix: string;
  arquivo: string;
  linkText: string;
  descricao: string;
}): EmailMontado {
  const url = `${opcoes.frontendUrl}/${opcoes.path}#token=${encodeURIComponent(
    opcoes.input.rawToken,
  )}`;

  return {
    subject: opcoes.subject,
    html: montarHtml(opcoes.subject, opcoes.descricao, url, opcoes.linkText),
    idempotencyKey: `${opcoes.idempotencyPrefix}/${opcoes.input.actionTokenId}`,
    arquivo: opcoes.arquivo,
    url,
  };
}

// ---------------------------------------------
// Corpo HTML da mensagem
// ---------------------------------------------
function montarHtml(
  titulo: string,
  descricao: string,
  url: string,
  textoDoBotao: string,
): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:${COR_FUNDO};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COR_FUNDO};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background-color:${COR_MARCA};padding:20px 32px;">
                <span style="display:inline-block;background-color:${COR_ACENTO};color:#ffffff;font-weight:bold;padding:4px 10px;border-radius:6px;font-size:13px;">NX</span>
                <span style="color:#ffffff;font-weight:bold;font-size:16px;margin-left:8px;">Catálogo</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${COR_TINTA};">${titulo}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:${COR_TINTA_SUAVE};">${descricao}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:${COR_ACENTO};">
                      <a href="${url}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${textoDoBotao}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${COR_TINTA_FRACA};">
                  Se o botão não funcionar, copie e cole este link no navegador:<br />
                  <a href="${url}" style="color:${COR_TINTA_FRACA};word-break:break-all;">${url}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

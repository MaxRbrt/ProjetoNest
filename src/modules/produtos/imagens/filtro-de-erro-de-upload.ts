import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';

// ---------------------------------------------
// Limite de upload com mensagem em PT-BR
// O FileInterceptor transforma o MulterError em PayloadTooLargeException
// antes de chegar aos filtros. O Nest já responde 413; este filtro mantém
// esse status e define a mensagem em PT-BR sem depender do texto do multer.
// ---------------------------------------------
@Catch(PayloadTooLargeException)
export class FiltroDeErroDeUpload implements ExceptionFilter {
  catch(_erro: PayloadTooLargeException, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    resposta.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'A imagem excede o limite de 2 MB.',
      error: 'Payload Too Large',
    });
  }
}

import 'reflect-metadata';
import 'source-map-support/register';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('PayLedger')
      .setDescription(
        'Wallet balances are derived from balanced double-entry ledger lines. Amounts are integer minor units.',
      )
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'Idempotency-Key')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`PayLedger API listening on ${port}`, 'Bootstrap');
}

void bootstrap();

import { getMetadataArgsStorage } from 'routing-controllers';
import { routingControllersToSpec } from 'routing-controllers-openapi';
import * as path from 'path';
import * as swaggerUI from 'swagger-ui-express';
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import Config from './Config';

export function initializeSwagger(app: any): void {

  const schemas: Record<string, any> = validationMetadatasToSchemas({
    refPointerPrefix: '#/components/schemas/',
  })
  const storage = getMetadataArgsStorage();


  const swaggerDoc = routingControllersToSpec(
    storage,
    {
      controllers: [path.join(__dirname, '../controller/**/*.{ts,js}')],
      routePrefix: Config.server.routingPrefix,
    },
    {
      components: {
        schemas,
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      info: {
        description: 'LMS BE microservice',
        title: 'LMS BE microservice',
        version: '1.0.0',
      },
    }
  );

  app.use('/docs', swaggerUI.serve, swaggerUI.setup(swaggerDoc));
}

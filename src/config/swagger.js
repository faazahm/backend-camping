const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Camping Booking API',
      version: '1.0.0',
      description: 'Dokumentasi API untuk Aplikasi Booking Camping',
      contact: {
        name: 'Backend Developer',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Path ke file yang berisi anotasi swagger
  apis: ['./src/routes/*.js', './src/routes/**/*.js'], 
};

const specs = swaggerJsdoc(options);

module.exports = specs;

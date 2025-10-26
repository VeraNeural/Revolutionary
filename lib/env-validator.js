const Joi = require('joi');
const logger = require('./logger');

class EnvValidator {
  constructor() {
    this.schema = Joi.object({
      // Node environment
      NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
      PORT: Joi.number()
        .port()
        .default(8080),

      // Database
      DATABASE_URL: Joi.string()
        .uri()
        .optional(),
      
      DATABASE_PUBLIC_URL: Joi.string()
        .uri()
        .optional(),

      // API Keys
      ANTHROPIC_API_KEY: Joi.string()
        .pattern(/^sk-ant-/)
        .required()
        .messages({
          'string.pattern.base': 'ANTHROPIC_API_KEY must start with sk-ant-'
        }),

      // Session
      SESSION_SECRET: Joi.string()
        .min(32)
        .required()
        .messages({
          'string.min': 'SESSION_SECRET should be at least 32 characters long'
        }),

      // Stripe
      STRIPE_SECRET_KEY: Joi.string()
        .pattern(/^sk_(test|live)_/)
        .optional(),
      
      STRIPE_WEBHOOK_SECRET: Joi.string()
        .pattern(/^whsec_/)
        .optional(),

      // App URL
      APP_URL: Joi.string()
        .uri()
        .optional(),

      // Optional settings
      DEBUG_VERA: Joi.number()
        .valid(0, 1)
        .default(0),
      
      VERA_MAX_IMAGE_ATTACHMENTS: Joi.number()
        .min(1)
        .max(10)
        .default(3),
      
      VERA_MAX_IMAGE_BYTES: Joi.number()
        .min(1024 * 1024) // 1MB
        .max(10 * 1024 * 1024) // 10MB
        .default(5 * 1024 * 1024) // 5MB
    }).or('DATABASE_URL', 'DATABASE_PUBLIC_URL'); // At least one database URL required
  }

  validate(env = process.env) {
    const { error, value } = this.schema.validate(env, {
      abortEarly: false,
      allowUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        variable: detail.path[0],
        message: detail.message
      }));

      logger.error('Environment validation failed', { details });
      
      throw new Error(
        'Invalid environment configuration:\n' +
        details.map(d => `  • ${d.variable}: ${d.message}`).join('\n')
      );
    }

    // Apply validated values back to process.env
    Object.assign(process.env, value);

    logger.info('Environment validation passed', {
      nodeEnv: value.NODE_ENV,
      port: value.PORT
    });

    return value;
  }

  // Helper to check specific variable
  validateVar(name, value) {
    const schema = this.schema.extract(name);
    if (!schema) {
      throw new Error(`Unknown environment variable: ${name}`);
    }

    const { error, value: validated } = schema.validate(value);
    if (error) {
      throw new Error(`Invalid ${name}: ${error.message}`);
    }

    return validated;
  }
}

module.exports = new EnvValidator();
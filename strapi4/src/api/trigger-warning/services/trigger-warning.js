'use strict'

const { createCoreService } = require('@strapi/strapi').factories

module.exports = createCoreService('api::trigger-warning.trigger-warning')
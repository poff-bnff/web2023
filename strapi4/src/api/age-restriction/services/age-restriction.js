'use strict'

const { createCoreService } = require('@strapi/strapi').factories

module.exports = createCoreService('api::age-restriction.age-restriction')
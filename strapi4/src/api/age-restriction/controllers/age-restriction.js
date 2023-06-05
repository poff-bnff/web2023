'use strict'

const { createCoreController } = require('@strapi/strapi').factories

module.exports = createCoreController('api::age-restriction.age-restriction')
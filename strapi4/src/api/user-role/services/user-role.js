'use strict'

const { createCoreService } = require('@strapi/strapi').factories

module.exports = createCoreService('api::user-role.user-role')
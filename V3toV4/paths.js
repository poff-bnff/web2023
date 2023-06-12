'use strinct'

const path = require('path')

const STRAPI3_ROOT = path.join(__dirname, '..', '..', 'web2021')
const STRAPI3_COLLECTIONS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'api')
const STRAPI3_COMPONENTS_PATH = path.join(STRAPI3_ROOT, 'strapi', 'strapi-development', 'components')
const STRAPI3_DATAMODEL_PATH = path.join(STRAPI3_ROOT, 'ssg', 'docs', 'datamodel.yaml')

const STRAPI4_ROOT = path.join(__dirname, '..', '..', 'web2023')
const STRAPI4_API_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'api')
const STRAPI4_COMPONENT_PATH = path.join(STRAPI4_ROOT, 'strapi4', 'src', 'components')

module.exports = {
    STRAPI3_ROOT,
    STRAPI4_ROOT,

    STRAPI3_COLLECTIONS_PATH,
    STRAPI3_COMPONENTS_PATH,
    STRAPI3_DATAMODEL_PATH,

    STRAPI4_API_PATH,
    STRAPI4_COMPONENT_PATH,
}
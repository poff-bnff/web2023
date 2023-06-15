'use strinct'

const {
    STRAPI3_COLLECTIONS_PATH,
    STRAPI3_COMPONENTS_PATH,
  
    STRAPI4_API_PATH,
    STRAPI4_COMPONENT_PATH,
  
    STRAPI3_DATAMODEL_PATH
  } = require('./paths.js')
  
const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

// read strapi3 datamodel.yaml, where all relevant collections
// are listed and hierarchically organized
const s3datamodel = yaml.load(fs.readFileSync(STRAPI3_DATAMODEL_PATH, 'utf8'))
const relevantCollectionNames = Object.keys(s3datamodel)
  .map(collectionName => s3datamodel[collectionName])
  .filter(collection => collection._path)
  .map(collection => collection._path.replace(/-/g, '_').split('/')[1])

// check if collection is present in curated datamodel.yaml file
const isCollectionRelevant = (collectionName) => relevantCollectionNames.includes(collectionName)

const isModelPathRelevant = (modelName) => {
  const s3model_path = path.join(STRAPI3_COLLECTIONS_PATH, modelName, 'models', `${modelName}.settings.json`)
  const s3model = yaml.load(fs.readFileSync(s3model_path, 'utf8'))
  if (isCollectionRelevant(s3model.collectionName)) {
    return true
  }
  if (s3model.info.name in s3datamodel) {
    return true
  }
  return false
}

// pluralize. also make kebab-case
const pluralize = (singular) => {
    const kebab = singular.toLowerCase().replace(/_/g, '-')
    if (kebab.endsWith('s')) {
      return `${kebab}es`
    }
    if (kebab.endsWith('y')) {
      return `${kebab.slice(0, -1)}ies`
    }
    return `${kebab}s`
  }

module.exports = {
    s3datamodel,
    isCollectionRelevant,
    isModelPathRelevant,
    pluralize,
}